/**
 * BullMQ detection processing worker.
 *
 * Transforms ACRCloud broadcast monitoring callbacks into Detection records
 * and deduplicates them into AirplayEvent aggregates using multi-layer matching:
 *   1. Exact ISRC match
 *   2. ISRC prefix match (first 9 chars — same recording, different version)
 *   3. Exact normalized title+artist match
 *   4. Fuzzy title+artist match (Jaro-Winkler)
 *
 * Uses per-station Redis locks to prevent race conditions during dedup.
 */

import { Worker, Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { normalizeTitle, normalizeArtist } from "../lib/normalization.js";
import { filterDetection } from "../lib/false-positive-filter.js";
import { isFuzzyMatch } from "../lib/fuzzy-match.js";
import {
  CHANNELS,
  BACKFILL_KEY,
  BACKFILL_MAX,
  type LiveDetectionEvent,
} from "../lib/pubsub.js";
import {
  DETECTION_GAP_TOLERANCE_MS,
  DETECTION_QUEUE,
} from "@myfuckingmusic/shared";
import pino from "pino";

const logger = pino({ name: "detection-worker" });

// ---- Module-scope snippet queue reference ----
let _snippetQueue: Queue | null = null;

// ---- Per-station lock ----
const LOCK_TTL_MS = 10_000; // 10s lock TTL

async function acquireStationLock(stationId: number): Promise<boolean> {
  const key = `dedup-lock:${stationId}`;
  const result = await redis.set(key, "1", "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseStationLock(stationId: number): Promise<void> {
  const key = `dedup-lock:${stationId}`;
  await redis.del(key);
}

async function withStationLock<T>(
  stationId: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Retry acquiring lock up to 50 times (500ms total)
  let acquired = false;
  for (let i = 0; i < 50; i++) {
    acquired = await acquireStationLock(stationId);
    if (acquired) break;
    await new Promise((r) => setTimeout(r, 10));
  }

  if (!acquired) {
    logger.warn({ stationId }, "Failed to acquire station lock after retries");
    // Proceed without lock rather than dropping the detection
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      await releaseStationLock(stationId);
    }
  }
}

// ---- Types ----

interface AcrCloudMusicResult {
  title: string;
  artists: Array<{ name: string }>;
  album?: { name?: string };
  label?: string;
  duration_ms: number;
  score: number;
  acrid: string;
  external_ids?: {
    isrc?: string | string[];
  };
  external_metadata?: {
    spotify?: { track?: { id?: string } };
    deezer?: { track?: { id?: string; preview?: string } };
    youtube?: { vid?: string };
  };
}

interface AcrCloudCallbackBody {
  stream_id: string;
  stream_url?: string;
  stream_name?: string;
  status: number;
  data: {
    status: { msg: string; code: number; version?: string };
    result_type?: number;
    metadata?: {
      music?: AcrCloudMusicResult[];
      timestamp_utc: string;
      played_duration?: number;
    };
  };
}

// ---- Helpers ----

function normalizeIsrc(
  isrc: string | string[] | undefined | null,
): string | null {
  if (Array.isArray(isrc)) {
    return isrc[0] ?? null;
  }
  if (typeof isrc === "string") {
    return isrc;
  }
  return null;
}

// ---- Core Processor ----

export async function processCallback(
  callback: AcrCloudCallbackBody,
): Promise<void> {
  const { stream_id, data } = callback;

  // 1. Station lookup
  const station = await prisma.station.findFirst({
    where: { acrcloudStreamId: stream_id },
  });

  if (!station) {
    logger.warn({ stream_id }, "Unknown ACRCloud stream ID, discarding");
    return;
  }

  // 2. No-match check
  if (data.status.code === 1001 || !data.metadata?.music?.length) {
    await prisma.noMatchCallback.create({
      data: {
        stationId: station.id,
        callbackAt: new Date(data.metadata?.timestamp_utc ?? new Date()),
        statusCode: data.status.code,
      },
    });
    // Still update heartbeat on no-match
    await prisma.station.update({
      where: { id: station.id },
      data: { lastHeartbeat: new Date(data.metadata?.timestamp_utc ?? new Date()) },
    });
    return;
  }

  // 3. Process each music result
  const timestampUtc = data.metadata!.timestamp_utc;
  const detectedAt = new Date(timestampUtc);

  const MIN_CONFIDENCE = 70;

  for (const music of data.metadata!.music!) {
    if (music.score < MIN_CONFIDENCE) {
      logger.debug({ score: music.score, title: music.title }, "Low confidence, skipping");
      continue;
    }

    const artistName = music.artists[0]?.name ?? "Unknown";
    const isrc = normalizeIsrc(music.external_ids?.isrc);

    // --- False positive filter ---
    const filterResult = filterDetection(music.title, artistName, music.score, isrc);
    if (filterResult.filtered) {
      logger.debug(
        { title: music.title, artist: artistName, reason: filterResult.reason },
        "Filtered as false positive",
      );
      continue;
    }

    const confidence = music.score / 100;
    const rawCallbackId = `${stream_id}-${timestampUtc}`;

    const albumTitle = music.album?.name ?? null;
    const label = music.label ?? null;
    const playedDuration = data.metadata?.played_duration ?? null;
    const deezerUrl = music.external_metadata?.deezer?.track?.preview ?? null;
    const spotifyId = music.external_metadata?.spotify?.track?.id ?? null;
    const youtubeId = music.external_metadata?.youtube?.vid ?? null;

    // Insert Detection record
    try {
      await prisma.detection.create({
        data: {
          stationId: station.id,
          detectedAt,
          songTitle: music.title,
          artistName,
          albumTitle: music.album?.name ?? null,
          isrc,
          confidence,
          durationMs: music.duration_ms,
          rawCallbackId,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as Record<string, unknown>).code === "P2002"
      ) {
        logger.debug({ rawCallbackId }, "Duplicate detection callback, skipping");
        continue;
      }
      throw err;
    }

    // --- Deduplication with per-station lock ---
    await withStationLock(station.id, async () => {
      const cutoff = new Date(detectedAt.getTime() - DETECTION_GAP_TOLERANCE_MS);
      let recentEvent;

      // Layer 1: Exact ISRC match
      if (isrc) {
        recentEvent = await prisma.airplayEvent.findFirst({
          where: {
            stationId: station.id,
            isrc,
            endedAt: { gte: cutoff },
          },
          orderBy: { endedAt: "desc" },
        });
      }

      // Layer 2: ISRC prefix match (first 9 chars = same recording)
      if (!recentEvent && isrc && isrc.length >= 9) {
        const isrcPrefix = isrc.substring(0, 9);
        recentEvent = await prisma.airplayEvent.findFirst({
          where: {
            stationId: station.id,
            isrc: { startsWith: isrcPrefix },
            endedAt: { gte: cutoff },
          },
          orderBy: { endedAt: "desc" },
        });
      }

      // Layer 3: Exact normalized title+artist match
      if (!recentEvent) {
        const normTitle = normalizeTitle(music.title);
        const normArtist = normalizeArtist(artistName);

        const candidates = await prisma.airplayEvent.findMany({
          where: {
            stationId: station.id,
            endedAt: { gte: cutoff },
          },
          orderBy: { endedAt: "desc" },
          take: 10,
        });

        for (const candidate of candidates) {
          const candidateNormTitle = normalizeTitle(candidate.songTitle);
          const candidateNormArtist = normalizeArtist(candidate.artistName);

          // Exact normalized match
          if (normTitle === candidateNormTitle && normArtist === candidateNormArtist) {
            recentEvent = candidate;
            break;
          }
        }

        // Layer 4: Fuzzy title+artist match (Jaro-Winkler)
        if (!recentEvent) {
          for (const candidate of candidates) {
            const candidateNormTitle = normalizeTitle(candidate.songTitle);
            const candidateNormArtist = normalizeArtist(candidate.artistName);

            if (isFuzzyMatch(normTitle, normArtist, candidateNormTitle, candidateNormArtist)) {
              recentEvent = candidate;
              logger.info(
                {
                  incoming: `${music.title} - ${artistName}`,
                  existing: `${candidate.songTitle} - ${candidate.artistName}`,
                },
                "Fuzzy dedup match",
              );
              break;
            }
          }
        }
      }

      if (recentEvent) {
        // Extend existing AirplayEvent
        const updateData: Record<string, unknown> = {
          endedAt: detectedAt,
          playCount: { increment: 1 },
        };

        if (confidence > recentEvent.confidence) {
          updateData.songTitle = music.title;
          updateData.artistName = artistName;
          updateData.confidence = confidence;
          updateData.albumTitle = albumTitle;
          updateData.label = label;
          updateData.playedDuration = playedDuration;
          updateData.deezerUrl = deezerUrl;
          updateData.spotifyId = spotifyId;
          updateData.youtubeId = youtubeId;
        }

        await prisma.airplayEvent.update({
          where: { id: recentEvent.id },
          data: updateData,
        });
      } else {
        // Create new AirplayEvent
        const newEvent = await prisma.airplayEvent.create({
          data: {
            stationId: station.id,
            startedAt: detectedAt,
            endedAt: detectedAt,
            songTitle: music.title,
            artistName,
            isrc,
            playCount: 1,
            confidence,
            albumTitle,
            label,
            playedDuration,
            deezerUrl,
            spotifyId,
            youtubeId,
          },
        });

        // Enqueue snippet extraction (always, unless explicitly disabled)
        if (process.env.SNIPPETS_ENABLED !== "false" && _snippetQueue) {
          try {
            await _snippetQueue.add("extract", {
              airplayEventId: newEvent.id,
              stationId: station.id,
              detectedAt: detectedAt.toISOString(),
            }, {
              attempts: 5,
              backoff: { type: "exponential", delay: 5000 },
            });
          } catch (err) {
            logger.error(
              { airplayEventId: newEvent.id, err },
              "Failed to enqueue snippet extraction job",
            );
          }
        }

        // Publish live detection event
        try {
          const liveEvent: LiveDetectionEvent = {
            id: newEvent.id,
            stationId: newEvent.stationId,
            songTitle: newEvent.songTitle,
            artistName,
            isrc,
            snippetUrl: newEvent.snippetUrl ?? null,
            stationName: station.name,
            startedAt: detectedAt.toISOString(),
            publishedAt: new Date().toISOString(),
          };
          await redis.publish(CHANNELS.DETECTION_NEW, JSON.stringify(liveEvent));
          await redis.zadd(BACKFILL_KEY, newEvent.id, JSON.stringify(liveEvent));
          await redis.zremrangebyrank(BACKFILL_KEY, 0, -(BACKFILL_MAX + 1));
        } catch (err) {
          logger.error(
            { err, airplayEventId: newEvent.id },
            "Failed to publish live detection event",
          );
        }
      }
    });
  }

  // 4. Update station lastHeartbeat
  await prisma.station.update({
    where: { id: station.id },
    data: { lastHeartbeat: detectedAt },
  });
}

// ---- Worker Lifecycle ----

export async function startDetectionWorker(options?: {
  snippetQueue?: Queue;
}): Promise<{
  queue: Queue;
  worker: Worker;
}> {
  _snippetQueue = options?.snippetQueue ?? null;
  const queue = new Queue(DETECTION_QUEUE, {
    connection: createRedisConnection(),
  });

  const worker = new Worker(
    DETECTION_QUEUE,
    async (job) => {
      await processCallback(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 5, // Reduced from 10 — per-station locks serialize same-station work
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Detection job failed");
  });

  logger.info("Detection worker started (concurrency: 5, with per-station locks)");

  return { queue, worker };
}
