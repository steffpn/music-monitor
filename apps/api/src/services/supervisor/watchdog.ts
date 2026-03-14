/**
 * Watchdog - periodic health check loop for stream processes.
 *
 * Monitors segment file freshness to detect hung or failed streams.
 * Checks segment file size to detect corrupt/empty segments.
 * Triggers stream restarts when issues are detected.
 */

import path from "node:path";
import fs from "node:fs/promises";
import pino from "pino";
import { DATA_DIR } from "./ffmpeg.js";
import type { StreamManager } from "./stream-manager.js";
import { prisma } from "../../lib/prisma.js";

const logger = pino({ name: "supervisor:watchdog" });

interface WatchdogConfig {
  /** Polling interval in milliseconds. Default: 10_000 (10s). */
  intervalMs: number;
  /** Maximum age of latest segment before stream is considered stale. Default: 30_000 (30s). */
  staleThresholdMs: number;
  /** Minimum segment file size in bytes to be considered valid. Default: 1024 (1KB). */
  minSegmentBytes: number;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  intervalMs: 10_000,
  staleThresholdMs: 30_000,
  minSegmentBytes: 1024,
};

/**
 * Get the latest modified segment file's mtime from a directory.
 * Only considers files with size >= minBytes as valid.
 *
 * @returns Date of the latest valid segment, or null if no valid segments exist.
 */
export async function getLatestSegmentMtime(
  segmentDir: string,
  minBytes: number,
): Promise<Date | null> {
  try {
    const files = await fs.readdir(segmentDir);
    let latestMtime: Date | null = null;

    for (const file of files) {
      const stat = await fs.stat(path.join(segmentDir, file));
      if (stat.size >= minBytes) {
        if (!latestMtime || stat.mtime > latestMtime) {
          latestMtime = stat.mtime;
        }
      }
    }

    return latestMtime;
  } catch {
    return null; // Directory doesn't exist yet
  }
}

export class Watchdog {
  private streamManager: StreamManager;
  private config: WatchdogConfig;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    streamManager: StreamManager,
    config?: Partial<WatchdogConfig>,
  ) {
    this.streamManager = streamManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the watchdog polling loop.
   */
  start(): void {
    if (this.intervalHandle) {
      logger.warn("Watchdog already running");
      return;
    }

    this.intervalHandle = setInterval(() => {
      this.checkAll().catch((err) => {
        logger.error({ err }, "Watchdog check failed");
      });
    }, this.config.intervalMs);

    logger.info(
      { intervalMs: this.config.intervalMs },
      "Watchdog started",
    );
  }

  /**
   * Stop the watchdog polling loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("Watchdog stopped");
    }
  }

  /**
   * Check all recording streams for health.
   * For each stream with status 'recording':
   * 1. Check latest segment file mtime and size
   * 2. If stale or no valid segments -> restart
   * 3. If fresh -> update heartbeat, reset restartCount if needed
   */
  async checkAll(): Promise<void> {
    const statuses = this.streamManager.getAllStatuses();

    for (const stream of statuses) {
      if (stream.status !== "recording") continue;

      try {
        const segmentDir = path.join(DATA_DIR, String(stream.stationId));
        const latestMtime = await getLatestSegmentMtime(
          segmentDir,
          this.config.minSegmentBytes,
        );

        if (latestMtime === null) {
          // No valid segments found. This could be:
          // - Empty directory (stream just started, grace period)
          // - All segments are too small (corrupt)
          // Check if there are ANY files (including small ones)
          let hasFiles = false;
          try {
            const files = await fs.readdir(segmentDir);
            hasFiles = files.length > 0;
          } catch {
            // Directory doesn't exist -- stream just started
          }

          if (hasFiles) {
            // Files exist but all are too small -- stream is producing corrupt output
            logger.warn(
              { stationId: stream.stationId },
              "All segments are corrupt (below minimum size), restarting stream",
            );
            await this.streamManager.restartStream(stream.stationId);
          }
          // If no files at all, this is a grace period for a newly started stream
          continue;
        }

        const age = Date.now() - latestMtime.getTime();

        if (age > this.config.staleThresholdMs) {
          // Stream is stale -- restart it
          logger.warn(
            { stationId: stream.stationId, ageMs: age },
            "Stream stale, restarting",
          );
          await this.streamManager.restartStream(stream.stationId);
        } else {
          // Stream is healthy -- update heartbeat
          await prisma.station.update({
            where: { id: stream.stationId },
            data: { lastHeartbeat: new Date() },
          });

          // If stream was previously restarting, reset the count
          if (stream.restartCount > 0) {
            await this.streamManager.resetRestartCount(stream.stationId);
          }
        }
      } catch (err) {
        logger.error(
          { stationId: stream.stationId, err },
          "Error checking stream health",
        );
      }
    }
  }
}
