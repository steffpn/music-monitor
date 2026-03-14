/**
 * StreamManager - tracks all FFmpeg processes in a Map.
 *
 * Manages the lifecycle of stream recording processes: start, stop, restart.
 * Implements exponential backoff restart on failure and circuit-breaking
 * after 5 consecutive failures.
 */

import type { ChildProcess } from "node:child_process";
import pino from "pino";
import { spawnFFmpeg } from "./ffmpeg.js";
import { prisma } from "../../lib/prisma.js";

const logger = pino({ name: "supervisor:stream-manager" });

const BASE_BACKOFF_MS = 10_000;
const MAX_RESTARTS = 5;

/**
 * Represents a tracked FFmpeg process for a single station.
 */
export interface StreamProcess {
  stationId: number;
  streamUrl: string;
  process: ChildProcess | null;
  pid: number | null;
  startedAt: Date;
  lastSegmentAt: Date;
  restartCount: number;
  status: "starting" | "recording" | "restarting" | "error";
  backoffTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Calculate exponential backoff delay.
 * Formula: 10000 * 2^(restartCount-1) => 10s, 20s, 40s, 80s, 160s
 */
function getBackoffDelay(restartCount: number): number {
  return BASE_BACKOFF_MS * Math.pow(2, restartCount - 1);
}

export class StreamManager {
  private streams = new Map<number, StreamProcess>();

  /**
   * Start recording a stream for a station.
   * Creates a StreamProcess entry, spawns FFmpeg, and attaches failure handlers.
   */
  async startStream(stationId: number, streamUrl: string): Promise<void> {
    const now = new Date();
    const entry: StreamProcess = {
      stationId,
      streamUrl,
      process: null,
      pid: null,
      startedAt: now,
      lastSegmentAt: now,
      restartCount: this.streams.get(stationId)?.restartCount ?? 0,
      status: "starting",
      backoffTimer: null,
    };

    this.streams.set(stationId, entry);

    try {
      const proc = await spawnFFmpeg(stationId, streamUrl);
      entry.process = proc;
      entry.pid = proc.pid ?? null;
      entry.status = "recording";

      // Attach close event handler for failure detection
      proc.on("close", (code, signal) => {
        logger.info(
          { stationId, code, signal },
          "FFmpeg process exited",
        );

        // Only handle as failure if stream is still tracked and not being stopped intentionally
        const current = this.streams.get(stationId);
        if (current && current.process === proc) {
          this.handleStreamFailure(stationId);
        }
      });

      // Update station status to ACTIVE in DB
      await prisma.station.update({
        where: { id: stationId },
        data: { status: "ACTIVE" },
      });

      logger.info({ stationId, pid: entry.pid }, "Stream started");
    } catch (err) {
      logger.error({ stationId, err }, "Failed to spawn FFmpeg");
      entry.status = "error";
    }
  }

  /**
   * Stop recording a stream. Kills the FFmpeg process and removes from tracking.
   */
  async stopStream(stationId: number): Promise<void> {
    const entry = this.streams.get(stationId);
    if (!entry) return;

    // Clear any pending backoff timer
    if (entry.backoffTimer) {
      clearTimeout(entry.backoffTimer);
      entry.backoffTimer = null;
    }

    // Kill the FFmpeg process
    if (entry.process) {
      entry.process.kill("SIGTERM");
    }

    this.streams.delete(stationId);
    logger.info({ stationId }, "Stream stopped");
  }

  /**
   * Restart a stream (explicit restart from API, not a failure).
   * Stops the current stream and starts a new one. Resets restartCount to 0.
   */
  async restartStream(stationId: number): Promise<void> {
    const entry = this.streams.get(stationId);
    if (!entry) return;

    const { streamUrl } = entry;
    await this.stopStream(stationId);
    await this.startStream(stationId, streamUrl);

    // Explicit restart resets the failure counter
    const newEntry = this.streams.get(stationId);
    if (newEntry) {
      newEntry.restartCount = 0;
    }
  }

  /**
   * Handle a stream failure (FFmpeg process exited unexpectedly).
   * Implements exponential backoff and circuit-breaking after MAX_RESTARTS.
   */
  private handleStreamFailure(stationId: number): void {
    const entry = this.streams.get(stationId);
    if (!entry) return;

    entry.restartCount += 1;
    entry.process = null;
    entry.pid = null;

    logger.warn(
      { stationId, restartCount: entry.restartCount },
      "Stream failure detected",
    );

    // Circuit breaker: after 5 failures, mark as error
    if (entry.restartCount >= MAX_RESTARTS) {
      entry.status = "error";
      entry.backoffTimer = null;

      prisma.station
        .update({
          where: { id: stationId },
          data: {
            status: "ERROR",
            restartCount: entry.restartCount,
          },
        })
        .catch((err) => {
          logger.error({ stationId, err }, "Failed to update station status to ERROR");
        });

      logger.error(
        { stationId, restartCount: entry.restartCount },
        "Circuit breaker tripped - station marked as ERROR",
      );
      return;
    }

    // Schedule restart with exponential backoff
    entry.status = "restarting";
    const delay = getBackoffDelay(entry.restartCount);

    logger.info(
      { stationId, delay, restartCount: entry.restartCount },
      "Scheduling stream restart with backoff",
    );

    entry.backoffTimer = setTimeout(async () => {
      entry.backoffTimer = null;
      const current = this.streams.get(stationId);
      if (current && current.status === "restarting") {
        try {
          const proc = await spawnFFmpeg(stationId, entry.streamUrl);
          current.process = proc;
          current.pid = proc.pid ?? null;
          current.status = "recording";
          current.startedAt = new Date();

          proc.on("close", (code, signal) => {
            logger.info({ stationId, code, signal }, "FFmpeg process exited");
            const c = this.streams.get(stationId);
            if (c && c.process === proc) {
              this.handleStreamFailure(stationId);
            }
          });

          logger.info(
            { stationId, pid: current.pid },
            "Stream restarted after backoff",
          );
        } catch (err) {
          logger.error({ stationId, err }, "Failed to restart stream");
          this.handleStreamFailure(stationId);
        }
      }
    }, delay);
  }

  /**
   * Reset restart count for a station (called by watchdog when stream is healthy).
   * If restartCount > 0, resets to 0 and updates DB.
   */
  async resetRestartCount(stationId: number): Promise<void> {
    const entry = this.streams.get(stationId);
    if (!entry || entry.restartCount === 0) return;

    const previousCount = entry.restartCount;
    entry.restartCount = 0;

    await prisma.station.update({
      where: { id: stationId },
      data: { restartCount: 0 },
    });

    logger.info(
      { stationId, previousCount },
      "Restart count reset - stream recovered",
    );
  }

  /**
   * Get the status of a specific stream.
   */
  getStatus(stationId: number): StreamProcess | undefined {
    return this.streams.get(stationId);
  }

  /**
   * Get all tracked stream statuses.
   */
  getAllStatuses(): StreamProcess[] {
    return Array.from(this.streams.values());
  }

  /**
   * Stop all streams (for graceful shutdown).
   */
  async stopAll(): Promise<void> {
    const stationIds = Array.from(this.streams.keys());
    await Promise.all(stationIds.map((id) => this.stopStream(id)));
    logger.info({ count: stationIds.length }, "All streams stopped");
  }
}
