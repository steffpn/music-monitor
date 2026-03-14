import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Mock fs/promises
const mockReaddir = vi.fn();
const mockStat = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock prisma
const mockPrismaStationUpdate = vi.fn().mockResolvedValue({});
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    station: {
      update: (...args: unknown[]) => mockPrismaStationUpdate(...args),
    },
  },
}));

// Mock pino logger
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// Mock child_process (for stream-manager dependency)
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("Watchdog", () => {
  let Watchdog: typeof import("../../src/services/supervisor/watchdog.js").Watchdog;
  let getLatestSegmentMtime: typeof import("../../src/services/supervisor/watchdog.js").getLatestSegmentMtime;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaStationUpdate.mockResolvedValue({});
    vi.useFakeTimers();
    const mod = await import("../../src/services/supervisor/watchdog.js");
    Watchdog = mod.Watchdog;
    getLatestSegmentMtime = mod.getLatestSegmentMtime;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getLatestSegmentMtime", () => {
    it("should return correct date for valid segments with size >= minBytes", async () => {
      const now = new Date("2026-03-14T20:00:00Z");
      const older = new Date("2026-03-14T19:59:50Z");

      mockReaddir.mockResolvedValue(["segment-000.ts", "segment-001.ts"]);
      mockStat
        .mockResolvedValueOnce({ mtime: older, size: 5000 })
        .mockResolvedValueOnce({ mtime: now, size: 8000 });

      const result = await getLatestSegmentMtime("/data/streams/1", 1024);
      expect(result).toEqual(now);
    });

    it("should return null for empty directory", async () => {
      mockReaddir.mockResolvedValue([]);

      const result = await getLatestSegmentMtime("/data/streams/1", 1024);
      expect(result).toBeNull();
    });

    it("should return null for nonexistent directory", async () => {
      mockReaddir.mockRejectedValue(new Error("ENOENT"));

      const result = await getLatestSegmentMtime("/data/streams/999", 1024);
      expect(result).toBeNull();
    });

    it("should ignore files smaller than minBytes", async () => {
      const validDate = new Date("2026-03-14T20:00:00Z");
      const tooSmallDate = new Date("2026-03-14T20:00:05Z"); // newer but too small

      mockReaddir.mockResolvedValue(["segment-000.ts", "segment-001.ts"]);
      mockStat
        .mockResolvedValueOnce({ mtime: validDate, size: 5000 })
        .mockResolvedValueOnce({ mtime: tooSmallDate, size: 500 }); // < 1024

      const result = await getLatestSegmentMtime("/data/streams/1", 1024);
      expect(result).toEqual(validDate); // Should use the valid-sized file
    });
  });

  describe("checkAll", () => {
    it("should update heartbeat and not restart for fresh segment", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const freshMtime = new Date(now - 5000); // 5 seconds ago = fresh

      mockReaddir.mockResolvedValue(["segment-000.ts"]);
      mockStat.mockResolvedValue({ mtime: freshMtime, size: 5000 });

      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([
          {
            stationId: 1,
            streamUrl: "http://stream.example.com/live",
            process: {},
            pid: 1234,
            startedAt: new Date(),
            lastSegmentAt: new Date(),
            restartCount: 0,
            status: "recording" as const,
            backoffTimer: null,
          },
        ]),
        restartStream: vi.fn().mockResolvedValue(undefined),
        resetRestartCount: vi.fn().mockResolvedValue(undefined),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      await watchdog.checkAll();

      expect(mockStreamManager.restartStream).not.toHaveBeenCalled();
      expect(mockPrismaStationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ lastHeartbeat: expect.any(Date) }),
        }),
      );
    });

    it("should restart stream when segment is stale (> 30s)", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const staleMtime = new Date(now - 35_000); // 35 seconds ago = stale

      mockReaddir.mockResolvedValue(["segment-000.ts"]);
      mockStat.mockResolvedValue({ mtime: staleMtime, size: 5000 });

      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([
          {
            stationId: 1,
            streamUrl: "http://stream.example.com/live",
            process: {},
            pid: 1234,
            startedAt: new Date(),
            lastSegmentAt: new Date(),
            restartCount: 0,
            status: "recording" as const,
            backoffTimer: null,
          },
        ]),
        restartStream: vi.fn().mockResolvedValue(undefined),
        resetRestartCount: vi.fn().mockResolvedValue(undefined),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      await watchdog.checkAll();

      expect(mockStreamManager.restartStream).toHaveBeenCalledWith(1);
    });

    it("should treat zero-byte segment as stale and restart", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // File is recent but 0 bytes -- treated as corrupt
      const recentMtime = new Date(now - 5000);

      mockReaddir.mockResolvedValue(["segment-000.ts"]);
      mockStat.mockResolvedValue({ mtime: recentMtime, size: 0 });

      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([
          {
            stationId: 1,
            streamUrl: "http://stream.example.com/live",
            process: {},
            pid: 1234,
            startedAt: new Date(),
            lastSegmentAt: new Date(),
            restartCount: 0,
            status: "recording" as const,
            backoffTimer: null,
          },
        ]),
        restartStream: vi.fn().mockResolvedValue(undefined),
        resetRestartCount: vi.fn().mockResolvedValue(undefined),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      await watchdog.checkAll();

      expect(mockStreamManager.restartStream).toHaveBeenCalledWith(1);
    });

    it("should not restart when directory is empty (grace period for new streams)", async () => {
      mockReaddir.mockResolvedValue([]);

      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([
          {
            stationId: 1,
            streamUrl: "http://stream.example.com/live",
            process: {},
            pid: 1234,
            startedAt: new Date(),
            lastSegmentAt: new Date(),
            restartCount: 0,
            status: "recording" as const,
            backoffTimer: null,
          },
        ]),
        restartStream: vi.fn().mockResolvedValue(undefined),
        resetRestartCount: vi.fn().mockResolvedValue(undefined),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      await watchdog.checkAll();

      // Empty directory means stream just started -- don't restart
      expect(mockStreamManager.restartStream).not.toHaveBeenCalled();
    });

    it("should reset restartCount when stream is healthy and restartCount > 0", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const freshMtime = new Date(now - 5000);

      mockReaddir.mockResolvedValue(["segment-000.ts"]);
      mockStat.mockResolvedValue({ mtime: freshMtime, size: 5000 });

      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([
          {
            stationId: 1,
            streamUrl: "http://stream.example.com/live",
            process: {},
            pid: 1234,
            startedAt: new Date(),
            lastSegmentAt: new Date(),
            restartCount: 3, // Was previously restarted
            status: "recording" as const,
            backoffTimer: null,
          },
        ]),
        restartStream: vi.fn().mockResolvedValue(undefined),
        resetRestartCount: vi.fn().mockResolvedValue(undefined),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      await watchdog.checkAll();

      expect(mockStreamManager.resetRestartCount).toHaveBeenCalledWith(1);
    });
  });

  describe("start/stop", () => {
    it("should start and stop the polling interval", async () => {
      const mockStreamManager = {
        getAllStatuses: vi.fn().mockReturnValue([]),
        restartStream: vi.fn(),
        resetRestartCount: vi.fn(),
      };

      const watchdog = new Watchdog(mockStreamManager as any, {
        intervalMs: 10_000,
        staleThresholdMs: 30_000,
        minSegmentBytes: 1024,
      });

      watchdog.start();

      // Advance time to trigger a couple of intervals
      await vi.advanceTimersByTimeAsync(25_000);
      expect(mockStreamManager.getAllStatuses).toHaveBeenCalledTimes(2);

      watchdog.stop();

      // Advance more time -- should not trigger more calls
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mockStreamManager.getAllStatuses).toHaveBeenCalledTimes(2);
    });
  });
});
