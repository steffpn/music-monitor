/**
 * FFmpeg command builder and process spawner.
 *
 * Spawns FFmpeg child processes that record internet audio streams into
 * rolling segment files using the segment muxer with codec pass-through.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import pino from "pino";

const logger = pino({ name: "supervisor:ffmpeg" });

/**
 * Root directory for all stream segment files.
 * Each station gets a subdirectory: data/streams/{stationId}/
 */
export const DATA_DIR = path.resolve("./data/streams");

/**
 * Spawn an FFmpeg process that records a stream into rolling segment files.
 *
 * Uses `-c copy` for codec pass-through (no re-encoding) to minimize CPU usage.
 * Uses `.ts` (MPEG-TS) container for maximum codec compatibility.
 * Uses `-segment_wrap 20` for 20 segments * 10s = 200s (~3.3 min rolling buffer).
 *
 * @param stationId - Station database ID
 * @param streamUrl - URL of the internet audio stream
 * @returns The spawned ChildProcess
 */
export async function spawnFFmpeg(
  stationId: number,
  streamUrl: string,
): Promise<ChildProcess> {
  const segmentDir = path.join(DATA_DIR, String(stationId));
  await fs.mkdir(segmentDir, { recursive: true });

  const outputPattern = path.join(segmentDir, "segment-%03d.ts");

  const proc = spawn(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "10",
      "-rw_timeout",
      "15000000",
      "-i",
      streamUrl,
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      "10",
      "-segment_wrap",
      "20",
      "-reset_timestamps",
      "1",
      "-y",
      outputPattern,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      detached: false,
    },
  );

  // Handle spawn errors (e.g. ffmpeg not installed)
  proc.on("error", (err) => {
    logger.error({ stationId, err: err.message }, "FFmpeg spawn error");
  });

  logger.info({ stationId, pid: proc.pid, streamUrl }, "[ffmpeg] spawned");

  // Log ALL stderr for debugging
  let stderrBuffer = "";
  proc.stderr?.on("data", (data: Buffer) => {
    stderrBuffer += data.toString();
    // Log every 2KB of output
    if (stderrBuffer.length > 2000) {
      const lines = stderrBuffer.split("\n").filter(l => l.trim());
      const lastLines = lines.slice(-5).join(" | ");
      logger.info({ stationId }, `[ffmpeg] ${lastLines}`);
      stderrBuffer = "";
    }
  });

  // Log when process exits
  proc.on("exit", (code, signal) => {
    if (stderrBuffer.trim()) {
      logger.info({ stationId }, `[ffmpeg-final] ${stderrBuffer.trim().split("\n").slice(-3).join(" | ")}`);
    }
    logger.info({ stationId, code, signal }, "[ffmpeg] process exit");
  });

  return proc;
}
