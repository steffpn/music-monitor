/**
 * Segment resolver -- maps a detection timestamp to the ring buffer segment
 * files that contain the relevant audio window.
 *
 * Given a detection timestamp, finds which MPEG-TS segment files cover the
 * 5-second window [detectedAt - 2.5s, detectedAt + 2.5s] and calculates
 * the seek offset within the first segment.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../services/supervisor/ffmpeg.js";

interface SegmentInfo {
  path: string;
  mtime: number; // ms timestamp of last modification
}

/**
 * Resolve which segment files cover a 5-second window around a detection timestamp.
 *
 * Segments are ~10s each (segment_time 10). Each segment's time range is
 * approximately [mtime - 10000ms, mtime], where mtime is when FFmpeg finished
 * writing the segment.
 *
 * @param stationId - Station database ID
 * @param detectedAt - Detection timestamp from ACRCloud
 * @returns Segments and seek offset, or null if no matching segments found
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
    // Directory doesn't exist -- no segments available
    return null;
  }

  // Get mtime for each .ts segment file
  const segmentInfos: SegmentInfo[] = [];
  for (const file of files) {
    if (!file.endsWith(".ts")) continue;
    const filePath = path.join(segmentDir, file);
    const stat = await fs.stat(filePath);
    segmentInfos.push({ path: filePath, mtime: stat.mtimeMs });
  }

  if (segmentInfos.length === 0) return null;

  // Sort by mtime ascending (oldest first)
  segmentInfos.sort((a, b) => a.mtime - b.mtime);

  const targetMs = detectedAt.getTime();
  const windowStart = targetMs - 15000; // 15s before detection
  const windowEnd = targetMs + 15000; // 15s after detection

  // Each segment covers approximately [mtime - 10000, mtime]
  // (mtime is when FFmpeg finished writing the segment)
  const relevantSegments = segmentInfos.filter((seg) => {
    const segStart = seg.mtime - 10000;
    const segEnd = seg.mtime;
    return segEnd >= windowStart && segStart <= windowEnd;
  });

  if (relevantSegments.length === 0) return null;

  // Calculate seek offset: time from start of first segment to window start
  const firstSegStart = relevantSegments[0].mtime - 10000;
  const seekOffsetSeconds = Math.max(0, (windowStart - firstSegStart) / 1000);

  return {
    segments: relevantSegments.map((s) => s.path),
    seekOffsetSeconds,
  };
}
