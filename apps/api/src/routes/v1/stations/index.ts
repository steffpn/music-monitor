import type { FastifyPluginAsync } from "fastify";
import {
  StationCreateSchema,
  StationBulkCreateSchema,
  StationUpdateSchema,
  StationParamsSchema,
} from "./schema.js";
import {
  createStation,
  createStationsBulk,
  listStations,
  getStation,
  updateStation,
  deleteStation,
} from "./handlers.js";
import { authenticate } from "../../../middleware/authenticate.js";
import { requireRole } from "../../../middleware/authorize.js";

const stationRoutes: FastifyPluginAsync = async (fastify) => {
  // All station routes require admin authentication
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireRole("ADMIN"));
  // POST / - Create a single station
  fastify.post(
    "/",
    {
      schema: {
        body: StationCreateSchema,
      },
    },
    createStation,
  );

  // POST /bulk - Bulk create stations
  fastify.post(
    "/bulk",
    {
      schema: {
        body: StationBulkCreateSchema,
      },
    },
    createStationsBulk,
  );

  // GET / - List all stations
  fastify.get("/", listStations);

  // GET /:id - Get single station
  fastify.get(
    "/:id",
    {
      schema: {
        params: StationParamsSchema,
      },
    },
    getStation,
  );

  // PATCH /:id - Update station
  fastify.patch(
    "/:id",
    {
      schema: {
        params: StationParamsSchema,
        body: StationUpdateSchema,
      },
    },
    updateStation,
  );

  // DELETE /:id - Soft delete station
  fastify.delete(
    "/:id",
    {
      schema: {
        params: StationParamsSchema,
      },
    },
    deleteStation,
  );
};

export default stationRoutes;
