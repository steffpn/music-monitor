import type { Queue } from "bullmq";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { AcrCloudCallbackBody } from "./schema.js";

/**
 * Handle an incoming ACRCloud broadcast monitoring callback.
 *
 * 1. Validates the shared secret header (X-ACR-Secret).
 *    On auth failure: returns 200 silently (no information leak).
 * 2. Enqueues the raw callback payload to BullMQ for async processing.
 * 3. Returns 200 immediately -- no blocking on detection processing.
 */
export async function handleAcrCloudCallback(
  request: FastifyRequest<{ Body: AcrCloudCallbackBody }>,
  reply: FastifyReply,
  detectionQueue: Queue,
): Promise<void> {
  // Auth: check shared secret header (only if configured)
  const expectedSecret = process.env.ACRCLOUD_WEBHOOK_SECRET;
  if (expectedSecret) {
    const secret = request.headers["x-acr-secret"] as string | undefined;
    if (secret !== expectedSecret) {
      return reply.status(200).send({ status: "ok" });
    }
  }

  const body = request.body as any;
  const hasMusic = body?.data?.metadata?.music?.length > 0;
  const streamId = body?.stream_id || "unknown";
  const songInfo = hasMusic
    ? `${body.data.metadata.music[0].artists?.[0]?.name || "?"} - ${body.data.metadata.music[0].title || "?"}`
    : "no match";

  request.log.info(`[acrcloud] stream=${streamId} result=${songInfo}`);

  // Debug: log external_metadata and played_duration to understand what ACRCloud sends
  if (hasMusic) {
    const music = body.data.metadata.music[0];
    const playedDuration = body.data.metadata.played_duration;
    request.log.info({
      played_duration: playedDuration,
      external_metadata: music.external_metadata,
      play_offset_ms: music.play_offset_ms,
      acrid: music.acrid,
    }, "[acrcloud] metadata details");
  }

  // Enqueue raw callback for async processing by detection worker
  await detectionQueue.add("process-callback", body, {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  return reply.status(200).send({ status: "ok" });
}
