/**
 * BullMQ snippet extraction worker.
 *
 * Extracts ~22-second audio clips (7s before + 15s after detection) from the ring buffer,
 * encodes them as AAC 128kbps via FFmpeg, uploads to Cloudflare R2, and
 * updates the AirplayEvent record with the R2 object key.
 *
 * Runs as a BullMQ worker with concurrency 2 (CPU-bound FFmpeg encoding).
 * Every detection MUST have a snippet — jobs retry on failure.
 */

import { Worker, Queue } from "bullmq";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pino from "pino";
import { createRedisConnection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { resolveSegments } from "../lib/segment-resolver.js";
import { uploadToR2 } from "../lib/r2.js";

const logger = pino({ name: "snippet-worker" });

export const SNIPPET_QUEUE = "snippet-extraction";

// ---- Types ----

interface SnippetJobData {
  airplayEventId: number;
  stationId: number;
  detectedAt: string;
}

// ---- Helpers ----

/**
 * Format a date as YYYY-MM-DD for the R2 key path.
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Run FFmpeg to extract a snippet from segments.
 * Uses concat demuxer with a file list for proper timeline reconstruction.
 */
async function extractSnippet(
  segments: string[],
  seekOffsetSeconds: number,
  outputPath: string,
): Promise<void> {
  // Create a concat file list for FFmpeg demuxer
  const concatList = segments.map((s) => `file '${s}'`).join("\n");
  const concatListPath = outputPath + ".txt";
  await fs.writeFile(concatListPath, concatList);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-ss", String(seekOffsetSeconds),
        "-t", "22",
        "-vn",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        "-f", "adts",
        outputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", async (code) => {
      // Clean up concat list file
      try { await fs.unlink(concatListPath); } catch {}

      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on("error", reject);
  });
}

// ---- Core Processor ----

/**
 * Process a single snippet extraction job.
 *
 * 1. Check SNIPPETS_ENABLED kill switch
 * 2. Resolve segments covering the detection window
 * 3. Extract 5s AAC clip via FFmpeg
 * 4. Upload to R2
 * 5. Update AirplayEvent.snippetUrl with R2 key
 * 6. Clean up temp file (always, even on error)
 */
export async function processSnippetJob(
  data: SnippetJobData,
): Promise<void> {
  const { airplayEventId, stationId, detectedAt } = data;

  // 1. Kill switch — only skip if explicitly disabled
  if (process.env.SNIPPETS_ENABLED === "false") {
    logger.debug({ airplayEventId }, "Snippets disabled via SNIPPETS_ENABLED=false, skipping");
    return;
  }

  // 2. Resolve segments — throw to retry if segments aren't ready yet
  const resolved = await resolveSegments(stationId, new Date(detectedAt));
  if (!resolved) {
    throw new Error(
      `No segments available for snippet extraction (event=${airplayEventId}, station=${stationId}). Will retry.`,
    );
  }

  const { segments, seekOffsetSeconds } = resolved;

  // 3-6. Extract, upload, update (with temp file cleanup)
  const tempPath = path.join(
    os.tmpdir(),
    `snippet-${airplayEventId}-${Date.now()}.aac`,
  );

  try {
    // 3. Extract via FFmpeg
    logger.info({ airplayEventId, segmentCount: segments.length, seekOffsetSeconds: Math.round(seekOffsetSeconds * 10) / 10 }, "Extracting snippet");
    await extractSnippet(segments, seekOffsetSeconds, tempPath);

    // 4. Read and upload to R2
    const fileBuffer = await fs.readFile(tempPath);
    const fileSizeKB = Math.round(fileBuffer.length / 1024);
    const r2Key = `snippets/${stationId}/${formatDate(detectedAt)}/${airplayEventId}.aac`;

    if (fileBuffer.length === 0) {
      logger.error({ airplayEventId, stationId }, "Snippet file is empty after extraction");
      return;
    }

    await uploadToR2(r2Key, fileBuffer, "audio/aac");

    // 5. Update AirplayEvent with R2 key
    await prisma.airplayEvent.update({
      where: { id: airplayEventId },
      data: { snippetUrl: r2Key },
    });

    logger.info(
      { airplayEventId, stationId, r2Key, sizeKB: fileSizeKB },
      "Snippet extracted and uploaded",
    );
  } finally {
    // 6. Always clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch {
      // File may not exist if FFmpeg failed before writing
    }
  }
}

// ---- Worker Lifecycle ----

/**
 * Start the snippet extraction worker.
 *
 * Follows the same BullMQ lifecycle pattern as detection and cleanup workers:
 * - Creates a Queue for SNIPPET_QUEUE
 * - Creates a Worker with concurrency 2 (CPU-bound FFmpeg)
 * - Registers 'failed' event handler for logging
 *
 * @returns Object with queue and worker references for graceful shutdown
 */
export async function startSnippetWorker(): Promise<{
  queue: Queue;
  worker: Worker;
}> {
  const queue = new Queue(SNIPPET_QUEUE, {
    connection: createRedisConnection(),
  });

  const worker = new Worker(
    SNIPPET_QUEUE,
    async (job) => {
      await processSnippetJob(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 2000 },
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // Exponential backoff: 5s, 15s, 45s, 2min, 5min
          return Math.min(5000 * Math.pow(3, attemptsMade), 300000);
        },
      },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Snippet extraction job failed");
  });

  logger.info("Snippet worker started (concurrency: 2)");

  return { queue, worker };
}
