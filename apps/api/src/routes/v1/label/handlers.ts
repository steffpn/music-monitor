import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import type {
  AddArtistBody,
  ArtistIdParams,
  ToggleSongBody,
  ComparisonQuery,
  SongIdParams,
  BrowseArtistsQuery,
} from "./schema.js";

/**
 * GET /label/artists
 * Returns all artists associated with this label user, including song counts and total plays.
 */
export async function getLabelArtists(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const labelUserId = request.currentUser.id;

  const labelArtists = await prisma.labelArtist.findMany({
    where: { labelUserId },
    include: {
      monitoredSongs: {
        include: {
          monitoredSong: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  const results = await Promise.all(
    labelArtists.map(async (la) => {
      const monitoredSongIds = la.monitoredSongs.map(
        (lms) => lms.monitoredSongId,
      );
      const songCount = monitoredSongIds.length;

      let totalPlays = 0;
      let topSong: string | null = null;

      if (songCount > 0) {
        // Build activatedAt conditions per song for correct filtering
        const monitoredSongs = la.monitoredSongs.map((lms) => lms.monitoredSong);
        const isrcs = monitoredSongs.map((ms) => ms.isrc);

        // Get total plays with activatedAt filter
        const playRows: Array<{ isrc: string; play_count: bigint | number }>[] =
          await Promise.all(
            monitoredSongs.map((ms) =>
              prisma.$queryRaw<Array<{ isrc: string; play_count: bigint | number }>>`
                SELECT isrc, COUNT(*)::int AS play_count
                FROM airplay_events
                WHERE isrc = ${ms.isrc}
                  AND started_at >= ${ms.activatedAt}
                GROUP BY isrc
              `,
            ),
          );

        const playCounts = new Map<string, number>();
        for (const rows of playRows) {
          for (const row of rows) {
            playCounts.set(
              row.isrc,
              (playCounts.get(row.isrc) || 0) + Number(row.play_count),
            );
          }
        }

        totalPlays = Array.from(playCounts.values()).reduce(
          (sum, c) => sum + c,
          0,
        );

        // Find top song by plays
        let maxPlays = 0;
        for (const ms of monitoredSongs) {
          const plays = playCounts.get(ms.isrc) || 0;
          if (plays > maxPlays) {
            maxPlays = plays;
            topSong = ms.songTitle;
          }
        }
      }

      return {
        id: la.id,
        artistName: la.artistName,
        artistUserId: la.artistUserId,
        pictureUrl: la.pictureUrl,
        songCount,
        totalPlays,
        topSong,
        addedAt: la.addedAt,
      };
    }),
  );

  return reply.send(results);
}

/**
 * POST /label/artists
 * Add an artist to this label's roster.
 */
export async function addLabelArtist(
  request: FastifyRequest<{ Body: AddArtistBody }>,
  reply: FastifyReply,
): Promise<void> {
  const labelUserId = request.currentUser.id;
  const { artistName } = request.body;

  // Try to find an existing artist user with matching name
  const existingArtist = await prisma.user.findFirst({
    where: { role: "ARTIST", name: artistName },
  });

  try {
    let labelArtist = await prisma.labelArtist.create({
      data: {
        labelUserId,
        artistName,
        artistUserId: existingArtist?.id ?? null,
      },
    });

    // Auto-fetch picture from Deezer
    try {
      const deezerRes = await fetch(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`,
      );
      if (deezerRes.ok) {
        const deezerData = (await deezerRes.json()) as {
          data?: Array<{ picture_medium?: string }>;
        };
        const pictureUrl = deezerData.data?.[0]?.picture_medium;
        if (pictureUrl) {
          labelArtist = await prisma.labelArtist.update({
            where: { id: labelArtist.id },
            data: { pictureUrl },
          });
        }
      }
    } catch {
      /* best effort */
    }

    return reply.status(201).send(labelArtist);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply
        .status(409)
        .send({ error: "Artist already added to your label" });
    }
    throw error;
  }
}

/**
 * DELETE /label/artists/:id
 * Remove an artist from this label (cascades to LabelMonitoredSong).
 */
export async function removeLabelArtist(
  request: FastifyRequest<{ Params: ArtistIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const labelUserId = request.currentUser.id;

  const labelArtist = await prisma.labelArtist.findFirst({
    where: { id, labelUserId },
  });

  if (!labelArtist) {
    return reply.status(404).send({ error: "Label artist not found" });
  }

  await prisma.labelArtist.delete({ where: { id } });

  return reply.status(204).send();
}

/**
 * GET /label/artists/:id/songs
 * Returns all MonitoredSong entries for the artist, indicating which are linked to this label.
 */
export async function getLabelArtistSongs(
  request: FastifyRequest<{ Params: ArtistIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const labelUserId = request.currentUser.id;

  const labelArtist = await prisma.labelArtist.findFirst({
    where: { id, labelUserId },
  });

  if (!labelArtist) {
    return reply.status(404).send({ error: "Label artist not found" });
  }

  // Get all monitored songs for this artist name
  const allSongs = await prisma.monitoredSong.findMany({
    where: { artistName: labelArtist.artistName, status: "active" },
  });

  // Get which songs are linked via LabelMonitoredSong
  const linkedSongs = await prisma.labelMonitoredSong.findMany({
    where: { labelArtistId: id },
    select: { monitoredSongId: true },
  });

  const linkedSongIds = new Set(linkedSongs.map((ls) => ls.monitoredSongId));

  const results = await Promise.all(
    allSongs.map(async (song) => {
      const isMonitored = linkedSongIds.has(song.id);
      let totalPlays = 0;
      let stationCount = 0;

      if (isMonitored) {
        const playData = await prisma.$queryRaw<
          Array<{ total_plays: bigint | number; station_count: bigint | number }>
        >`
          SELECT
            COUNT(*)::int AS total_plays,
            COUNT(DISTINCT station_id)::int AS station_count
          FROM airplay_events
          WHERE isrc = ${song.isrc}
            AND started_at >= ${song.activatedAt}
        `;

        if (playData.length > 0) {
          totalPlays = Number(playData[0].total_plays);
          stationCount = Number(playData[0].station_count);
        }
      }

      return {
        id: song.id,
        songTitle: song.songTitle,
        artistName: song.artistName,
        isrc: song.isrc,
        isMonitored,
        totalPlays,
        stationCount,
        activatedAt: song.activatedAt,
      };
    }),
  );

  return reply.send(results);
}

/**
 * POST /label/artists/:id/songs
 * Toggle monitoring for a song under this label artist.
 */
export async function toggleLabelSongMonitoring(
  request: FastifyRequest<{ Params: ArtistIdParams; Body: ToggleSongBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const { songTitle, artistName, isrc, enabled } = request.body;
  const labelUserId = request.currentUser.id;

  const labelArtist = await prisma.labelArtist.findFirst({
    where: { id, labelUserId },
  });

  if (!labelArtist) {
    return reply.status(404).send({ error: "Label artist not found" });
  }

  if (enabled) {
    // Find or create the MonitoredSong
    let monitoredSong = await prisma.monitoredSong.findFirst({
      where: { isrc, artistName },
    });

    if (!monitoredSong) {
      // Create with the label user as the owner, activatedAt = now
      monitoredSong = await prisma.monitoredSong.create({
        data: {
          userId: labelUserId,
          songTitle,
          artistName,
          isrc,
          activatedAt: new Date(),
          status: "active",
        },
      });
    }

    // Create the link (ignore if already exists)
    try {
      await prisma.labelMonitoredSong.create({
        data: {
          labelArtistId: id,
          monitoredSongId: monitoredSong.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Already linked, that's fine
      } else {
        throw error;
      }
    }

    return reply.send({
      id: monitoredSong.id,
      songTitle: monitoredSong.songTitle,
      artistName: monitoredSong.artistName,
      isrc: monitoredSong.isrc,
      isMonitored: true,
      activatedAt: monitoredSong.activatedAt,
    });
  } else {
    // Remove the link, don't delete the MonitoredSong itself
    const monitoredSong = await prisma.monitoredSong.findFirst({
      where: { isrc, artistName },
    });

    if (monitoredSong) {
      await prisma.labelMonitoredSong.deleteMany({
        where: {
          labelArtistId: id,
          monitoredSongId: monitoredSong.id,
        },
      });

      return reply.send({
        id: monitoredSong.id,
        songTitle: monitoredSong.songTitle,
        artistName: monitoredSong.artistName,
        isrc: monitoredSong.isrc,
        isMonitored: false,
        activatedAt: monitoredSong.activatedAt,
      });
    }

    return reply.send({
      songTitle,
      artistName,
      isrc,
      isMonitored: false,
      activatedAt: null,
    });
  }
}

/**
 * GET /label/dashboard
 * Aggregated dashboard for the label: total plays, per-artist summaries, catalog songs.
 */
export async function getLabelDashboard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const labelUserId = request.currentUser.id;

  const labelArtists = await prisma.labelArtist.findMany({
    where: { labelUserId },
    include: {
      monitoredSongs: {
        include: {
          monitoredSong: true,
        },
      },
    },
  });

  // Collect all monitored songs with their activatedAt dates
  const allMonitoredSongs = labelArtists.flatMap((la) =>
    la.monitoredSongs.map((lms) => ({
      ...lms.monitoredSong,
      labelArtistName: la.artistName,
    })),
  );

  // Get play counts and station counts per song respecting activatedAt
  const songPlays = new Map<number, number>();
  const songStations = new Map<number, number>();
  await Promise.all(
    allMonitoredSongs.map(async (ms) => {
      const rows = await prisma.$queryRaw<
        Array<{ play_count: bigint | number; station_count: bigint | number }>
      >`
        SELECT COUNT(*)::int AS play_count, COUNT(DISTINCT station_id)::int AS station_count
        FROM airplay_events
        WHERE isrc = ${ms.isrc}
          AND started_at >= ${ms.activatedAt}
      `;
      songPlays.set(ms.id, rows.length > 0 ? Number(rows[0].play_count) : 0);
      songStations.set(ms.id, rows.length > 0 ? Number(rows[0].station_count) : 0);
    }),
  );

  const totalPlays = Array.from(songPlays.values()).reduce(
    (sum, c) => sum + c,
    0,
  );

  // Per-artist summaries
  const artistSummaries = labelArtists.map((la) => {
    const artistSongs = la.monitoredSongs.map((lms) => lms.monitoredSong);
    let artistTotalPlays = 0;
    let topSong: string | null = null;
    let maxPlays = 0;

    for (const ms of artistSongs) {
      const plays = songPlays.get(ms.id) || 0;
      artistTotalPlays += plays;
      if (plays > maxPlays) {
        maxPlays = plays;
        topSong = ms.songTitle;
      }
    }

    return {
      artistName: la.artistName,
      pictureUrl: la.pictureUrl,
      songCount: artistSongs.length,
      totalPlays: artistTotalPlays,
      topSong,
    };
  });

  // Catalog songs sorted by plays DESC
  const catalogSongs = allMonitoredSongs
    .map((ms) => ({
      id: ms.id,
      songTitle: ms.songTitle,
      artistName: ms.labelArtistName,
      isrc: ms.isrc,
      totalPlays: songPlays.get(ms.id) || 0,
      stationCount: songStations.get(ms.id) || 0,
      activatedAt: ms.activatedAt,
    }))
    .sort((a, b) => b.totalPlays - a.totalPlays);

  return reply.send({ totalPlays, artistSummaries, catalogSongs });
}

/**
 * GET /label/comparison?artistIds=1,2,3&period=week
 * Compare daily play counts across multiple label artists.
 */
export async function getArtistComparison(
  request: FastifyRequest<{ Querystring: ComparisonQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const labelUserId = request.currentUser.id;
  const artistIds = request.query.artistIds
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  const period = request.query.period || "week";
  const days = period === "month" ? 30 : 7;

  if (artistIds.length === 0) {
    return reply.status(400).send({ error: "No valid artist IDs provided" });
  }

  // Verify all artist IDs belong to this label user
  const labelArtists = await prisma.labelArtist.findMany({
    where: { id: { in: artistIds }, labelUserId },
    include: {
      monitoredSongs: {
        include: {
          monitoredSong: true,
        },
      },
    },
  });

  if (labelArtists.length !== artistIds.length) {
    return reply
      .status(403)
      .send({ error: "Some artist IDs do not belong to your label" });
  }

  const artists = await Promise.all(
    labelArtists.map(async (la) => {
      const monitoredSongs = la.monitoredSongs.map((lms) => lms.monitoredSong);
      const isrcs = monitoredSongs.map((ms) => ms.isrc);

      let dailyPlays: Array<{ date: string; count: number }> = [];

      if (isrcs.length > 0) {
        // Build earliest activatedAt for this artist's songs
        const earliestActivatedAt = monitoredSongs.reduce(
          (earliest, ms) =>
            ms.activatedAt < earliest ? ms.activatedAt : earliest,
          monitoredSongs[0].activatedAt,
        );

        const rows = await prisma.$queryRaw<
          Array<{ day: Date; play_count: bigint | number }>
        >`
          SELECT
            DATE_TRUNC('day', started_at) AS day,
            COUNT(*)::int AS play_count
          FROM airplay_events
          WHERE isrc IN (${Prisma.join(isrcs)})
            AND started_at >= ${earliestActivatedAt}
            AND started_at >= NOW() - ${days + " days"}::interval
          GROUP BY DATE_TRUNC('day', started_at)
          ORDER BY day ASC
        `;

        dailyPlays = rows.map((r) => ({
          date:
            r.day instanceof Date
              ? r.day.toISOString().split("T")[0]
              : String(r.day),
          count: Number(r.play_count),
        }));
      }

      return {
        artistName: la.artistName,
        dailyPlays,
      };
    }),
  );

  return reply.send({ artists });
}

/**
 * GET /label/station-affinity
 * Shows which stations play the label's monitored songs the most.
 */
export async function getStationAffinity(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const labelUserId = request.currentUser.id;

  // Get all monitored ISRCs for this label
  const labelArtists = await prisma.labelArtist.findMany({
    where: { labelUserId },
    include: {
      monitoredSongs: {
        include: {
          monitoredSong: true,
        },
      },
    },
  });

  const monitoredSongs = labelArtists.flatMap((la) =>
    la.monitoredSongs.map((lms) => lms.monitoredSong),
  );

  if (monitoredSongs.length === 0) {
    return reply.send([]);
  }

  const isrcs = monitoredSongs.map((ms) => ms.isrc);
  const earliestActivatedAt = monitoredSongs.reduce(
    (earliest, ms) =>
      ms.activatedAt < earliest ? ms.activatedAt : earliest,
    monitoredSongs[0].activatedAt,
  );

  // Get label plays per station
  const labelPlayRows = await prisma.$queryRaw<
    Array<{
      station_id: number;
      station_name: string;
      logo_url: string | null;
      label_plays: bigint | number;
    }>
  >`
    SELECT
      ae.station_id,
      s.name AS station_name,
      s.logo_url,
      COUNT(*)::int AS label_plays
    FROM airplay_events ae
    JOIN stations s ON s.id = ae.station_id
    WHERE ae.isrc IN (${Prisma.join(isrcs)})
      AND ae.started_at >= ${earliestActivatedAt}
    GROUP BY ae.station_id, s.name, s.logo_url
    ORDER BY label_plays DESC
  `;

  if (labelPlayRows.length === 0) {
    return reply.send([]);
  }

  // Get total plays per station for the same period
  const stationIds = labelPlayRows.map((r) => r.station_id);
  const totalPlayRows = await prisma.$queryRaw<
    Array<{ station_id: number; total_plays: bigint | number }>
  >`
    SELECT
      station_id,
      COUNT(*)::int AS total_plays
    FROM airplay_events
    WHERE station_id IN (${Prisma.join(stationIds)})
      AND started_at >= ${earliestActivatedAt}
    GROUP BY station_id
  `;

  const totalPlaysMap = new Map(
    totalPlayRows.map((r) => [r.station_id, Number(r.total_plays)]),
  );

  const results = labelPlayRows.map((r) => {
    const labelPlays = Number(r.label_plays);
    const totalStationPlays = totalPlaysMap.get(r.station_id) || 0;
    const affinityPercent =
      totalStationPlays > 0
        ? Math.round((labelPlays / totalStationPlays) * 10000) / 100
        : 0;

    return {
      stationId: r.station_id,
      stationName: r.station_name,
      logoUrl: r.logo_url,
      labelPlays,
      totalStationPlays,
      affinityPercent,
    };
  });

  // Sort by affinityPercent DESC
  results.sort((a, b) => b.affinityPercent - a.affinityPercent);

  return reply.send(results);
}

/**
 * GET /label/releases/:id/tracker
 * Track a song's performance over its first 14 days from activation.
 */
export async function getReleaseTracker(
  request: FastifyRequest<{ Params: SongIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const labelUserId = request.currentUser.id;

  // Verify the song belongs to a LabelArtist of this label
  const labelMonitoredSong = await prisma.labelMonitoredSong.findFirst({
    where: {
      monitoredSongId: id,
      labelArtist: { labelUserId },
    },
    include: {
      monitoredSong: true,
      labelArtist: true,
    },
  });

  if (!labelMonitoredSong) {
    return reply.status(404).send({ error: "Song not found in your label" });
  }

  const song = labelMonitoredSong.monitoredSong;

  // Get daily plays for the first 14 days from activatedAt
  const fourteenDaysLater = new Date(song.activatedAt);
  fourteenDaysLater.setDate(fourteenDaysLater.getDate() + 14);

  const rows = await prisma.$queryRaw<
    Array<{ day: Date; play_count: bigint | number }>
  >`
    SELECT
      DATE_TRUNC('day', started_at) AS day,
      COUNT(*)::int AS play_count
    FROM airplay_events
    WHERE isrc = ${song.isrc}
      AND started_at >= ${song.activatedAt}
      AND started_at < ${fourteenDaysLater}
    GROUP BY DATE_TRUNC('day', started_at)
    ORDER BY day ASC
  `;

  const dailyPlays = rows.map((r) => ({
    date:
      r.day instanceof Date
        ? r.day.toISOString().split("T")[0]
        : String(r.day),
    count: Number(r.play_count),
  }));

  // Calculate first week total (days 0-6)
  const sevenDaysLater = new Date(song.activatedAt);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const totalFirstWeek = dailyPlays
    .filter((dp) => new Date(dp.date) < sevenDaysLater)
    .reduce((sum, dp) => sum + dp.count, 0);

  return reply.send({
    song: {
      title: song.songTitle,
      artist: song.artistName,
      isrc: song.isrc,
      activatedAt: song.activatedAt,
    },
    dailyPlays,
    totalFirstWeek,
  });
}

/**
 * GET /label/browse-artists?q=vescan&limit=20
 * Search for artists globally via Deezer API.
 * Returns artist name, photo, fan count.
 */
export async function browseArtists(
  request: FastifyRequest<{ Querystring: BrowseArtistsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { q, limit = 20 } = request.query;

  if (!q || q.trim().length === 0) {
    return reply.send([]);
  }

  try {
    const params = new URLSearchParams({
      q: q.trim(),
      limit: String(limit),
    });

    const response = await fetch(
      `https://api.deezer.com/search/artist?${params}`,
    );

    if (!response.ok) {
      return reply.status(502).send({ error: "Deezer API error" });
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: number;
        name: string;
        picture_medium: string;
        picture_big: string;
        nb_fan: number;
        nb_album: number;
      }>;
    };

    const results = (data.data || []).map((a) => ({
      deezerId: a.id,
      name: a.name,
      pictureUrl: a.picture_medium,
      pictureBigUrl: a.picture_big,
      fanCount: a.nb_fan,
      albumCount: a.nb_album,
    }));

    return reply.send(results);
  } catch {
    return reply.status(502).send({ error: "Failed to search artists" });
  }
}

/**
 * GET /label/browse-artists/:deezerId/tracks
 * Get an artist's top tracks from Deezer with ISRC codes.
 */
export async function browseArtistTracks(
  request: FastifyRequest<{ Params: { deezerId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { deezerId } = request.params;

  try {
    // Get top tracks
    const topResponse = await fetch(
      `https://api.deezer.com/artist/${deezerId}/top?limit=50`,
    );

    if (!topResponse.ok) {
      return reply.status(502).send({ error: "Deezer API error" });
    }

    const topData = (await topResponse.json()) as {
      data?: Array<{
        id: number;
        title: string;
        duration: number;
        album?: { title?: string; cover_medium?: string };
      }>;
    };

    // Fetch ISRC for each track (Deezer top endpoint doesn't include it)
    const tracks = await Promise.all(
      (topData.data || []).map(async (t) => {
        let isrc: string | null = null;
        try {
          const trackResponse = await fetch(
            `https://api.deezer.com/track/${t.id}`,
          );
          if (trackResponse.ok) {
            const trackData = (await trackResponse.json()) as {
              isrc?: string;
            };
            isrc = trackData.isrc || null;
          }
        } catch {
          // Best effort
        }

        return {
          deezerTrackId: t.id,
          title: t.title,
          duration: t.duration,
          isrc,
          albumTitle: t.album?.title || null,
          albumCoverUrl: t.album?.cover_medium || null,
        };
      }),
    );

    return reply.send(tracks);
  } catch {
    return reply.status(502).send({ error: "Failed to fetch artist tracks" });
  }
}
