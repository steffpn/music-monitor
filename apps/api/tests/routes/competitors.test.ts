import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock ----
const mockQueryRaw = vi.fn();
const mockUserFindUnique = vi.fn();
const mockWatchedStationFindMany = vi.fn();
const mockWatchedStationCreate = vi.fn();
const mockWatchedStationCount = vi.fn();
const mockWatchedStationDeleteMany = vi.fn();
const mockWatchedStationFindFirst = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      count: vi.fn().mockResolvedValue(1),
    },
    airplayEvent: {
      findUnique: vi.fn(),
    },
    watchedStation: {
      findMany: (...args: unknown[]) => mockWatchedStationFindMany(...args),
      create: (...args: unknown[]) => mockWatchedStationCreate(...args),
      count: (...args: unknown[]) => mockWatchedStationCount(...args),
      deleteMany: (...args: unknown[]) => mockWatchedStationDeleteMany(...args),
      findFirst: (...args: unknown[]) => mockWatchedStationFindFirst(...args),
    },
  },
}));

// ---- R2 mock ----
vi.mock("../../src/lib/r2.js", () => ({
  getPresignedUrl: vi.fn(),
  r2Client: null,
  uploadToR2: vi.fn(),
}));

// ---- Redis mock ----
vi.mock("../../src/lib/redis.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    disconnect: vi.fn(),
  },
}));

// ---- Auth mock users ----
const mockStationUser = {
  id: 2,
  email: "station@test.com",
  name: "Station User",
  role: "STATION",
  isActive: true,
  scopes: [
    { id: 2, userId: 2, entityType: "STATION", entityId: 5 },
    { id: 3, userId: 2, entityType: "STATION", entityId: 10 },
  ],
};

const mockArtistUser = {
  id: 3,
  email: "artist@test.com",
  name: "Artist User",
  role: "ARTIST",
  isActive: true,
  scopes: [{ id: 4, userId: 3, entityType: "ARTIST", entityId: 1 }],
};

