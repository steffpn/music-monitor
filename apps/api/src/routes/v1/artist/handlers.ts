import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import type {
  SongIdParams,
  AddMonitoredSongBody,
  SongAnalyticsQuery,
} from "./schema.js";

// --- Date helpers ---

function getStartOfWeek(): Date {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
}

function getStartOfLastWeek(): Date {
  const startOfWeek = getStartOfWeek();
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  return startOfLastWeek;
}

function getEndOfLastWeek(): Date {
  const startOfWeek = getStartOfWeek();
  const endOfLastWeek = new Date(startOfWeek);
  endOfLastWeek.setMilliseconds(-1);
  return endOfLastWeek;
}

function getStartOfToday(): Date {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function computeTrend(
  thisWeek: number,
  lastWeek: number,
): { direction: "up" | "down" | "flat"; percentChange: number } {
  if (lastWeek === 0 && thisWeek === 0) {
    return { direction: "flat", percentChange: 0 };
  }
  if (lastWeek === 0) {
    return { direction: "up", percentChange: 100 };
  }
  const percentChange = Math.round(
    ((thisWeek - lastWeek) / lastWeek) * 100,
  );
  const direction =
    percentChange > 0 ? "up" : percentChange < 0 ? "down" : "flat";
  return { direction, percentChange: Math.abs(percentChange) };
}

// --- Helper to verify song ownership ---

async function getOwnedSong(userId: number, songId: number, userRole?: string) {
  const song = await prisma.monitoredSong.findUnique({
    where: { id: songId },
  });
  if (!song) return null;

  // Direct ownership (artist owns the song)
  if (song.userId === userId) return song;

  // Label ownership (song is linked via label_monitored_songs)
  if (userRole === "LABEL" || userRole === "ADMIN") {
    const labelLink = await prisma.labelMonitoredSong.findFirst({
      where: {
        monitoredSongId: songId,
        labelArtist: { labelUserId: userId },
      },
    });
    if (labelLink) return song;
  }

  // Admin can access any song
  if (userRole === "ADMIN") return song;

  return null;
}

// --- Handlers ---

/**
 * GET /artist/songs - List all monitored songs for the current artist.
 */
export async function getArtistSongs(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;

  const songs = await prisma.monitoredSong.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const startOfWeek = getStartOfWeek();
  const startOfLastWeek = getStartOfLastWeek();
  const endOfLastWeek = getEndOfLastWeek();

  const results = await Promise.all(
    songs.map(async (song) => {
      if (song.status !== "active") {
        return {
          id: song.id,
          songTitle: song.songTitle,
          artistName: song.artistName,
          isrc: song.isrc,
          status: song.status,
          activatedAt: song.activatedAt,
          totalPlays: 0,
          stationCount: 0,
          trend: { direction: "flat" as const, percentChange: 0 },
        };
      }

      const totals: Array<{ plays: bigint; stations: bigint }> =
        await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS plays, COUNT(DISTINCT station_id)::bigint AS stations
          FROM airplay_events
          WHERE isrc = ${song.isrc} AND started_at >= ${song.activatedAt}
        `;

      const thisWeekRows: Array<{ count: bigint }> =
        await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS count
          FROM airplay_events
          WHERE isrc = ${song.isrc}
            AND started_at >= ${startOfWeek > song.activatedAt ? startOfWeek : song.activatedAt}
            AND started_at <= NOW()
        `;

      const lastWeekRows: Array<{ count: bigint }> =
        await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS count
          FROM airplay_events
          WHERE isrc = ${song.isrc}
            AND started_at >= ${startOfLastWeek > song.activatedAt ? startOfLastWeek : song.activatedAt}
            AND started_at <= ${endOfLastWeek}
            AND started_at >= ${song.activatedAt}
        `;

      const thisWeekCount = Number(thisWeekRows[0]?.count ?? 0);
      const lastWeekCount = Number(lastWeekRows[0]?.count ?? 0);
      const trend = computeTrend(thisWeekCount, lastWeekCount);

      return {
        id: song.id,
        songTitle: song.songTitle,
        artistName: song.artistName,
        isrc: song.isrc,
        status: song.status,
        activatedAt: song.activatedAt,
        totalPlays: Number(totals[0]?.plays ?? 0),
        stationCount: Number(totals[0]?.stations ?? 0),
        trend,
      };
    }),
  );

  return reply.send(results);
}

/**
 * POST /artist/songs - Add a new monitored song.
 */
export async function addArtistSong(
  request: FastifyRequest<{ Body: AddMonitoredSongBody }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { songTitle, artistName, isrc } = request.body;

  // Artists can only monitor their own songs (case-insensitive)
  if (artistName.toLowerCase() !== request.currentUser.name.toLowerCase()) {
    return reply.status(403).send({
      error: "Artists can only monitor their own songs",
    });
  }

  try {
    const song = await prisma.monitoredSong.create({
      data: {
        userId,
        songTitle,
        artistName,
        isrc,
        activatedAt: new Date(),
        status: "active",
      },
    });

    return reply.status(201).send(song);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply.status(409).send({
        error: "You are already monitoring a song with this ISRC",
      });
    }
    throw error;
  }
}

/**
 * GET /artist/songs/:id/analytics - Daily play analytics for a song.
 */
export async function getSongAnalytics(
  request: FastifyRequest<{
    Params: SongIdParams;
    Querystring: SongAnalyticsQuery;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { id } = request.params;

  const song = await getOwnedSong(userId, id, request.currentUser.role);
  if (!song) {
    return reply.status(404).send({ error: "Song not found" });
  }

  const dailyPlays: Array<{ date: Date; count: bigint }> =
    await prisma.$queryRaw`
      SELECT DATE_TRUNC('day', started_at) AS date, COUNT(*)::bigint AS count
      FROM airplay_events
      WHERE isrc = ${song.isrc} AND started_at >= ${song.activatedAt}
      GROUP BY DATE_TRUNC('day', started_at)
      ORDER BY date ASC
    `;

  const totals: Array<{ plays: bigint; stations: bigint }> =
    await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS plays, COUNT(DISTINCT station_id)::bigint AS stations
      FROM airplay_events
      WHERE isrc = ${song.isrc} AND started_at >= ${song.activatedAt}
    `;

  return reply.send({
    song: {
      id: song.id,
      songTitle: song.songTitle,
      artistName: song.artistName,
      isrc: song.isrc,
      activatedAt: song.activatedAt,
    },
    dailyPlays: dailyPlays.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
      count: Number(row.count),
    })),
    totalPlays: Number(totals[0]?.plays ?? 0),
    stationCount: Number(totals[0]?.stations ?? 0),
  });
}

/**
 * GET /artist/songs/:id/station-breakdown - Play counts grouped by station.
 */
export async function getStationBreakdown(
  request: FastifyRequest<{ Params: SongIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { id } = request.params;

  const song = await getOwnedSong(userId, id, request.currentUser.role);
  if (!song) {
    return reply.status(404).send({ error: "Song not found" });
  }

  const rows: Array<{
    station_id: number;
    station_name: string;
    logo_url: string | null;
    play_count: bigint;
  }> = await prisma.$queryRaw`
    SELECT
      ae.station_id,
      s.name AS station_name,
      s.logo_url,
      COUNT(*)::bigint AS play_count
    FROM airplay_events ae
    JOIN stations s ON s.id = ae.station_id
    WHERE ae.isrc = ${song.isrc} AND ae.started_at >= ${song.activatedAt}
    GROUP BY ae.station_id, s.name, s.logo_url
    ORDER BY play_count DESC
  `;

  return reply.send(
    rows.map((row) => ({
      stationId: Number(row.station_id),
      stationName: row.station_name,
      logoUrl: row.logo_url,
      playCount: Number(row.play_count),
    })),
  );
}

/**
 * GET /artist/songs/:id/hourly-heatmap - 7x24 matrix of play counts.
 */
export async function getHourlyHeatmap(
  request: FastifyRequest<{ Params: SongIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { id } = request.params;

  const song = await getOwnedSong(userId, id, request.currentUser.role);
  if (!song) {
    return reply.status(404).send({ error: "Song not found" });
  }

  const rows: Array<{
    day_of_week: number;
    hour: number;
    plays: number;
  }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(dow FROM started_at)::int AS day_of_week,
      EXTRACT(hour FROM started_at)::int AS hour,
      COUNT(*)::int AS plays
    FROM airplay_events
    WHERE isrc = ${song.isrc} AND started_at >= ${song.activatedAt}
    GROUP BY day_of_week, hour
    ORDER BY day_of_week, hour
  `;

  // Build 7x24 matrix (0=Sunday .. 6=Saturday, 0-23 hours)
  const matrix: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );

  let maxValue = 0;
  for (const row of rows) {
    matrix[row.day_of_week][row.hour] = row.plays;
    if (row.plays > maxValue) {
      maxValue = row.plays;
    }
  }

  return reply.send({ matrix, maxValue });
}

/**
 * GET /artist/songs/:id/peak-hours - Top 5 busiest hour slots.
 */
export async function getPeakHours(
  request: FastifyRequest<{ Params: SongIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { id } = request.params;

  const song = await getOwnedSong(userId, id, request.currentUser.role);
  if (!song) {
    return reply.status(404).send({ error: "Song not found" });
  }

  const rows: Array<{
    day_of_week: number;
    hour: number;
    plays: number;
  }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(dow FROM started_at)::int AS day_of_week,
      EXTRACT(hour FROM started_at)::int AS hour,
      COUNT(*)::int AS plays
    FROM airplay_events
    WHERE isrc = ${song.isrc} AND started_at >= ${song.activatedAt}
    GROUP BY day_of_week, hour
    ORDER BY plays DESC
    LIMIT 5
  `;

  return reply.send(
    rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      hour: row.hour,
      plays: row.plays,
      label: `${DAY_NAMES[row.day_of_week]} ${String(row.hour).padStart(2, "0")}:00`,
    })),
  );
}

