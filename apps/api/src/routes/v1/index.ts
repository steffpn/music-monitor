import type { FastifyPluginAsync } from "fastify";

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(import("./stations/index.js"), { prefix: "/stations" });
  fastify.register(import("./webhooks/acrcloud/index.js"), {
    prefix: "/webhooks/acrcloud",
  });
};

export default v1Routes;
