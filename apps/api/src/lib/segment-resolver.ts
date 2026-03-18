/**
 * Segment resolver -- maps a detection timestamp to ring buffer segments.
 *
 * Each segment is ~10s. With -reset_timestamps 1, each segment's internal
 * timestamps start from 0. When concatenated via concat:, the timeline
 * is sequential: seg1[0-10s] + seg2[10-20s] + seg3[20-30s] etc.
 *
 * We select only the segments that cover our 30s window and calculate
 * a small seek offset within those selected segments.
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
      continue;
    }
  }

  if (segmentInfos.length < 2) return null;

  segmentInfos.sort((a, b) => a.mtime - b.mtime);

  const targetMs = detectedAt.getTime();
  const windowStart = targetMs - 25000; // 25s before
  const windowEnd = targetMs + 5000;    // 5s after

  // Find segments overlapping with [windowStart, windowEnd]
  // Each segment covers approximately [mtime - 10000, mtime]
  const overlapping = segmentInfos.filter((seg) => {
    const segStart = seg.mtime - 10000;
    const segEnd = seg.mtime;
    return segEnd >= windowStart && segStart <= windowEnd;
  });

  if (overlapping.length === 0) {
    logger.warn({ stationId, segmentCount: segmentInfos.length }, "No overlapping segments found");
    return null;
  }

  // Add 1 extra segment before for safety (if available)
  const firstOverlapIdx = segmentInfos.indexOf(overlapping[0]);
  if (firstOverlapIdx > 0) {
    overlapping.unshift(segmentInfos[firstOverlapIdx - 1]);
  }

  // Calculate seek: how far into the FIRST selected segment to start
  // The first segment covers [firstSeg.mtime - 10000, firstSeg.mtime]
  const firstSegStart = overlapping[0].mtime - 10000;
  const seekOffsetSeconds = Math.max(0, (windowStart - firstSegStart) / 1000);

  logger.info({
    stationId,
    segmentCount: overlapping.length,
    seekOffsetSeconds: Math.round(seekOffsetSeconds * 10) / 10,
  }, "Resolved segments for snippet");

  return {
    segments: overlapping.map((s) => s.path),
    seekOffsetSeconds,
  };
}