/**
 * GET /artist/songs/:id/trend - This week vs last week comparison.
 */
export async function getSongTrend(
  request: FastifyRequest<{ Params: SongIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;
  const { id } = request.params;

  const song = await getOwnedSong(userId, id, request.currentUser.role);
  if (!song) {
    return reply.status(404).send({ error: "Song not found" });
  }

  const startOfWeek = getStartOfWeek();
  const startOfLastWeek = getStartOfLastWeek();
  const endOfLastWeek = getEndOfLastWeek();
  const now = new Date();

  // Ensure we never query before activatedAt
  const thisWeekStart =
    startOfWeek > song.activatedAt ? startOfWeek : song.activatedAt;
  const lastWeekStart =
    startOfLastWeek > song.activatedAt ? startOfLastWeek : song.activatedAt;

  const thisWeekRows: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*)::bigint AS count
    FROM airplay_events
    WHERE isrc = ${song.isrc}
      AND started_at >= ${thisWeekStart}
      AND started_at <= ${now}
  `;

  const lastWeekRows: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*)::bigint AS count
    FROM airplay_events
    WHERE isrc = ${song.isrc}
      AND started_at >= ${lastWeekStart}
      AND started_at <= ${endOfLastWeek}
      AND started_at >= ${song.activatedAt}
  `;

  const thisWeek = Number(thisWeekRows[0]?.count ?? 0);
  const lastWeek = Number(lastWeekRows[0]?.count ?? 0);
  const { direction, percentChange } = computeTrend(thisWeek, lastWeek);

  return reply.send({
    thisWeek,
    lastWeek,
    percentChange,
    direction,
  });
}

