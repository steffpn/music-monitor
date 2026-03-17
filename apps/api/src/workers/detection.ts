/**
 * BullMQ detection processing worker.
 *
 * Transforms ACRCloud broadcast monitoring callbacks into Detection records
 * and deduplicates them into AirplayEvent aggregates using gap-tolerance logic.
 *
 * Flow per callback:
 *  1. Look up station by acrcloudStreamId
 *  2. Handle no-match callbacks (code 1001 or empty music array)
 *  3. Create Detection record with normalized metadata
 *  4. Deduplicate into AirplayEvent (ISRC-first, title+artist fallback)
 *  5. Update station lastHeartbeat
 */

import { Worker, Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { normalizeTitle, normalizeArtist } from "../lib/normalization.js";
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
// Set by startDetectionWorker when a snippet queue is injected from the supervisor.
let _snippetQueue: Queue | null = null;

// ---- Types ----

interface AcrCloudMusicResult {
  title: string;
  artists: Array<{ name: string }>;
  album?: { name?: string };
  duration_ms: number;
  score: number;
  acrid: string;
  external_ids?: {
    isrc?: string | string[];
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
    };
  };
}

// ---- Helpers ----

/**
 * Normalize ISRC to a single string or null.
 * ACRCloud can return ISRC as string, array of strings, or undefined/null.
 */
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

/**
 * Process a single ACRCloud callback.
 *
 * Steps:
 * 1. Station lookup by acrcloudStreamId
 * 2. No-match check (code 1001 or empty music array)
 * 3. For each music result: create Detection, deduplicate into AirplayEvent
 * 4. Update station lastHeartbeat
 */
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
    return;
  }

  // 3. Process each music result
  const timestampUtc = data.metadata!.timestamp_utc;
  const detectedAt = new Date(timestampUtc);

  const MIN_CONFIDENCE = 70; // ACRCloud score threshold (0-100)

  for (const music of data.metadata!.music!) {
    if (music.score < MIN_CONFIDENCE) {
      logger.debug({ score: music.score, title: music.title }, "Low confidence, skipping");
      continue;
    }

    const artistName = music.artists[0]?.name ?? "Unknown";
    const isrc = normalizeIsrc(music.external_ids?.isrc);
    const confidence = music.score / 100;
    const rawCallbackId = `${stream_id}-${timestampUtc}`;

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
      // Handle duplicate rawCallbackId (unique constraint violation)
      if (
        err instanceof Error &&
        "code" in err &&
        (err as Record<string, unknown>).code === "P2002"
      ) {
        logger.debug(
          { rawCallbackId },
          "Duplicate detection callback, skipping",
        );
        continue;
      }
      throw err;
    }

    // Deduplication: find recent AirplayEvent
    let recentEvent;

    if (isrc) {
      // ISRC-based matching: direct query
      recentEvent = await prisma.airplayEvent.findFirst({
        where: {
          stationId: station.id,
          isrc,
          endedAt: {
            gte: new Date(detectedAt.getTime() - DETECTION_GAP_TOLERANCE_MS),
          },
        },
        orderBy: { endedAt: "desc" },
      });
    } else {
      // Title+artist fallback: query recent events for station, filter in JS
      const candidates = await prisma.airplayEvent.findFirst({
        where: {
          stationId: station.id,
          isrc: null,
          endedAt: {
            gte: new Date(detectedAt.getTime() - DETECTION_GAP_TOLERANCE_MS),
          },
        },
        orderBy: { endedAt: "desc" },
      });

      // Filter by normalized title+artist match
      if (candidates) {
        const normalizedIncoming = {
          title: normalizeTitle(music.title),
          artist: normalizeArtist(artistName),
        };
        const normalizedExisting = {
          title: normalizeTitle(candidates.songTitle),
          artist: normalizeArtist(candidates.artistName),
        };

        if (
          normalizedIncoming.title === normalizedExisting.title &&
          normalizedIncoming.artist === normalizedExisting.artist
        ) {
          recentEvent = candidates;
        }
      }
    }

    if (recentEvent) {
      // Extend existing AirplayEvent
      const updateData: Record<string, unknown> = {
        endedAt: detectedAt,
        playCount: { increment: 1 },
      };

      // Higher confidence updates metadata
      if (confidence > recentEvent.confidence) {
        updateData.songTitle = music.title;
        updateData.artistName = artistName;
        updateData.confidence = confidence;
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
        },
      });

      // Enqueue snippet extraction job (best-effort, non-blocking)
      if (process.env.SNIPPETS_ENABLED === "true" && _snippetQueue) {
        try {
          await _snippetQueue.add("extract", {
            airplayEventId: newEvent.id,
            stationId: station.id,
            detectedAt: detectedAt.toISOString(),
          });
        } catch (err) {
          logger.error(
            { airplayEventId: newEvent.id, err },
            "Failed to enqueue snippet extraction job",
          );
        }
      }

      // Publish live detection event to Redis pub/sub (best-effort, non-blocking)
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
        await redis.publish(
          CHANNELS.DETECTION_NEW,
          JSON.stringify(liveEvent),
        );
        await redis.zadd(
          BACKFILL_KEY,
          newEvent.id,
          JSON.stringify(liveEvent),
        );
        await redis.zremrangebyrank(BACKFILL_KEY, 0, -(BACKFILL_MAX + 1));
      } catch (err) {
        logger.error(
          { err, airplayEventId: newEvent.id },
          "Failed to publish live detection event",
        );
      }
    }
  }

  // 4. Update station lastHeartbeat
  await prisma.station.update({
    where: { id: station.id },
    data: { lastHeartbeat: detectedAt },
  });
}

// ---- Worker Lifecycle ----

/**
 * Start the detection processing worker.
 *
 * Follows the same pattern as cleanup worker:
 * - Creates a BullMQ Queue for the DETECTION_QUEUE
 * - Creates a Worker with concurrency=10 (I/O-bound DB writes)
 * - Retry policy: 3 attempts with exponential backoff
 *
 * @returns Object with queue and worker references for graceful shutdown
 */
export async function startDetectionWorker(options?: {
  snippetQueue?: Queue;
}): Promise<{
  queue: Queue;
  worker: Worker;
}> {
  // Store snippet queue reference for processCallback to use
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
      concurrency: 10,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Detection job failed");
  });

  logger.info("Detection worker started (concurrency: 10)");

  return { queue, worker };
}
