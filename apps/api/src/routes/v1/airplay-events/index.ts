import type { FastifyPluginAsync } from "fastify";
import { AirplayEventParamsSchema } from "./schema.js";
import { getSnippetUrl } from "./handlers.js";
import { authenticate } from "../../../middleware/authenticate.js";

const airplayEventRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /:id/snippet - Get presigned URL for audio snippet (requires auth)
  fastify.get(
    "/:id/snippet",
    {
      preHandler: [authenticate],
      schema: {
        params: AirplayEventParamsSchema,
      },
    },
    getSnippetUrl,
  );
};

export default airplayEventRoutes;