/**
 * GET /artist/dashboard - Overview dashboard for the artist.
 */
export async function getArtistDashboard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;

  const songs = await prisma.monitoredSong.findMany({
    where: { userId, status: "active" },
  });

  if (songs.length === 0) {
    return reply.send({
      totalPlaysToday: 0,
      totalPlaysWeek: 0,
      mostPlayedSong: null,
      weeklyDigest: [],
    });
  }

  const startOfToday = getStartOfToday();
  const startOfWeek = getStartOfWeek();
  const now = new Date();

  let totalPlaysToday = 0;
  let totalPlaysWeek = 0;
  let mostPlayedSong: {
    title: string;
    artist: string;
    plays: number;
  } | null = null;

  for (const song of songs) {
    const todayStart =
      startOfToday > song.activatedAt ? startOfToday : song.activatedAt;
    const weekStart =
      startOfWeek > song.activatedAt ? startOfWeek : song.activatedAt;

    const todayRows: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM airplay_events
      WHERE isrc = ${song.isrc}
        AND started_at >= ${todayStart}
        AND started_at <= ${now}
    `;

    const weekRows: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM airplay_events
      WHERE isrc = ${song.isrc}
        AND started_at >= ${weekStart}
        AND started_at <= ${now}
    `;

    const todayCount = Number(todayRows[0]?.count ?? 0);
    const weekCount = Number(weekRows[0]?.count ?? 0);

    totalPlaysToday += todayCount;
    totalPlaysWeek += weekCount;

    if (!mostPlayedSong || weekCount > mostPlayedSong.plays) {
      mostPlayedSong = {
        title: song.songTitle,
        artist: song.artistName,
        plays: weekCount,
      };
    }
  }

  return reply.send({
    totalPlaysToday,
    totalPlaysWeek,
    mostPlayedSong,
  });
}