describe("Competitor Routes", () => {
  let server: Awaited<typeof import("../../src/index.js")>["server"];
  let stationToken: string;
  let artistToken: string;

  beforeEach(async () => {
    mockQueryRaw.mockClear();
    mockUserFindUnique.mockClear();
    mockWatchedStationFindMany.mockClear();
    mockWatchedStationCreate.mockClear();
    mockWatchedStationCount.mockClear();
    mockWatchedStationDeleteMany.mockClear();
    mockWatchedStationFindFirst.mockClear();

    const mod = await import("../../src/index.js");
    server = mod.server;
    await server.ready();

    stationToken = server.jwt.sign({ sub: mockStationUser.id });
    artistToken = server.jwt.sign({ sub: mockArtistUser.id });

    mockUserFindUnique.mockImplementation(({ where }: { where: { id: number } }) => {
      if (where.id === mockStationUser.id) return Promise.resolve(mockStationUser);
      if (where.id === mockArtistUser.id) return Promise.resolve(mockArtistUser);
      return Promise.resolve(null);
    });
  });

  // --- GET /api/v1/competitors/watched ---

  describe("GET /api/v1/competitors/watched", () => {
    it("returns 401 without authentication", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/watched",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-STATION roles", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/watched",
        headers: { authorization: `Bearer ${artistToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns watched stations for STATION-role user", async () => {
      mockWatchedStationFindMany.mockResolvedValueOnce([
        { id: 1, stationId: 20, station: { name: "Radio ZU" } },
        { id: 2, stationId: 21, station: { name: "Kiss FM" } },
      ]);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/watched",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({ id: 1, stationId: 20, stationName: "Radio ZU" });
      expect(body[1]).toMatchObject({ id: 2, stationId: 21, stationName: "Kiss FM" });
    });
  });

  // --- POST /api/v1/competitors/watched ---

  describe("POST /api/v1/competitors/watched", () => {
    it("returns 401 without authentication", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 20 },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-STATION roles", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 20 },
        headers: { authorization: `Bearer ${artistToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("adds a watched station and returns 201", async () => {
      mockWatchedStationCount.mockResolvedValueOnce(0);
      mockWatchedStationCreate.mockResolvedValueOnce({
        id: 1,
        stationId: 20,
        station: { name: "Radio ZU" },
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 20 },
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toMatchObject({ id: 1, stationId: 20, stationName: "Radio ZU" });
    });

    it("returns 409 when station is already watched (P2002 duplicate)", async () => {
      mockWatchedStationCount.mockResolvedValueOnce(1);
      const prismaError = new Error("Unique constraint failed");
      Object.assign(prismaError, { code: "P2002" });
      mockWatchedStationCreate.mockRejectedValueOnce(prismaError);

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 20 },
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(409);
    });

    it("returns 400 when user has 20 watched stations", async () => {
      mockWatchedStationCount.mockResolvedValueOnce(20);

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 30 },
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain("Maximum 20");
    });

    it("returns 400 when trying to watch own station", async () => {
      // stationId 5 is in mockStationUser scopes
      mockWatchedStationCount.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/competitors/watched",
        payload: { stationId: 5 },
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain("Cannot watch your own station");
    });
  });

  // --- DELETE /api/v1/competitors/watched/:stationId ---

  describe("DELETE /api/v1/competitors/watched/:stationId", () => {
    it("returns 401 without authentication", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/competitors/watched/20",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-STATION roles", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/competitors/watched/20",
        headers: { authorization: `Bearer ${artistToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("removes a watched station and returns 204", async () => {
      mockWatchedStationDeleteMany.mockResolvedValueOnce({ count: 1 });

      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/competitors/watched/20",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 when station not in watched list", async () => {
      mockWatchedStationDeleteMany.mockResolvedValueOnce({ count: 0 });

      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/competitors/watched/999",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // --- GET /api/v1/competitors/summary ---

  describe("GET /api/v1/competitors/summary", () => {
    it("returns 401 without authentication", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/summary",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-STATION roles", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/summary",
        headers: { authorization: `Bearer ${artistToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns competitor cards with play count and top song", async () => {
      mockWatchedStationFindMany.mockResolvedValueOnce([
        { id: 1, stationId: 20, station: { name: "Radio ZU" } },
        { id: 2, stationId: 21, station: { name: "Kiss FM" } },
      ]);

      // play counts query
      mockQueryRaw.mockResolvedValueOnce([
        { station_id: 20, play_count: 150 },
        { station_id: 21, play_count: 80 },
      ]);

      // top songs query
      mockQueryRaw.mockResolvedValueOnce([
        { station_id: 20, song_title: "Hit Song", artist_name: "Big Artist" },
        { station_id: 21, song_title: "Pop Tune", artist_name: "Pop Star" },
      ]);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/summary?period=week",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({
        stationId: 20,
        stationName: "Radio ZU",
        playCount: 150,
        topSong: { title: "Hit Song", artist: "Big Artist" },
      });
      expect(body[1]).toMatchObject({
        stationId: 21,
        stationName: "Kiss FM",
        playCount: 80,
        topSong: { title: "Pop Tune", artist: "Pop Star" },
      });
    });

    it("returns empty array when no watched stations", async () => {
      mockWatchedStationFindMany.mockResolvedValueOnce([]);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/summary",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(0);
    });
  });

  // --- GET /api/v1/competitors/:stationId/detail ---

  describe("GET /api/v1/competitors/:stationId/detail", () => {
    it("returns 401 without authentication", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/20/detail",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-STATION roles", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/20/detail",
        headers: { authorization: `Bearer ${artistToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns 403 when station is not in watched list", async () => {
      mockWatchedStationFindFirst.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/20/detail",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns detail with topSongs, recentDetections, and comparison", async () => {
      mockWatchedStationFindFirst.mockResolvedValueOnce({ id: 1, stationId: 20 });

      // top songs
      mockQueryRaw.mockResolvedValueOnce([
        { song_title: "Hit Song", artist_name: "Big Artist", isrc: "ROABC12345", play_count: 15 },
        { song_title: "Pop Tune", artist_name: "Pop Star", isrc: null, play_count: 10 },
      ]);

      // recent detections
      mockQueryRaw.mockResolvedValueOnce([
        { id: 100, song_title: "Hit Song", artist_name: "Big Artist", started_at: new Date("2026-03-16T10:00:00Z") },
        { id: 99, song_title: "Pop Tune", artist_name: "Pop Star", started_at: new Date("2026-03-16T09:00:00Z") },
      ]);

      // comparison
      mockQueryRaw.mockResolvedValueOnce([
        { song_title: "Shared Song", artist_name: "Shared Artist", their_plays: 5, your_plays: 3 },
      ]);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/competitors/20/detail?period=week",
        headers: { authorization: `Bearer ${stationToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      expect(body.topSongs).toHaveLength(2);
      expect(body.topSongs[0]).toMatchObject({
        title: "Hit Song",
        artist: "Big Artist",
        isrc: "ROABC12345",
        playCount: 15,
      });

      expect(body.recentDetections).toHaveLength(2);
      expect(body.recentDetections[0]).toMatchObject({
        id: 100,
        songTitle: "Hit Song",
        artistName: "Big Artist",
      });

      expect(body.comparison).toHaveLength(1);
      expect(body.comparison[0]).toMatchObject({
        songTitle: "Shared Song",
        artistName: "Shared Artist",
        theirPlays: 5,
        yourPlays: 3,
      });
    });
  });
});
