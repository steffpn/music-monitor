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

describe("Exponential Backoff", () => {
  let StreamManager: typeof import("../../src/services/supervisor/stream-manager.js").StreamManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaStationUpdate.mockResolvedValue({});
    vi.useFakeTimers();
    const mod = await import("../../src/services/supervisor/stream-manager.js");
    StreamManager = mod.StreamManager;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should calculate correct backoff delays: 10s, 20s, 40s, 80s", async () => {
    // Prepare all mock processes upfront
    const procs = Array.from({ length: 5 }, () => createMockProcess());
    let spawnIndex = 0;
    mockSpawn.mockImplementation(() => procs[spawnIndex++]);

    const manager = new StreamManager();
    await manager.startStream(1, "http://stream.example.com/live");
    // proc[0] is now running

    // First failure -> restartCount = 1, delay = 10s
    procs[0].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    let status = manager.getStatus(1);
    expect(status!.restartCount).toBe(1);
    expect(status!.status).toBe("restarting");

    // Advance 10s to trigger restart -> spawns proc[1]
    await vi.advanceTimersByTimeAsync(10_000);

    // Second failure -> restartCount = 2, delay = 20s
    procs[1].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    status = manager.getStatus(1);
    expect(status!.restartCount).toBe(2);

    // Advance 20s -> spawns proc[2]
    await vi.advanceTimersByTimeAsync(20_000);

    // Third failure -> restartCount = 3, delay = 40s
    procs[2].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    status = manager.getStatus(1);
    expect(status!.restartCount).toBe(3);

    // Advance 40s -> spawns proc[3]
    await vi.advanceTimersByTimeAsync(40_000);

    // Fourth failure -> restartCount = 4, delay = 80s
    procs[3].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    status = manager.getStatus(1);
    expect(status!.restartCount).toBe(4);
  });

  it("should circuit-break after 5 failures with status 'error'", async () => {
    // 6 procs: 1 initial + 4 restarts (5th failure triggers circuit break, no restart)
    const procs = Array.from({ length: 6 }, () => createMockProcess());
    let spawnIndex = 0;
    mockSpawn.mockImplementation(() => procs[spawnIndex++]);

    const manager = new StreamManager();
    await manager.startStream(1, "http://stream.example.com/live");

    // Delays: 10s, 20s, 40s, 80s (then circuit break on 5th failure)
    const delays = [10_000, 20_000, 40_000, 80_000];

    for (let i = 0; i < 5; i++) {
      // Trigger failure on process i
      procs[i].emit("close", 1, null);
      await vi.advanceTimersByTimeAsync(1);

      if (i < 4) {
        // Advance past backoff to trigger restart
        await vi.advanceTimersByTimeAsync(delays[i]);
      }
    }

    const status = manager.getStatus(1);
    expect(status!.status).toBe("error");
    expect(status!.restartCount).toBe(5);
    expect(status!.backoffTimer).toBeNull();
  });

  it("should mark station as ERROR in DB after 5 failures", async () => {
    const procs = Array.from({ length: 6 }, () => createMockProcess());
    let spawnIndex = 0;
    mockSpawn.mockImplementation(() => procs[spawnIndex++]);

    const manager = new StreamManager();
    await manager.startStream(1, "http://stream.example.com/live");

    const delays = [10_000, 20_000, 40_000, 80_000];

    for (let i = 0; i < 5; i++) {
      procs[i].emit("close", 1, null);
      await vi.advanceTimersByTimeAsync(1);

      if (i < 4) {
        await vi.advanceTimersByTimeAsync(delays[i]);
      }
    }

    expect(mockPrismaStationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: "ERROR",
          restartCount: 5,
        }),
      }),
    );
  });

  it("should increment restartCount correctly on each failure", async () => {
    const procs = Array.from({ length: 3 }, () => createMockProcess());
    let spawnIndex = 0;
    mockSpawn.mockImplementation(() => procs[spawnIndex++]);

    const manager = new StreamManager();
    await manager.startStream(1, "http://stream.example.com/live");

    procs[0].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    expect(manager.getStatus(1)!.restartCount).toBe(1);

    // Advance past backoff -> spawns proc[1]
    await vi.advanceTimersByTimeAsync(10_000);

    procs[1].emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(1);

    expect(manager.getStatus(1)!.restartCount).toBe(2);
  });

  it("should not schedule restart after 5 failures (no timer set)", async () => {
    const procs = Array.from({ length: 6 }, () => createMockProcess());
    let spawnIndex = 0;
    mockSpawn.mockImplementation(() => procs[spawnIndex++]);

    const manager = new StreamManager();
    await manager.startStream(1, "http://stream.example.com/live");

    const delays = [10_000, 20_000, 40_000, 80_000];

    for (let i = 0; i < 5; i++) {
      procs[i].emit("close", 1, null);
      await vi.advanceTimersByTimeAsync(1);

      if (i < 4) {
        await vi.advanceTimersByTimeAsync(delays[i]);
      }
    }

    // Verify no more spawn calls after the error state
    const spawnCallCount = mockSpawn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300_000); // Advance 5 minutes
    expect(mockSpawn.mock.calls.length).toBe(spawnCallCount);
  });
});