/**
 * GET /artist/weekly-digest - Per-song weekly comparison with new stations.
 */
export async function getWeeklyDigest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.currentUser.id;

  const songs = await prisma.monitoredSong.findMany({
    where: { userId, status: "active" },
  });

  const startOfWeek = getStartOfWeek();
  const startOfLastWeek = getStartOfLastWeek();
  const endOfLastWeek = getEndOfLastWeek();
  const now = new Date();

  const digest = await Promise.all(
    songs.map(async (song) => {
      const thisWeekStart =
        startOfWeek > song.activatedAt ? startOfWeek : song.activatedAt;
      const lastWeekStart =
        startOfLastWeek > song.activatedAt
          ? startOfLastWeek
          : song.activatedAt;

      const thisWeekRows: Array<{ count: bigint }> =
        await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS count
          FROM airplay_events
          WHERE isrc = ${song.isrc}
            AND started_at >= ${thisWeekStart}
            AND started_at <= ${now}
        `;

      const lastWeekRows: Array<{ count: bigint }> =
        await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS count
          FROM airplay_events
          WHERE isrc = ${song.isrc}
            AND started_at >= ${lastWeekStart}
            AND started_at <= ${endOfLastWeek}
            AND started_at >= ${song.activatedAt}
        `;

      const playsThisWeek = Number(thisWeekRows[0]?.count ?? 0);
      const playsLastWeek = Number(lastWeekRows[0]?.count ?? 0);
      const { direction, percentChange } = computeTrend(
        playsThisWeek,
        playsLastWeek,
      );

      // New stations: stations where first detection of this ISRC was this week
      const newStationRows: Array<{ name: string }> =
        await prisma.$queryRaw`
          SELECT s.name
          FROM airplay_events ae
          JOIN stations s ON s.id = ae.station_id
          WHERE ae.isrc = ${song.isrc}
            AND ae.started_at >= ${song.activatedAt}
          GROUP BY s.id, s.name
          HAVING MIN(ae.started_at) >= ${startOfWeek}
        `;

      return {
        songTitle: song.songTitle,
        artistName: song.artistName,
        isrc: song.isrc,
        playsThisWeek,
        playsLastWeek,
        percentChange,
        direction,
        newStations: newStationRows.map((r) => r.name),
      };
    }),
  );

  return reply.send({ songs: digest });
}
