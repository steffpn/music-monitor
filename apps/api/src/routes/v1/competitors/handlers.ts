import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import type {
  AddWatchedStationBody,
  StationIdParams,
  PeriodQuery,
} from "./schema.js";

const MAX_WATCHED_STATIONS = 20;

/**
 * Map period string to interval days.
 */
function periodToDays(period: string): number {
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30;
    default:
      return 1;
  }
}

/**
 * GET /competitors/watched
 *
 * Returns array of watched competitor stations for the current STATION-role user.
 */
export async function getWatchedStations(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;

  const watchedStations = await prisma.watchedStation.findMany({
    where: { userId },
    include: { station: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const result = watchedStations.map((ws) => ({
    id: ws.id,
    stationId: ws.stationId,
    stationName: ws.station.name,
  }));

  return reply.send(result);
}

/**
 * POST /competitors/watched
 *
 * Adds a competitor station to the user's watch list.
 * Enforces: max 20, not own station, no duplicates.
 */
export async function addWatchedStation(
  request: FastifyRequest<{ Body: AddWatchedStationBody }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const stationId = request.body.stationId;

  // Check if trying to watch own station
  const ownStationIds = request.currentUser.scopes
    .filter((s) => s.entityType === "STATION")
    .map((s) => s.entityId);

  if (ownStationIds.includes(stationId)) {
    return reply.code(400).send({ error: "Cannot watch your own station" });
  }

  // Check max limit
  const currentCount = await prisma.watchedStation.count({
    where: { userId },
  });

  if (currentCount >= MAX_WATCHED_STATIONS) {
    return reply
      .code(400)
      .send({ error: "Maximum 20 competitor stations allowed" });
  }

  try {
    const created = await prisma.watchedStation.create({
      data: { userId, stationId },
      include: { station: { select: { name: true } } },
    });

    return reply.code(201).send({
      id: created.id,
      stationId: created.stationId,
      stationName: created.station.name,
    });
  } catch (err: unknown) {
    // Prisma unique constraint violation
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return reply
        .code(409)
        .send({ error: "Station is already in your watch list" });
    }
    throw err;
  }
}

/**
 * DELETE /competitors/watched/:stationId
 *
 * Removes a competitor station from the user's watch list.
 */
export async function removeWatchedStation(
  request: FastifyRequest<{ Params: StationIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const stationId = Number(request.params.stationId);

  const result = await prisma.watchedStation.deleteMany({
    where: { userId, stationId },
  });

  if (result.count === 0) {
    return reply.code(404).send({ error: "Station not in watch list" });
  }

  return reply.code(204).send();
}

/**
 * GET /competitors/summary
 *
 * Returns competitor card data for all watched stations:
 * play count + top song per station for the given period.
 */
export async function getCompetitorSummary(
  request: FastifyRequest<{ Querystring: PeriodQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const period = request.query.period || "day";
  const days = periodToDays(period);

  // Get watched stations
  const watchedStations = await prisma.watchedStation.findMany({
    where: { userId },
    include: { station: { select: { name: true } } },
  });

  if (watchedStations.length === 0) {
    return reply.send([]);
  }

  const watchedIds = watchedStations.map((ws) => ws.stationId);

  // Get play counts per station
  const playCounts = await prisma.$queryRaw<
    Array<{ station_id: number; play_count: number }>
  >`
    SELECT
      station_id,
      COUNT(*)::int AS play_count
    FROM airplay_events
    WHERE station_id IN (${Prisma.join(watchedIds)})
      AND started_at >= NOW() - ${days + " days"}::interval
    GROUP BY station_id
  `;

  // Get top song per station using DISTINCT ON
  const topSongs = await prisma.$queryRaw<
    Array<{ station_id: number; song_title: string; artist_name: string }>
  >`
    SELECT DISTINCT ON (sub.station_id) sub.station_id, sub.song_title, sub.artist_name
    FROM (
      SELECT station_id, song_title, artist_name, COUNT(*) AS cnt
      FROM airplay_events
      WHERE station_id IN (${Prisma.join(watchedIds)})
        AND started_at >= NOW() - ${days + " days"}::interval
      GROUP BY station_id, song_title, artist_name
      ORDER BY station_id, cnt DESC
    ) sub
  `;

  // Build lookup maps
  const playCountMap = new Map<number, number>();
  for (const row of playCounts) {
    playCountMap.set(Number(row.station_id), Number(row.play_count));
  }

  const topSongMap = new Map<
    number,
    { title: string; artist: string } | null
  >();
  for (const row of topSongs) {
    topSongMap.set(Number(row.station_id), {
      title: row.song_title,
      artist: row.artist_name,
    });
  }

  // Build response cards
  const cards = watchedStations.map((ws) => ({
    stationId: ws.stationId,
    stationName: ws.station.name,
    playCount: playCountMap.get(ws.stationId) ?? 0,
    topSong: topSongMap.get(ws.stationId) ?? null,
  }));

  return reply.send(cards);
}

/**
 * GET /competitors/:stationId/detail
 *
 * Returns detailed competitor intelligence for a specific watched station:
 * top songs, recent detections, and play count comparison with user's own stations.
 */
export async function getCompetitorDetail(
  request: FastifyRequest<{ Params: StationIdParams; Querystring: PeriodQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const competitorStationId = Number(request.params.stationId);
  const period = request.query.period || "day";
  const days = periodToDays(period);

  // Verify station is in user's watched list
  const watched = await prisma.watchedStation.findFirst({
    where: { userId, stationId: competitorStationId },
  });

  if (!watched) {
    return reply
      .code(403)
      .send({ error: "Station is not in your watch list" });
  }

  // Get user's own station IDs for comparison
  const ownStationIds = request.currentUser.scopes
    .filter((s) => s.entityType === "STATION")
    .map((s) => s.entityId);

  // 1. Top songs on competitor station
  const topSongs = await prisma.$queryRaw<
    Array<{
      song_title: string;
      artist_name: string;
      isrc: string | null;
      play_count: number;
    }>
  >`
    SELECT
      song_title,
      artist_name,
      isrc,
      COUNT(*)::int AS play_count
    FROM airplay_events
    WHERE station_id = ${competitorStationId}
      AND started_at >= NOW() - ${days + " days"}::interval
    GROUP BY song_title, artist_name, isrc
    ORDER BY play_count DESC
    LIMIT 20
  `;

  // 2. Recent detections on competitor station
  const recentDetections = await prisma.$queryRaw<
    Array<{
      id: number;
      song_title: string;
      artist_name: string;
      started_at: Date;
    }>
  >`
    SELECT id, song_title, artist_name, started_at
    FROM airplay_events
    WHERE station_id = ${competitorStationId}
    ORDER BY started_at DESC
    LIMIT 50
  `;

  // 3. Comparison: overlapping songs on both competitor and own stations
  let comparison: Array<{
    song_title: string;
    artist_name: string;
    their_plays: number;
    your_plays: number;
  }> = [];

  if (ownStationIds.length > 0) {
    comparison = await prisma.$queryRaw`
      SELECT
        song_title,
        artist_name,
        SUM(CASE WHEN station_id = ${competitorStationId} THEN 1 ELSE 0 END)::int AS their_plays,
        SUM(CASE WHEN station_id IN (${Prisma.join(ownStationIds)}) THEN 1 ELSE 0 END)::int AS your_plays
      FROM airplay_events
      WHERE (station_id = ${competitorStationId} OR station_id IN (${Prisma.join(ownStationIds)}))
        AND started_at >= NOW() - ${days + " days"}::interval
      GROUP BY song_title, artist_name
      HAVING SUM(CASE WHEN station_id = ${competitorStationId} THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN station_id IN (${Prisma.join(ownStationIds)}) THEN 1 ELSE 0 END) > 0
      ORDER BY their_plays DESC
      LIMIT 20
    `;
  }

  return reply.send({
    topSongs: topSongs.map((r) => ({
      title: r.song_title,
      artist: r.artist_name,
      isrc: r.isrc,
      playCount: Number(r.play_count),
    })),
    recentDetections: recentDetections.map((r) => ({
      id: Number(r.id),
      songTitle: r.song_title,
      artistName: r.artist_name,
      startedAt:
        r.started_at instanceof Date
          ? r.started_at.toISOString()
          : String(r.started_at),
    })),
    comparison: comparison.map((r) => ({
      songTitle: r.song_title,
      artistName: r.artist_name,
      theirPlays: Number(r.their_plays),
      yourPlays: Number(r.your_plays),
    })),
  });
}
