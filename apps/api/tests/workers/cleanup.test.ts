import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Mock fs/promises
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockUnlink = vi.fn();
const mockRmdir = vi.fn();
const mockAccess = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    rmdir: (...args: unknown[]) => mockRmdir(...args),
    access: (...args: unknown[]) => mockAccess(...args),
  },
}));

// Mock BullMQ
const mockQueueUpsertJobScheduler = vi.fn().mockResolvedValue({});
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

let capturedWorkerProcessor: ((job: unknown) => Promise<void>) | null = null;

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    upsertJobScheduler: mockQueueUpsertJobScheduler,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation(
    (
      _name: string,
      processor: (job: unknown) => Promise<void>,
    ) => {
      capturedWorkerProcessor = processor;
      return {
        close: mockWorkerClose,
        on: vi.fn(),
      };
    },
  ),
}));

// Mock Redis connection
vi.mock("../../src/lib/redis.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

// Mock Prisma
const mockPrismaStationFindFirst = vi.fn();
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    station: {
      findFirst: (...args: unknown[]) => mockPrismaStationFindFirst(...args),
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

describe("Cleanup Worker", () => {
  let startCleanupWorker: typeof import("../../src/workers/cleanup.js").startCleanupWorker;
  let cleanupSegments: typeof import("../../src/workers/cleanup.js").cleanupSegments;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedWorkerProcessor = null;
    mockPrismaStationFindFirst.mockResolvedValue(null);

    const mod = await import("../../src/workers/cleanup.js");
    startCleanupWorker = mod.startCleanupWorker;
    cleanupSegments = mod.cleanupSegments;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("startCleanupWorker", () => {
    it("should create a BullMQ queue and worker", async () => {
      const { queue, worker } = await startCleanupWorker();
      expect(queue).toBeDefined();
      expect(worker).toBeDefined();
    });

    it("should register a job scheduler with 30-second interval", async () => {
      await startCleanupWorker();
      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        "cleanup-scheduler",
        { every: 30_000 },
        { name: "cleanup-segments", data: {} },
      );
    });

    it("should return closeable queue and worker for graceful shutdown", async () => {
      const { queue, worker } = await startCleanupWorker();
      await queue.close();
      await worker.close();
      expect(mockQueueClose).toHaveBeenCalled();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });

  describe("cleanupSegments", () => {
    const NOW = Date.now();
    const THREE_MINUTES_AGO = NOW - 3 * 60 * 1000 - 1000; // 3 min + 1s ago
    const ONE_MINUTE_AGO = NOW - 60 * 1000; // 1 min ago

    beforeEach(() => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
    });

    it("should delete files older than 3 minutes", async () => {
      // Mock: one station directory with one old file
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "1", isDirectory: () => true },
          ]);
        }
        // Station directory contents
        return Promise.resolve(["segment-000.ts", "segment-001.ts"]);
      });

      mockStat.mockImplementation((filePath: string) => {
        if (filePath.includes("segment-000")) {
          return Promise.resolve({ mtimeMs: THREE_MINUTES_AGO });
        }
        return Promise.resolve({ mtimeMs: ONE_MINUTE_AGO });
      });

      mockUnlink.mockResolvedValue(undefined);

      // Station is active
      mockPrismaStationFindFirst.mockResolvedValue({ id: 1, status: "ACTIVE" });

      await cleanupSegments();

      // Only the old file should be deleted
      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining("segment-000.ts"),
      );
    });

    it("should NOT delete files younger than 3 minutes", async () => {
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "1", isDirectory: () => true },
          ]);
        }
        return Promise.resolve(["segment-000.ts"]);
      });

      mockStat.mockResolvedValue({ mtimeMs: ONE_MINUTE_AGO });
      mockPrismaStationFindFirst.mockResolvedValue({ id: 1, status: "ACTIVE" });

      await cleanupSegments();

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it("should remove empty directory with no active station (orphan cleanup)", async () => {
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "42", isDirectory: () => true },
          ]);
        }
        // Empty directory
        return Promise.resolve([]);
      });

      // No active station found (deleted/inactive)
      mockPrismaStationFindFirst.mockResolvedValue(null);
      mockRmdir.mockResolvedValue(undefined);

      await cleanupSegments();

      expect(mockRmdir).toHaveBeenCalledTimes(1);
      expect(mockRmdir).toHaveBeenCalledWith(
        expect.stringContaining("42"),
      );
    });

    it("should NOT remove empty directory with active station", async () => {
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "1", isDirectory: () => true },
          ]);
        }
        // Empty directory (station may have just started, no segments yet)
        return Promise.resolve([]);
      });

      // Station is active
      mockPrismaStationFindFirst.mockResolvedValue({ id: 1, status: "ACTIVE" });

      await cleanupSegments();

      expect(mockRmdir).not.toHaveBeenCalled();
    });

    it("should not crash when DATA_DIR does not exist", async () => {
      mockReaddir.mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      // Should not throw
      await expect(cleanupSegments()).resolves.toBeUndefined();
    });

    it("should not crash on permission error for a single file and continue to next file", async () => {
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "1", isDirectory: () => true },
          ]);
        }
        return Promise.resolve(["segment-000.ts", "segment-001.ts"]);
      });

      // Both files are old
      mockStat.mockResolvedValue({ mtimeMs: THREE_MINUTES_AGO });

      // First unlink fails with permission error, second succeeds
      mockUnlink
        .mockRejectedValueOnce(
          Object.assign(new Error("EACCES"), { code: "EACCES" }),
        )
        .mockResolvedValueOnce(undefined);

      mockPrismaStationFindFirst.mockResolvedValue({ id: 1, status: "ACTIVE" });

      // Should not throw despite permission error
      await expect(cleanupSegments()).resolves.toBeUndefined();

      // Both files should have been attempted
      expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it("should clean up directory after removing all stale files if station is not active", async () => {
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "99", isDirectory: () => true },
          ]);
        }
        return Promise.resolve(["segment-000.ts"]);
      });

      mockStat.mockResolvedValue({ mtimeMs: THREE_MINUTES_AGO });
      mockUnlink.mockResolvedValue(undefined);

      // No active station
      mockPrismaStationFindFirst.mockResolvedValue(null);

      // After deleting the file, re-reading the dir should return empty
      // We need to return empty on the second readdir call for this station dir
      let stationDirReadCount = 0;
      mockReaddir.mockImplementation((dirPath: string) => {
        if (dirPath.endsWith("streams")) {
          return Promise.resolve([
            { name: "99", isDirectory: () => true },
          ]);
        }
        stationDirReadCount++;
        if (stationDirReadCount === 1) {
          return Promise.resolve(["segment-000.ts"]);
        }
        // Second read after cleanup: empty
        return Promise.resolve([]);
      });

      mockRmdir.mockResolvedValue(undefined);

      await cleanupSegments();

      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockRmdir).toHaveBeenCalledTimes(1);
    });
  });
});
