/**
 * Segment resolver -- maps a detection timestamp to the ring buffer segment
 * files that contain the relevant audio window.
 *
 * Strategy: include ALL available segments sorted by time, and calculate
 * the seek offset to start 25s before the detection timestamp.
 * FFmpeg will extract 30s from that point.
 */

import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { DATA_DIR } from "../services/supervisor/ffmpeg.js";

const logger = pino({ name: "segment-resolver" });

interface SegmentInfo {
  path: string;
  mtime: number;
}

/**
 * Resolve segments for a 30-second snippet (25s before + 5s after detection).
 *
 * Uses ALL available segments and calculates seek offset based on
 * the time difference between the oldest segment and the target window start.
 */
export async function resolveSegments(
  stationId: number,
  detectedAt: Date,
): Promise<{ segments: string[]; seekOffsetSeconds: number } | null> {
  const segmentDir = path.join(DATA_DIR, String(stationId));

  let files: string[];
  try {
    files = await fs.readdir(segmentDir);
  } catch {
    return null;
  }

  const segmentInfos: SegmentInfo[] = [];
  for (const file of files) {
    if (!file.endsWith(".ts")) continue;
    const filePath = path.join(segmentDir, file);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 0) {
        segmentInfos.push({ path: filePath, mtime: stat.mtimeMs });
      }
    } catch {
      // File may have been rotated, skip
    }
  }

  if (segmentInfos.length < 2) return null;

  // Sort by mtime ascending (oldest first)
  segmentInfos.sort((a, b) => a.mtime - b.mtime);

  const targetMs = detectedAt.getTime();
  const windowStart = targetMs - 25000; // 25s before detection

  // Check if we have segments old enough to cover the window
  const oldestSegEnd = segmentInfos[0].mtime;
  const oldestSegStart = oldestSegEnd - 10000;
  const newestSegEnd = segmentInfos[segmentInfos.length - 1].mtime;

  if (windowStart < oldestSegStart) {
    logger.warn({ stationId, windowStart, oldestSegStart }, "Segments don't go back far enough");
    // Still try - use whatever we have from the beginning
  }

  if (targetMs > newestSegEnd + 5000) {
    logger.warn({ stationId }, "Detection too recent, segments haven't been written yet");
    return null;
  }

  // Use all segments - FFmpeg concat will handle the full timeline
  // Calculate seek: how far into the concatenated stream to start
  // Total duration of all segments ≈ segmentCount * 10s
  // The concatenated stream starts at oldestSegStart
  const seekFromStart = Math.max(0, (windowStart - oldestSegStart) / 1000);

  logger.info({
    stationId,
    segmentCount: segmentInfos.length,
    seekOffsetSeconds: Math.round(seekFromStart * 10) / 10,
    oldestAge: Math.round((targetMs - oldestSegStart) / 1000),
    newestAge: Math.round((targetMs - newestSegEnd) / 1000),
  }, "Resolved segments for snippet");

  return {
    segments: segmentInfos.map((s) => s.path),
    seekOffsetSeconds: seekFromStart,
  };
}
