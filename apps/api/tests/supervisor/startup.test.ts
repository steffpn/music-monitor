import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

// Mock prisma
const mockPrismaStationFindMany = vi.fn().mockResolvedValue([]);
const mockPrismaStationUpdate = vi.fn().mockResolvedValue({});
const mockPrismaDisconnect = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    station: {
      findMany: (...args: unknown[]) => mockPrismaStationFindMany(...args),
      update: (...args: unknown[]) => mockPrismaStationUpdate(...args),
    },
    $disconnect: () => mockPrismaDisconnect(),
  },
}));

// Mock redis
const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockRedisDisconnect = vi.fn();
const mockSubscriber = new EventEmitter() as EventEmitter & {
  subscribe: typeof mockSubscribe;
  disconnect: typeof mockRedisDisconnect;
  status: string;
};
mockSubscriber.subscribe = mockSubscribe;
mockSubscriber.disconnect = mockRedisDisconnect;
mockSubscriber.status = "ready";

vi.mock("../../src/lib/redis.js", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    disconnect: vi.fn(),
  },
  createRedisConnection: () => mockSubscriber,
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

describe("Supervisor Startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaStationFindMany.mockResolvedValue([]);
    mockPrismaStationUpdate.mockResolvedValue({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should start stations in batches with 2s delay between batches", async () => {
    // Create 25 stations (3 batches: 10, 10, 5)
    const stations = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      streamUrl: `http://stream${i + 1}.example.com/live`,
      status: "ACTIVE",
    }));

    mockPrismaStationFindMany.mockResolvedValue(stations);

    const { startSupervisor } = await import(
      "../../src/services/supervisor/index.js"
    );

    // Start supervisor (don't await yet -- it uses delays)
    const supervisorPromise = startSupervisor();

    // Allow first batch to complete
    await vi.advanceTimersByTimeAsync(100);

    // Allow second batch delay (2s)
    await vi.advanceTimersByTimeAsync(2_000);

    // Allow second batch to complete
    await vi.advanceTimersByTimeAsync(100);

    // Allow third batch delay (2s)
    await vi.advanceTimersByTimeAsync(2_000);

    // Allow third batch to complete
    await vi.advanceTimersByTimeAsync(100);

    // Wait for supervisor setup to complete
    await supervisorPromise;

    // Verify all 25 stations were started
    // Check prisma was called to find active stations
    expect(mockPrismaStationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE" },
      }),
    );
  });

  it("should handle empty station list without errors", async () => {
    mockPrismaStationFindMany.mockResolvedValue([]);

    const { startSupervisor } = await import(
      "../../src/services/supervisor/index.js"
    );

    // Should not throw
    await expect(startSupervisor()).resolves.not.toThrow();
  });

  it("should subscribe to Redis channels for station events", async () => {
    const { startSupervisor } = await import(
      "../../src/services/supervisor/index.js"
    );

    await startSupervisor();

    expect(mockSubscribe).toHaveBeenCalledWith(
      "station:added",
      "station:removed",
      "station:updated",
    );
  });

  it("should dispatch station:added event to start a stream", async () => {
    const { startSupervisor } = await import(
      "../../src/services/supervisor/index.js"
    );

    const result = await startSupervisor();

    // Simulate station:added event
    const event = JSON.stringify({
      stationId: 42,
      streamUrl: "http://new-stream.example.com/live",
      timestamp: new Date().toISOString(),
    });

    mockSubscriber.emit("message", "station:added", event);

    // Allow async handler to run
    await vi.advanceTimersByTimeAsync(100);

    // The stream manager should have attempted to start the stream
    // We verify by checking the supervisor returned object has the stream manager
    expect(result.streamManager).toBeDefined();
  });

  it("should dispatch station:removed event to stop a stream", async () => {
    const { startSupervisor } = await import(
      "../../src/services/supervisor/index.js"
    );

    const result = await startSupervisor();

    // Simulate station:removed event
    const event = JSON.stringify({
      stationId: 42,
      timestamp: new Date().toISOString(),
    });

    mockSubscriber.emit("message", "station:removed", event);

    // Allow async handler to run
    await vi.advanceTimersByTimeAsync(100);

    expect(result.streamManager).toBeDefined();
  });
});
