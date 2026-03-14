import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  default: {
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

function createMockProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn>; pid: number; stderr: EventEmitter } {
  const proc = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    stderr: EventEmitter;
  };
  proc.kill = vi.fn().mockReturnValue(true);
  proc.pid = Math.floor(Math.random() * 10000) + 1000;
  proc.stderr = new EventEmitter();
  return proc;
}

describe("StreamManager", () => {
  let StreamManager: typeof import("../../src/services/supervisor/stream-manager.js").StreamManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaStationUpdate.mockResolvedValue({});
    // Dynamic import to get fresh module after mocks
    const mod = await import("../../src/services/supervisor/stream-manager.js");
    StreamManager = mod.StreamManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("startStream", () => {
    it("should add entry to the internal Map and spawn FFmpeg", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream.example.com/live");

      const status = manager.getStatus(1);
      expect(status).toBeDefined();
      expect(status!.stationId).toBe(1);
      expect(status!.streamUrl).toBe("http://stream.example.com/live");
      expect(status!.status).toBe("recording");
      expect(status!.restartCount).toBe(0);
    });

    it("should update station status to ACTIVE in DB", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream.example.com/live");

      expect(mockPrismaStationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: "ACTIVE" }),
        }),
      );
    });
  });

  describe("stopStream", () => {
    it("should kill the FFmpeg process and remove from Map", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream.example.com/live");

      await manager.stopStream(1);

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
      expect(manager.getStatus(1)).toBeUndefined();
    });
  });

  describe("restartStream", () => {
    it("should stop then start the stream with same URL", async () => {
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream.example.com/live");
      await manager.restartStream(1);

      expect(mockProc1.kill).toHaveBeenCalledWith("SIGTERM");
      const status = manager.getStatus(1);
      expect(status).toBeDefined();
      expect(status!.status).toBe("recording");
      expect(status!.restartCount).toBe(0);
    });
  });

  describe("close event triggers handleStreamFailure", () => {
    it("should call handleStreamFailure when FFmpeg process exits", async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream.example.com/live");

      // Simulate FFmpeg crash
      mockProc.emit("close", 1, null);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = manager.getStatus(1);
      expect(status).toBeDefined();
      expect(status!.restartCount).toBe(1);
      expect(status!.status).toBe("restarting");
    });
  });

  describe("stopAll", () => {
    it("should kill all processes", async () => {
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream1.example.com/live");
      await manager.startStream(2, "http://stream2.example.com/live");

      await manager.stopAll();

      expect(mockProc1.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockProc2.kill).toHaveBeenCalledWith("SIGTERM");
      expect(manager.getAllStatuses()).toHaveLength(0);
    });
  });

  describe("getAllStatuses", () => {
    it("should return array of all tracked stream states", async () => {
      const mockProc1 = createMockProcess();
      const mockProc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2);

      const manager = new StreamManager();
      await manager.startStream(1, "http://stream1.example.com/live");
      await manager.startStream(2, "http://stream2.example.com/live");

      const statuses = manager.getAllStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map((s) => s.stationId).sort()).toEqual([1, 2]);
    });
  });
});
