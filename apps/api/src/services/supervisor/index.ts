/**
 * Supervisor entry point - orchestrates FFmpeg process management.
 *
 * Handles staggered startup, Redis pub/sub event dispatch, watchdog
 * initialization, and graceful shutdown.
 *
 * Runs as a standalone process, separate from the Fastify API server.
 */

import pino from "pino";
import fs from "node:fs/promises";
import { prisma } from "../../lib/prisma.js";
import { createRedisConnection } from "../../lib/redis.js";
import type { StationEvent } from "../../lib/pubsub.js";
import { StreamManager } from "./stream-manager.js";
import { Watchdog } from "./watchdog.js";
import { DATA_DIR } from "./ffmpeg.js";

const logger = pino({ name: "supervisor" });

const STARTUP_BATCH_SIZE = 10;
const STARTUP_BATCH_DELAY_MS = 2_000;

/**
 * Start the supervisor service.
 *
 * 1. Checks for orphaned processes from previous run
 * 2. Loads all ACTIVE stations from DB and starts them in batches
 * 3. Starts the watchdog health check loop
 * 4. Subscribes to Redis pub/sub for station lifecycle events
 * 5. Registers graceful shutdown handlers
 *
 * @returns Object with streamManager and watchdog for testing/access
 */
export async function startSupervisor(): Promise<{
  streamManager: StreamManager;
  watchdog: Watchdog;
}> {
  logger.info("Starting supervisor service");

  // --- Orphan cleanup warning ---
  try {
    const dirs = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const stationDirs = dirs.filter((d) => d.isDirectory());
    if (stationDirs.length > 0) {
      logger.warn(
        { count: stationDirs.length },
        "Found existing segment directories -- possible orphaned FFmpeg processes from previous run",
      );
    }
  } catch {
    // DATA_DIR doesn't exist yet -- clean start
  }

  // --- Initialize ---
  const streamManager = new StreamManager();
  const watchdog = new Watchdog(streamManager);

  // --- Staggered startup ---
  const stations = await prisma.station.findMany({
    where: { status: "ACTIVE" },
  });

  logger.info(
    { count: stations.length },
    "Loading active stations for startup",
  );

  for (let i = 0; i < stations.length; i += STARTUP_BATCH_SIZE) {
    const batch = stations.slice(i, i + STARTUP_BATCH_SIZE);
    await Promise.all(
      batch.map((s) => streamManager.startStream(s.id, s.streamUrl)),
    );

    if (i + STARTUP_BATCH_SIZE < stations.length) {
      logger.info(
        { batchEnd: i + STARTUP_BATCH_SIZE, total: stations.length },
        "Batch started, waiting before next batch",
      );
      await new Promise((resolve) =>
        setTimeout(resolve, STARTUP_BATCH_DELAY_MS),
      );
    }
  }

  logger.info("All stations started");

  // --- Start watchdog ---
  watchdog.start();

  // --- Redis pub/sub subscriber ---
  const subscriber = createRedisConnection();
  await subscriber.subscribe(
    "station:added",
    "station:removed",
    "station:updated",
  );

  subscriber.on("message", async (channel: string, message: string) => {
    try {
      const event: StationEvent = JSON.parse(message);
      logger.info(
        { channel, stationId: event.stationId },
        "Received station event",
      );

      switch (channel) {
        case "station:added":
          await streamManager.startStream(
            event.stationId,
            event.streamUrl!,
          );
          break;
        case "station:removed":
          await streamManager.stopStream(event.stationId);
          break;
        case "station:updated":
          // Stop-and-restart (brief gap acceptable per user decision)
          await streamManager.stopStream(event.stationId);
          await streamManager.startStream(
            event.stationId,
            event.streamUrl!,
          );
          break;
      }
    } catch (err) {
      logger.error({ channel, err }, "Error handling station event");
    }
  });

  // --- Reconciliation on Redis reconnect ---
  subscriber.on("connect", async () => {
    logger.info("Redis subscriber reconnected, performing reconciliation");
    try {
      const activeStations = await prisma.station.findMany({
        where: { status: "ACTIVE" },
      });

      const activeIds = new Set(activeStations.map((s) => s.id));
      const runningStatuses = streamManager.getAllStatuses();
      const runningIds = new Set(
        runningStatuses.map((s) => s.stationId),
      );

      // Start missing streams
      for (const station of activeStations) {
        if (!runningIds.has(station.id)) {
          logger.info(
            { stationId: station.id },
            "Reconciliation: starting missing stream",
          );
          await streamManager.startStream(station.id, station.streamUrl);
        }
      }

      // Stop extra streams
      for (const status of runningStatuses) {
        if (!activeIds.has(status.stationId)) {
          logger.info(
            { stationId: status.stationId },
            "Reconciliation: stopping extra stream",
          );
          await streamManager.stopStream(status.stationId);
        }
      }
    } catch (err) {
      logger.error({ err }, "Reconciliation failed");
    }
  });

  // --- Graceful shutdown ---
  const shutdown = async () => {
    logger.info("Shutting down supervisor");
    watchdog.stop();
    await streamManager.stopAll();
    subscriber.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Supervisor ready");

  return { streamManager, watchdog };
}

// Start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startSupervisor().catch((err) => {
    logger.error({ err }, "Failed to start supervisor");
    process.exit(1);
  });
}
