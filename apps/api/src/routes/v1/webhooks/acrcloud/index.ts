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
  fastify.post(
    "/",
    {
      schema: {
        body: AcrCloudCallbackSchema,
      },
    },
    async (request, reply) => handleAcrCloudCallback(request, reply, detectionQueue),
  );
};

export default acrcloudWebhookRoutes;
