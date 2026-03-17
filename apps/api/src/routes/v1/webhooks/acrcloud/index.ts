import type { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import { DETECTION_QUEUE } from "@myfuckingmusic/shared";
import { createRedisConnection } from "../../../../lib/redis.js";
import { AcrCloudCallbackSchema } from "./schema.js";
import { handleAcrCloudCallback } from "./handlers.js";

const acrcloudWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const detectionQueue = new Queue(DETECTION_QUEUE, {
    connection: createRedisConnection(),
  });

  // Graceful shutdown: close the queue when Fastify closes
  fastify.addHook("onClose", async () => {
    await detectionQueue.close();
  });

  // POST / - Receive ACRCloud broadcast monitoring callback
  // No strict schema validation — ACRCloud payloads vary (test vs real)
  // and validation errors cause 502 before the handler can respond.
  fastify.post(
    "/",
    async (request, reply) => handleAcrCloudCallback(request as any, reply, detectionQueue),
  );
};

export default acrcloudWebhookRoutes;
