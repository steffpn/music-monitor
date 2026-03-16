import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../../middleware/authenticate.js";
import { requireRole } from "../../../middleware/authorize.js";
import {
  AddWatchedStationBodySchema,
  StationIdParamsSchema,
  PeriodQuerySchema,
} from "./schema.js";
import {
  getWatchedStations,
  addWatchedStation,
  removeWatchedStation,
  getCompetitorSummary,
  getCompetitorDetail,
} from "./handlers.js";

const competitorRoutes: FastifyPluginAsync = async (fastify) => {
  // Plugin-level hooks: authenticate + require STATION role
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireRole("STATION"));

  // GET /competitors/watched - List watched competitor stations
  fastify.get(
    "/watched",
    {},
    getWatchedStations,
  );

  // POST /competitors/watched - Add a competitor station to watch list
  fastify.post(
    "/watched",
    {
      schema: {
        body: AddWatchedStationBodySchema,
      },
    },
    addWatchedStation,
  );

  // DELETE /competitors/watched/:stationId - Remove a competitor station
  fastify.delete(
    "/watched/:stationId",
    {
      schema: {
        params: StationIdParamsSchema,
      },
    },
    removeWatchedStation,
  );

  // GET /competitors/summary - Summary cards for all watched competitors
  fastify.get(
    "/summary",
    {
      schema: {
        querystring: PeriodQuerySchema,
      },
    },
    getCompetitorSummary,
  );

  // GET /competitors/:stationId/detail - Detailed competitor intelligence
  fastify.get(
    "/:stationId/detail",
    {
      schema: {
        params: StationIdParamsSchema,
        querystring: PeriodQuerySchema,
      },
    },
    getCompetitorDetail,
  );
};

export default competitorRoutes;
