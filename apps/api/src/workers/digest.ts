/**
 * BullMQ digest worker for daily and weekly airplay notifications.
 *
 * Computes digest statistics from the daily_station_plays continuous aggregate
 * and sends push notifications via APNS to eligible users.
 *
 * Scheduled jobs:
 * - daily-digest: 9 AM Europe/Bucharest, every day
 * - weekly-digest: 9 AM Europe/Bucharest, every Monday
 */

import { Worker, Queue } from "bullmq";
import { Notification, ApnsError } from "apns2";
import { createRedisConnection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { getApnsClient } from "../lib/apns.js";
import pino from "pino";

const logger = pino({ name: "digest-worker" });

const DIGEST_QUEUE = "digest-notifications";

// ---- Types ----

export interface DailyDigest {
  playCount: number;
  topSong: { title: string; artist: string; count: number } | null;
  topStation: { name: string; count: number } | null;
}

export interface WeeklyDigest {
  playCount: number;
  weekOverWeekChange: number;
  topSong: { title: string; artist: string; count: number } | null;
  topStation: { name: string; count: number } | null;
  newStationsCount: number;
}

// ---- Digest Computation ----

/**
 * Compute daily digest for a set of station IDs.
 *
 * Queries yesterday's data from daily_station_plays and airplay_events.
 */
export async function computeDailyDigest(
  stationIds: number[],
): Promise<DailyDigest> {
  // Total play count from yesterday
  const playCountRows = await prisma.$queryRaw<
    Array<{ play_count: number | bigint }>
  >`
    SELECT COALESCE(SUM(play_count), 0)::int AS play_count
    FROM daily_station_plays
    WHERE bucket = CURRENT_DATE - INTERVAL '1 day'
      AND station_id = ANY(${stationIds}::int[])
  `;
  const playCount = Number(playCountRows[0]?.play_count ?? 0);

  // Top song from airplay_events yesterday
  const topSongRows = await prisma.$queryRaw<
    Array<{ song_title: string; artist_name: string; count: number | bigint }>
  >`
    SELECT song_title, artist_name, COUNT(*)::int AS count
    FROM airplay_events
    WHERE started_at >= CURRENT_DATE - INTERVAL '1 day'
      AND started_at < CURRENT_DATE
      AND station_id = ANY(${stationIds}::int[])
    GROUP BY song_title, artist_name
    ORDER BY count DESC
    LIMIT 1
  `;
  const topSong =
    topSongRows.length > 0
      ? {
          title: topSongRows[0].song_title,
          artist: topSongRows[0].artist_name,
          count: Number(topSongRows[0].count),
        }
      : null;

  // Top station from daily_station_plays yesterday
  const topStationRows = await prisma.$queryRaw<
    Array<{ station_name: string; count: number | bigint }>
  >`
    SELECT s.name AS station_name, d.play_count::int AS count
    FROM daily_station_plays d
    JOIN stations s ON s.id = d.station_id
    WHERE d.bucket = CURRENT_DATE - INTERVAL '1 day'
      AND d.station_id = ANY(${stationIds}::int[])
    ORDER BY d.play_count DESC
    LIMIT 1
  `;
  const topStation =
    topStationRows.length > 0
      ? {
          name: topStationRows[0].station_name,
          count: Number(topStationRows[0].count),
        }
      : null;

  return { playCount, topSong, topStation };
}

/**
 * Compute weekly digest for a set of station IDs.
 *
 * Compares last 7 days vs previous 7 days.
 */
export async function computeWeeklyDigest(
  stationIds: number[],
): Promise<WeeklyDigest> {
  // This week play count (last 7 days)
  const thisWeekRows = await prisma.$queryRaw<
    Array<{ play_count: number | bigint }>
  >`
    SELECT COALESCE(SUM(play_count), 0)::int AS play_count
    FROM daily_station_plays
    WHERE bucket >= CURRENT_DATE - INTERVAL '7 days'
      AND bucket < CURRENT_DATE
      AND station_id = ANY(${stationIds}::int[])
  `;
  const playCount = Number(thisWeekRows[0]?.play_count ?? 0);

  // Previous week play count (7-14 days ago)
  const prevWeekRows = await prisma.$queryRaw<
    Array<{ play_count: number | bigint }>
  >`
    SELECT COALESCE(SUM(play_count), 0)::int AS play_count
    FROM daily_station_plays
    WHERE bucket >= CURRENT_DATE - INTERVAL '14 days'
      AND bucket < CURRENT_DATE - INTERVAL '7 days'
      AND station_id = ANY(${stationIds}::int[])
  `;
  const prevPlayCount = Number(prevWeekRows[0]?.play_count ?? 0);

  // Week-over-week % change
  const weekOverWeekChange =
    prevPlayCount === 0
      ? playCount > 0
        ? 100
        : 0
      : Math.round(
          ((playCount - prevPlayCount) / prevPlayCount) * 100 * 100,
        ) / 100;

  // Top song from airplay_events last 7 days
  const topSongRows = await prisma.$queryRaw<
    Array<{ song_title: string; artist_name: string; count: number | bigint }>
  >`
    SELECT song_title, artist_name, COUNT(*)::int AS count
    FROM airplay_events
    WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
      AND started_at < CURRENT_DATE
      AND station_id = ANY(${stationIds}::int[])
    GROUP BY song_title, artist_name
    ORDER BY count DESC
    LIMIT 1
  `;
  const topSong =
    topSongRows.length > 0
      ? {
          title: topSongRows[0].song_title,
          artist: topSongRows[0].artist_name,
          count: Number(topSongRows[0].count),
        }
      : null;

  // Top station from daily_station_plays last 7 days
  const topStationRows = await prisma.$queryRaw<
    Array<{ station_name: string; count: number | bigint }>
  >`
    SELECT s.name AS station_name, SUM(d.play_count)::int AS count
    FROM daily_station_plays d
    JOIN stations s ON s.id = d.station_id
    WHERE d.bucket >= CURRENT_DATE - INTERVAL '7 days'
      AND d.bucket < CURRENT_DATE
      AND d.station_id = ANY(${stationIds}::int[])
    GROUP BY s.name
    ORDER BY count DESC
    LIMIT 1
  `;
  const topStation =
    topStationRows.length > 0
      ? {
          name: topStationRows[0].station_name,
          count: Number(topStationRows[0].count),
        }
      : null;

  // New stations: played this week but not the previous week
  const newStationsRows = await prisma.$queryRaw<
    Array<{ count: number | bigint }>
  >`
    SELECT COUNT(DISTINCT this_week.station_id)::int AS count
    FROM daily_station_plays this_week
    WHERE this_week.bucket >= CURRENT_DATE - INTERVAL '7 days'
      AND this_week.bucket < CURRENT_DATE
      AND this_week.station_id = ANY(${stationIds}::int[])
      AND this_week.station_id NOT IN (
        SELECT DISTINCT prev_week.station_id
        FROM daily_station_plays prev_week
        WHERE prev_week.bucket >= CURRENT_DATE - INTERVAL '14 days'
          AND prev_week.bucket < CURRENT_DATE - INTERVAL '7 days'
          AND prev_week.station_id = ANY(${stationIds}::int[])
      )
  `;
  const newStationsCount = Number(newStationsRows[0]?.count ?? 0);

  return { playCount, weekOverWeekChange, topSong, topStation, newStationsCount };
}

// ---- Notification Builders ----

/**
 * Build a daily digest push notification.
 *
 * Body format (locked): "X plays today. 'Song' was #1 with Y plays, mostly on Station"
 */
export function buildDailyDigestNotification(
  deviceToken: string,
  digest: DailyDigest,
): Notification {
  const today = new Date().toISOString().split("T")[0];

  let body = `${digest.playCount} plays today.`;
  if (digest.topSong && digest.topStation) {
    body = `${digest.playCount} plays today. '${digest.topSong.title}' was #1 with ${digest.topSong.count} plays, mostly on ${digest.topStation.name}`;
  } else if (digest.topSong) {
    body = `${digest.playCount} plays today. '${digest.topSong.title}' was #1 with ${digest.topSong.count} plays`;
  }

  return new Notification(deviceToken, {
    alert: {
      title: "Daily Airplay Digest",
      body,
    },
    data: {
      type: "daily_digest",
      date: today,
    },
  });
}

/**
 * Build a weekly digest push notification.
 *
 * Body format (locked): "X plays (+Y%). 'Song' #1. Z new stations played your music this week"
 */
export function buildWeeklyDigestNotification(
  deviceToken: string,
  digest: WeeklyDigest,
): Notification {
  const today = new Date().toISOString().split("T")[0];

  const changeSign = digest.weekOverWeekChange >= 0 ? "+" : "";
  let body = `${digest.playCount} plays (${changeSign}${Math.round(digest.weekOverWeekChange)}%).`;
  if (digest.topSong) {
    body = `${digest.playCount} plays (${changeSign}${Math.round(digest.weekOverWeekChange)}%). '${digest.topSong.title}' #1. ${digest.newStationsCount} new stations played your music this week`;
  }

  return new Notification(deviceToken, {
    alert: {
      title: "Weekly Airplay Digest",
      body,
    },
    data: {
      type: "weekly_digest",
      date: today,
    },
  });
}

// ---- Process Functions ----

/**
 * Get station IDs for a user based on their scopes.
 * STATION role: scoped station IDs only.
 * Others (ADMIN, ARTIST, LABEL): all station IDs.
 */
async function getStationIdsForUser(user: {
  id: number;
  scopes: Array<{ entityType: string; entityId: number }>;
}): Promise<number[]> {
  const stationScopes = user.scopes.filter((s) => s.entityType === "STATION");

  if (stationScopes.length > 0) {
    return stationScopes.map((s) => s.entityId);
  }

  // Non-station roles: get all station IDs
  const allStationRows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM stations WHERE status = 'ACTIVE'
  `;
  return allStationRows.map((r) => r.id);
}

/**
 * Process daily digests for all eligible users.
 */
export async function processDailyDigests(): Promise<void> {
  const apns = getApnsClient();
  const users = await prisma.user.findMany({
    where: { isActive: true, dailyDigestEnabled: true },
    include: { scopes: true, deviceTokens: true },
  });

  logger.info({ userCount: users.length }, "Processing daily digests");

  for (const user of users) {
    try {
      if (user.deviceTokens.length === 0) continue;

      const stationIds = await getStationIdsForUser(user);
      if (stationIds.length === 0) continue;

      const digest = await computeDailyDigest(stationIds);

      if (!apns) {
        logger.warn({ userId: user.id }, "APNS client unavailable, skipping push delivery");
        continue;
      }

      for (const dt of user.deviceTokens) {
        try {
          const notification = buildDailyDigestNotification(dt.token, digest);
          await apns.send(notification);
        } catch (err) {
          if (err instanceof ApnsError) {
            const reason = err.reason;
            if (reason === "BadDeviceToken" || reason === "Unregistered") {
              logger.info({ token: dt.token }, "Removing invalid device token");
              await prisma.deviceToken.deleteMany({
                where: { token: dt.token },
              });
              continue;
            }
          }
          logger.error({ userId: user.id, err }, "Failed to send daily digest notification");
        }
      }
    } catch (err) {
      logger.error({ userId: user.id, err }, "Failed to process daily digest for user");
    }
  }
}

/**
 * Process weekly digests for all eligible users.
 */
export async function processWeeklyDigests(): Promise<void> {
  const apns = getApnsClient();
  const users = await prisma.user.findMany({
    where: { isActive: true, weeklyDigestEnabled: true },
    include: { scopes: true, deviceTokens: true },
  });

  logger.info({ userCount: users.length }, "Processing weekly digests");

  for (const user of users) {
    try {
      if (user.deviceTokens.length === 0) continue;

      const stationIds = await getStationIdsForUser(user);
      if (stationIds.length === 0) continue;

      const digest = await computeWeeklyDigest(stationIds);

      if (!apns) {
        logger.warn({ userId: user.id }, "APNS client unavailable, skipping push delivery");
        continue;
      }

      for (const dt of user.deviceTokens) {
        try {
          const notification = buildWeeklyDigestNotification(dt.token, digest);
          await apns.send(notification);
        } catch (err) {
          if (err instanceof ApnsError) {
            const reason = err.reason;
            if (reason === "BadDeviceToken" || reason === "Unregistered") {
              logger.info({ token: dt.token }, "Removing invalid device token");
              await prisma.deviceToken.deleteMany({
                where: { token: dt.token },
              });
              continue;
            }
          }
          logger.error({ userId: user.id, err }, "Failed to send weekly digest notification");
        }
      }
    } catch (err) {
      logger.error({ userId: user.id, err }, "Failed to process weekly digest for user");
    }
  }
}

// ---- Worker Lifecycle ----

/**
 * Start the digest worker with BullMQ cron schedulers.
 *
 * Creates two cron-scheduled jobs:
 * - daily-digest: every day at 9:00 AM Europe/Bucharest
 * - weekly-digest: every Monday at 9:00 AM Europe/Bucharest
 *
 * @returns Object with queue and worker references for graceful shutdown
 */
export async function startDigestWorker(): Promise<{
  queue: Queue;
  worker: Worker;
}> {
  const queue = new Queue(DIGEST_QUEUE, {
    connection: createRedisConnection(),
  });

  // Daily digest: 9 AM every day, Europe/Bucharest timezone
  await queue.upsertJobScheduler(
    "daily-digest-scheduler",
    { pattern: "0 9 * * *", tz: "Europe/Bucharest" },
    { name: "daily-digest", data: {} },
  );

  // Weekly digest: 9 AM every Monday, Europe/Bucharest timezone
  await queue.upsertJobScheduler(
    "weekly-digest-scheduler",
    { pattern: "0 9 * * 1", tz: "Europe/Bucharest" },
    { name: "weekly-digest", data: {} },
  );

  const worker = new Worker(
    DIGEST_QUEUE,
    async (job) => {
      if (job.name === "daily-digest") {
        logger.info("Running daily digest processing");
        await processDailyDigests();
        logger.info("Daily digest processing complete");
      } else if (job.name === "weekly-digest") {
        logger.info("Running weekly digest processing");
        await processWeeklyDigests();
        logger.info("Weekly digest processing complete");
      }
    },
    { connection: createRedisConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Digest job failed");
  });

  logger.info("Digest worker started (daily 9AM + weekly Monday 9AM Europe/Bucharest)");

  return { queue, worker };
}
