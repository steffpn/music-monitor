import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock Prisma ----
const mockQueryRaw = vi.fn();
const mockUserFindMany = vi.fn();
const mockDeviceTokenDeleteMany = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    deviceToken: {
      deleteMany: (...args: unknown[]) => mockDeviceTokenDeleteMany(...args),
    },
  },
}));

// ---- Mock BullMQ ----
const mockQueueUpsertJobScheduler = vi.fn().mockResolvedValue({});
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    upsertJobScheduler: (...args: unknown[]) =>
      mockQueueUpsertJobScheduler(...args),
    close: (...args: unknown[]) => mockQueueClose(...args),
  })),
  Worker: vi.fn().mockImplementation(
    (
      _name: string,
      _processor: (job: unknown) => Promise<void>,
    ) => ({
      close: (...args: unknown[]) => mockWorkerClose(...args),
      on: (...args: unknown[]) => mockWorkerOn(...args),
    }),
  ),
}));

// ---- Mock Redis ----
vi.mock("../../src/lib/redis.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

// ---- Mock APNS ----
const mockApnsSend = vi.fn();
vi.mock("../../src/lib/apns.js", () => ({
  getApnsClient: vi.fn().mockReturnValue({
    send: (...args: unknown[]) => mockApnsSend(...args),
  }),
}));

// ---- Mock pino ----
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

describe("Digest Worker", () => {
  let computeDailyDigest: typeof import("../../src/workers/digest.js").computeDailyDigest;
  let computeWeeklyDigest: typeof import("../../src/workers/digest.js").computeWeeklyDigest;
  let buildDailyDigestNotification: typeof import("../../src/workers/digest.js").buildDailyDigestNotification;
  let buildWeeklyDigestNotification: typeof import("../../src/workers/digest.js").buildWeeklyDigestNotification;
  let startDigestWorker: typeof import("../../src/workers/digest.js").startDigestWorker;

  beforeEach(async () => {
    mockQueryRaw.mockClear();
    mockUserFindMany.mockClear();
    mockDeviceTokenDeleteMany.mockClear();
    mockApnsSend.mockClear();
    mockQueueUpsertJobScheduler.mockClear();

    const mod = await import("../../src/workers/digest.js");
    computeDailyDigest = mod.computeDailyDigest;
    computeWeeklyDigest = mod.computeWeeklyDigest;
    buildDailyDigestNotification = mod.buildDailyDigestNotification;
    buildWeeklyDigestNotification = mod.buildWeeklyDigestNotification;
    startDigestWorker = mod.startDigestWorker;
  });

  describe("startDigestWorker", () => {
    it("should create a BullMQ queue and worker", async () => {
      const { queue, worker } = await startDigestWorker();
      expect(queue).toBeDefined();
      expect(worker).toBeDefined();
    });

    it("should register daily-digest scheduler with cron 0 9 * * * Europe/Bucharest", async () => {
      await startDigestWorker();
      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        "daily-digest-scheduler",
        { pattern: "0 9 * * *", tz: "Europe/Bucharest" },
        { name: "daily-digest", data: {} },
      );
    });

    it("should register weekly-digest scheduler with cron 0 9 * * 1 Europe/Bucharest", async () => {
      await startDigestWorker();
      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        "weekly-digest-scheduler",
        { pattern: "0 9 * * 1", tz: "Europe/Bucharest" },
        { name: "weekly-digest", data: {} },
      );
    });
  });

  describe("computeDailyDigest", () => {
    it("should return playCount, topSong, and topStation from yesterday's data", async () => {
      // First query: total play count
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 47 }]);
      // Second query: top song
      mockQueryRaw.mockResolvedValueOnce([
        { song_title: "Melodia", artist_name: "Artist X", count: 15 },
      ]);
      // Third query: top station
      mockQueryRaw.mockResolvedValueOnce([
        { station_name: "Kiss FM", count: 20 },
      ]);

      const result = await computeDailyDigest([1, 2, 3]);

      expect(result).toMatchObject({
        playCount: 47,
        topSong: { title: "Melodia", artist: "Artist X", count: 15 },
        topStation: { name: "Kiss FM", count: 20 },
      });
    });

    it("should return null topSong and topStation when no data", async () => {
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 0 }]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);

      const result = await computeDailyDigest([1]);

      expect(result.playCount).toBe(0);
      expect(result.topSong).toBeNull();
      expect(result.topStation).toBeNull();
    });
  });

  describe("computeWeeklyDigest", () => {
    it("should return playCount, weekOverWeekChange, topSong, topStation, newStationsCount", async () => {
      // This week play count
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 312 }]);
      // Previous week play count
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 271 }]);
      // Top song
      mockQueryRaw.mockResolvedValueOnce([
        { song_title: "Melodia", artist_name: "Artist X", count: 30 },
      ]);
      // Top station
      mockQueryRaw.mockResolvedValueOnce([
        { station_name: "Kiss FM", count: 50 },
      ]);
      // New stations count
      mockQueryRaw.mockResolvedValueOnce([{ count: 3 }]);

      const result = await computeWeeklyDigest([1, 2, 3]);

      expect(result.playCount).toBe(312);
      expect(result.weekOverWeekChange).toBeCloseTo(15.13, 0);
      expect(result.topSong).toMatchObject({
        title: "Melodia",
        artist: "Artist X",
        count: 30,
      });
      expect(result.topStation).toMatchObject({ name: "Kiss FM", count: 50 });
      expect(result.newStationsCount).toBe(3);
    });

    it("should handle zero previous week (no division by zero)", async () => {
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 100 }]);
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 0 }]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);

      const result = await computeWeeklyDigest([1]);

      expect(result.playCount).toBe(100);
      // When previous week is 0, should show 100% change (or Infinity handled)
      expect(result.weekOverWeekChange).toBe(100);
    });
  });

  describe("buildDailyDigestNotification", () => {
    it("should produce notification with correct title and body format", () => {
      const notification = buildDailyDigestNotification("device-token-123", {
        playCount: 47,
        topSong: { title: "Melodia", artist: "Artist X", count: 15 },
        topStation: { name: "Kiss FM", count: 20 },
      });

      expect(notification.deviceToken).toBe("device-token-123");
      expect(notification.options.alert).toMatchObject({
        title: "Daily Airplay Digest",
        body: "47 plays today. 'Melodia' was #1 with 15 plays, mostly on Kiss FM",
      });
      expect(notification.options.data).toMatchObject({
        type: "daily_digest",
      });
    });
  });

  describe("buildWeeklyDigestNotification", () => {
    it("should produce notification with correct title and body format", () => {
      const notification = buildWeeklyDigestNotification("device-token-456", {
        playCount: 312,
        weekOverWeekChange: 15,
        topSong: { title: "Melodia", artist: "Artist X", count: 30 },
        topStation: { name: "Kiss FM", count: 50 },
        newStationsCount: 3,
      });

      expect(notification.deviceToken).toBe("device-token-456");
      expect(notification.options.alert).toMatchObject({
        title: "Weekly Airplay Digest",
        body: "312 plays (+15%). 'Melodia' #1. 3 new stations played your music this week",
      });
      expect(notification.options.data).toMatchObject({
        type: "weekly_digest",
      });
    });
  });

  describe("BadDeviceToken handling", () => {
    it("should delete device token from DB when APNS returns BadDeviceToken", async () => {
      // Import the internals we need for the error simulation
      const { ApnsError, Notification } = await import("apns2");

      const error = new ApnsError({
        statusCode: 410,
        notification: new Notification("bad-token"),
        response: { reason: "BadDeviceToken", timestamp: Date.now() },
      });

      mockApnsSend.mockRejectedValueOnce(error);

      mockUserFindMany.mockResolvedValueOnce([
        {
          id: 1,
          scopes: [{ entityType: "STATION", entityId: 1 }],
          deviceTokens: [{ id: 1, token: "bad-token" }],
        },
      ]);

      // Play count
      mockQueryRaw.mockResolvedValueOnce([{ play_count: 10 }]);
      // Top song
      mockQueryRaw.mockResolvedValueOnce([
        { song_title: "Song", artist_name: "Artist", count: 5 },
      ]);
      // Top station
      mockQueryRaw.mockResolvedValueOnce([
        { station_name: "Station", count: 5 },
      ]);

      // We need to access the internal process function
      // Instead, let's directly test the token cleanup logic by importing the module
      const mod = await import("../../src/workers/digest.js");
      await mod.processDailyDigests();

      expect(mockDeviceTokenDeleteMany).toHaveBeenCalledWith({
        where: { token: "bad-token" },
      });
    });
  });
});
