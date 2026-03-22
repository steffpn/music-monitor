import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../../middleware/authenticate.js";
import { requireRole } from "../../../middleware/authorize.js";
import {
  SongIdParamsSchema,
  AddMonitoredSongSchema,
  SongAnalyticsQuerySchema,
} from "./schema.js";
import {
  getArtistSongs,
  addArtistSong,
  getSongAnalytics,
  getStationBreakdown,
  getHourlyHeatmap,
  getPeakHours,
  getSongTrend,
  getArtistDashboard,
  getWeeklyDigest,
} from "./handlers.js";

const artistRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require ARTIST or ADMIN role
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireRole("ARTIST", "LABEL", "ADMIN"));

  // GET /artist/songs - List all monitored songs
  fastify.get("/songs", getArtistSongs);

  // POST /artist/songs - Add a new monitored song
  fastify.post(
    "/songs",
    {
      schema: {
        body: AddMonitoredSongSchema,
      },
    },
    addArtistSong,
  );

  // GET /artist/dashboard - Artist overview dashboard
  fastify.get("/dashboard", getArtistDashboard);

  // GET /artist/weekly-digest - Weekly comparison digest
  fastify.get("/weekly-digest", getWeeklyDigest);

  // GET /artist/songs/:id/analytics - Daily play analytics
  fastify.get(
    "/songs/:id/analytics",
    {
      schema: {
        params: SongIdParamsSchema,
        querystring: SongAnalyticsQuerySchema,
      },
    },
    getSongAnalytics,
  );

  // GET /artist/songs/:id/station-breakdown - Plays by station
  fastify.get(
    "/songs/:id/station-breakdown",
    {
      schema: {
        params: SongIdParamsSchema,
      },
    },
    getStationBreakdown,
  );

  // GET /artist/songs/:id/hourly-heatmap - 7x24 play heatmap
  fastify.get(
    "/songs/:id/hourly-heatmap",
    {
      schema: {
        params: SongIdParamsSchema,
      },
    },
    getHourlyHeatmap,
  );

  // GET /artist/songs/:id/peak-hours - Top 5 busiest hour slots
  fastify.get(
    "/songs/:id/peak-hours",
    {
      schema: {
        params: SongIdParamsSchema,
      },
    },
    getPeakHours,
  );

  // GET /artist/songs/:id/trend - This week vs last week
  fastify.get(
    "/songs/:id/trend",
    {
      schema: {
        params: SongIdParamsSchema,
      },
    },
    getSongTrend,
  );
};

export default artistRoutes;
