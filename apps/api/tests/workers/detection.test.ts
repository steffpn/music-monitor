import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock ----
const mockStationFindFirst = vi.fn();
const mockStationUpdate = vi.fn();
const mockDetectionCreate = vi.fn();
const mockAirplayEventFindFirst = vi.fn();
const mockAirplayEventCreate = vi.fn();
const mockAirplayEventUpdate = vi.fn();
const mockNoMatchCallbackCreate = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    station: {
      findFirst: (...args: unknown[]) => mockStationFindFirst(...args),
      update: (...args: unknown[]) => mockStationUpdate(...args),
    },
    detection: {
      create: (...args: unknown[]) => mockDetectionCreate(...args),
    },
    airplayEvent: {
      findFirst: (...args: unknown[]) => mockAirplayEventFindFirst(...args),
      create: (...args: unknown[]) => mockAirplayEventCreate(...args),
      update: (...args: unknown[]) => mockAirplayEventUpdate(...args),
    },
    noMatchCallback: {
      create: (...args: unknown[]) => mockNoMatchCallbackCreate(...args),
    },
  },
}));

// ---- BullMQ mock ----
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    close: (...args: unknown[]) => mockQueueClose(...args),
  })),
  Worker: vi.fn().mockImplementation(
    (
      _name: string,
      _processor: (job: unknown) => Promise<void>,
      _opts?: unknown,
    ) => ({
      on: (...args: unknown[]) => mockWorkerOn(...args),
      close: (...args: unknown[]) => mockWorkerClose(...args),
    }),
  ),
}));

// ---- Redis mock ----
vi.mock("../../src/lib/redis.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({}),
}));

// ---- Pino logger mock ----
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerDebug = vi.fn();

vi.mock("pino", () => ({
  default: () => ({
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ---- Helper: build an ACRCloud callback payload ----
function buildCallback(overrides: Record<string, unknown> = {}) {
  return {
    stream_id: "s-abc123",
    stream_url: "http://example.com/stream",
    status: 1,
    data: {
      status: { msg: "Success", code: 0, version: "1.0" },
      result_type: 0,
      metadata: {
        timestamp_utc: "2026-03-15 14:30:00",
        music: [
          {
            title: "Doua Inimi",
            artists: [{ name: "Irina Rimes" }],
            album: { name: "Despre El" },
            duration_ms: 186506,
            score: 85,
            acrid: "abc123def456",
            external_ids: { isrc: "ROA231600001" },
          },
        ],
      },
    },
    ...overrides,
  };
}

// ---- Helper: build a no-match callback ----
function buildNoMatchCallback(overrides: Record<string, unknown> = {}) {
  return {
    stream_id: "s-abc123",
    stream_url: "http://example.com/stream",
    status: 1,
    data: {
      status: { msg: "No result", code: 1001, version: "1.0" },
      result_type: 0,
      metadata: {
        timestamp_utc: "2026-03-15 14:35:00",
        played_duration: 0,
      },
    },
    ...overrides,
  };
}

const MOCK_STATION = { id: 1, name: "Test Radio", acrcloudStreamId: "s-abc123" };

describe("Detection Worker", () => {
  let processCallback: typeof import("../../src/workers/detection.js").processCallback;
  let startDetectionWorker: typeof import("../../src/workers/detection.js").startDetectionWorker;

  beforeEach(async () => {
    // Clear all mock call histories
    mockStationFindFirst.mockClear();
    mockStationUpdate.mockClear();
    mockDetectionCreate.mockClear();
    mockAirplayEventFindFirst.mockClear();
    mockAirplayEventCreate.mockClear();
    mockAirplayEventUpdate.mockClear();
    mockNoMatchCallbackCreate.mockClear();
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
    mockLoggerInfo.mockClear();
    mockLoggerDebug.mockClear();
    mockWorkerOn.mockClear();

    // Default mocks: station found, no existing airplay event
    mockStationFindFirst.mockResolvedValue(MOCK_STATION);
    mockStationUpdate.mockResolvedValue(MOCK_STATION);
    mockDetectionCreate.mockResolvedValue({ id: 1 });
    mockAirplayEventFindFirst.mockResolvedValue(null);
    mockAirplayEventCreate.mockResolvedValue({ id: 1 });
    mockAirplayEventUpdate.mockResolvedValue({ id: 1 });
    mockNoMatchCallbackCreate.mockResolvedValue({ id: 1 });

    const mod = await import("../../src/workers/detection.js");
    processCallback = mod.processCallback;
    startDetectionWorker = mod.startDetectionWorker;
  });

  // ============================================
  // Station Lookup
  // ============================================
  describe("Station lookup", () => {
    it("finds station by acrcloudStreamId and proceeds to create detection", async () => {
      await processCallback(buildCallback());

      expect(mockStationFindFirst).toHaveBeenCalledWith({
        where: { acrcloudStreamId: "s-abc123" },
      });
      expect(mockDetectionCreate).toHaveBeenCalled();
    });

    it("logs warning and returns without error for unknown stream_id", async () => {
      mockStationFindFirst.mockResolvedValue(null);

      // Should not throw
      await processCallback(buildCallback({ stream_id: "s-unknown" }));

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ stream_id: "s-unknown" }),
        expect.stringContaining("Unknown"),
      );
      // No detection or airplay event should be created
      expect(mockDetectionCreate).not.toHaveBeenCalled();
      expect(mockAirplayEventCreate).not.toHaveBeenCalled();
      expect(mockAirplayEventFindFirst).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Detection Storage (DETC-02)
  // ============================================
  describe("Detection storage", () => {
    it("creates Detection record with all required fields mapped from ACRCloud payload", async () => {
      await processCallback(buildCallback());

      expect(mockDetectionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stationId: 1,
          detectedAt: new Date("2026-03-15 14:30:00"),
          songTitle: "Doua Inimi",
          artistName: "Irina Rimes",
          albumTitle: "Despre El",
          isrc: "ROA231600001",
          confidence: 0.85, // score 85 / 100
          durationMs: 186506,
          rawCallbackId: "s-abc123-2026-03-15 14:30:00",
        }),
      });
    });

    it("stores ISRC as string directly", async () => {
      const cb = buildCallback();
      cb.data.metadata.music[0].external_ids = { isrc: "USRC17607839" };

      await processCallback(cb);

      expect(mockDetectionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ isrc: "USRC17607839" }),
      });
    });

    it("takes first element when ISRC is array", async () => {
      const cb = buildCallback();
      cb.data.metadata.music[0].external_ids = {
        isrc: ["ROA231600001", "ROA231600002"],
      };

      await processCallback(cb);

      expect(mockDetectionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ isrc: "ROA231600001" }),
      });
    });

    it("stores null when ISRC is null/undefined", async () => {
      const cb = buildCallback();
      cb.data.metadata.music[0].external_ids = {};

      await processCallback(cb);

      expect(mockDetectionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ isrc: null }),
      });
    });

    it("defaults artistName to 'Unknown' when missing", async () => {
      const cb = buildCallback();
      cb.data.metadata.music[0].artists = [];

      await processCallback(cb);

      expect(mockDetectionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ artistName: "Unknown" }),
      });
    });

    it("updates station lastHeartbeat to detection timestamp after processing", async () => {
      await processCallback(buildCallback());

      expect(mockStationUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lastHeartbeat: new Date("2026-03-15 14:30:00") },
      });
    });
  });

  // ============================================
  // Deduplication (DETC-03)
  // ============================================
  describe("Deduplication", () => {
    it("two callbacks with same ISRC + same station within 2 minutes produce one AirplayEvent with playCount=2", async () => {
      const timestamp1 = "2026-03-15 14:30:00";
      const timestamp2 = "2026-03-15 14:32:00"; // 2 minutes later

      // First callback: no existing event
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb1 = buildCallback();
      cb1.data.metadata.timestamp_utc = timestamp1;
      await processCallback(cb1);

      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1);

      // Second callback: existing event found within gap tolerance
      const existingEvent = {
        id: 10,
        stationId: 1,
        startedAt: new Date(timestamp1),
        endedAt: new Date(timestamp1),
        songTitle: "Doua Inimi",
        artistName: "Irina Rimes",
        isrc: "ROA231600001",
        playCount: 1,
        confidence: 0.85,
      };
      mockAirplayEventFindFirst.mockResolvedValueOnce(existingEvent);

      const cb2 = buildCallback();
      cb2.data.metadata.timestamp_utc = timestamp2;
      await processCallback(cb2);

      // Should update (increment playCount), NOT create a new one
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1); // still 1 from cb1
      expect(mockAirplayEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            endedAt: new Date(timestamp2),
            playCount: { increment: 1 },
          }),
        }),
      );
    });

    it("two callbacks with same ISRC + same station beyond 5 minutes produce two separate AirplayEvents", async () => {
      const timestamp1 = "2026-03-15 14:30:00";
      const timestamp2 = "2026-03-15 14:36:00"; // 6 minutes later

      // First callback: no existing event
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb1 = buildCallback();
      cb1.data.metadata.timestamp_utc = timestamp1;
      await processCallback(cb1);

      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1);

      // Second callback: no recent event within gap tolerance (6 min > 5 min)
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb2 = buildCallback();
      cb2.data.metadata.timestamp_utc = timestamp2;
      await processCallback(cb2);

      // Should create a second AirplayEvent
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(2);
    });

    it("uses normalized title+artist fallback when ISRC is null (within gap)", async () => {
      // Two callbacks with null ISRC but matching normalized title+artist
      const timestamp1 = "2026-03-15 14:30:00";
      const timestamp2 = "2026-03-15 14:32:00"; // 2 minutes later

      // First callback: no existing event
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb1 = buildCallback();
      cb1.data.metadata.timestamp_utc = timestamp1;
      cb1.data.metadata.music[0].external_ids = {}; // no ISRC

      await processCallback(cb1);
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1);

      // Second callback: existing event matches by normalized title+artist
      const existingEvent = {
        id: 20,
        stationId: 1,
        startedAt: new Date(timestamp1),
        endedAt: new Date(timestamp1),
        songTitle: "Doua Inimi",
        artistName: "Irina Rimes",
        isrc: null,
        playCount: 1,
        confidence: 0.85,
      };
      mockAirplayEventFindFirst.mockResolvedValueOnce(existingEvent);

      const cb2 = buildCallback();
      cb2.data.metadata.timestamp_utc = timestamp2;
      cb2.data.metadata.music[0].external_ids = {}; // no ISRC

      await processCallback(cb2);

      // Should update existing event, not create new
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1);
      expect(mockAirplayEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 20 },
          data: expect.objectContaining({
            playCount: { increment: 1 },
          }),
        }),
      );
    });

    it("two callbacks with null ISRC and different normalized title+artist produce two AirplayEvents", async () => {
      const timestamp1 = "2026-03-15 14:30:00";
      const timestamp2 = "2026-03-15 14:32:00";

      // First callback: no existing event
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb1 = buildCallback();
      cb1.data.metadata.timestamp_utc = timestamp1;
      cb1.data.metadata.music[0].external_ids = {};
      cb1.data.metadata.music[0].title = "Song A";
      cb1.data.metadata.music[0].artists = [{ name: "Artist A" }];

      await processCallback(cb1);
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(1);

      // Second callback: different title, no match found
      mockAirplayEventFindFirst.mockResolvedValueOnce(null);

      const cb2 = buildCallback();
      cb2.data.metadata.timestamp_utc = timestamp2;
      cb2.data.metadata.music[0].external_ids = {};
      cb2.data.metadata.music[0].title = "Song B";
      cb2.data.metadata.music[0].artists = [{ name: "Artist B" }];

      await processCallback(cb2);

      // Two separate AirplayEvents
      expect(mockAirplayEventCreate).toHaveBeenCalledTimes(2);
    });

    it("higher confidence callback updates AirplayEvent metadata", async () => {
      const existingEvent = {
        id: 30,
        stationId: 1,
        startedAt: new Date("2026-03-15 14:30:00"),
        endedAt: new Date("2026-03-15 14:30:00"),
        songTitle: "Doua Inimi",
        artistName: "Irina Rimes",
        isrc: "ROA231600001",
        playCount: 1,
        confidence: 0.70, // existing confidence: 70%
      };
      mockAirplayEventFindFirst.mockResolvedValueOnce(existingEvent);

      const cb = buildCallback();
      cb.data.metadata.timestamp_utc = "2026-03-15 14:32:00";
      cb.data.metadata.music[0].score = 95; // higher confidence: 95%
      cb.data.metadata.music[0].title = "Doua Inimi (Official)";
      cb.data.metadata.music[0].artists = [{ name: "Irina Rimes feat. Someone" }];

      await processCallback(cb);

      expect(mockAirplayEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 30 },
          data: expect.objectContaining({
            songTitle: "Doua Inimi (Official)",
            artistName: "Irina Rimes feat. Someone",
            confidence: 0.95,
          }),
        }),
      );
    });

    it("lower confidence callback does NOT update AirplayEvent metadata", async () => {
      const existingEvent = {
        id: 31,
        stationId: 1,
        startedAt: new Date("2026-03-15 14:30:00"),
        endedAt: new Date("2026-03-15 14:30:00"),
        songTitle: "Doua Inimi",
        artistName: "Irina Rimes",
        isrc: "ROA231600001",
        playCount: 1,
        confidence: 0.95, // existing confidence: 95%
      };
      mockAirplayEventFindFirst.mockResolvedValueOnce(existingEvent);

      const cb = buildCallback();
      cb.data.metadata.timestamp_utc = "2026-03-15 14:32:00";
      cb.data.metadata.music[0].score = 70; // lower confidence: 70%

      await processCallback(cb);

      // Update should only have playCount and endedAt, NOT songTitle/artistName/confidence
      expect(mockAirplayEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 31 },
          data: expect.not.objectContaining({
            songTitle: expect.any(String),
          }),
        }),
      );
    });

    it("gap tolerance is exactly DETECTION_GAP_TOLERANCE_MS (300000ms = 5 minutes)", async () => {
      // We verify the findFirst query uses the correct gap window
      const cb = buildCallback();
      cb.data.metadata.timestamp_utc = "2026-03-15 14:30:00";

      await processCallback(cb);

      // The findFirst should search for events where endedAt >= detectedAt - 300000ms
      const detectedAt = new Date("2026-03-15 14:30:00");
      const gapCutoff = new Date(detectedAt.getTime() - 300000);

      expect(mockAirplayEventFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stationId: 1,
            endedAt: { gte: gapCutoff },
          }),
          orderBy: { endedAt: "desc" },
        }),
      );
    });
  });

  // ============================================
  // No-match handling
  // ============================================
  describe("No-match handling", () => {
    it("creates NoMatchCallback record for status code 1001", async () => {
      await processCallback(buildNoMatchCallback());

      expect(mockNoMatchCallbackCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stationId: 1,
          callbackAt: expect.any(Date),
          statusCode: 1001,
        }),
      });
    });

    it("does NOT create Detection or AirplayEvent for no-match callback", async () => {
      await processCallback(buildNoMatchCallback());

      expect(mockDetectionCreate).not.toHaveBeenCalled();
      expect(mockAirplayEventCreate).not.toHaveBeenCalled();
      expect(mockAirplayEventFindFirst).not.toHaveBeenCalled();
    });

    it("creates NoMatchCallback for empty music array", async () => {
      const cb = buildCallback();
      cb.data.metadata.music = [];
      cb.data.status = { msg: "Success", code: 0, version: "1.0" };

      await processCallback(cb);

      expect(mockNoMatchCallbackCreate).toHaveBeenCalled();
      expect(mockDetectionCreate).not.toHaveBeenCalled();
    });

    it("creates NoMatchCallback when metadata.music is undefined", async () => {
      const cb = {
        stream_id: "s-abc123",
        status: 1,
        data: {
          status: { msg: "Success", code: 0, version: "1.0" },
          metadata: {
            timestamp_utc: "2026-03-15 14:35:00",
          },
        },
      };

      await processCallback(cb);

      expect(mockNoMatchCallbackCreate).toHaveBeenCalled();
      expect(mockDetectionCreate).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Idempotency
  // ============================================
  describe("Idempotency", () => {
    it("handles duplicate rawCallbackId gracefully (unique constraint catch)", async () => {
      // Simulate Prisma unique constraint violation
      const uniqueError = new Error("Unique constraint failed");
      (uniqueError as Record<string, unknown>).code = "P2002";
      mockDetectionCreate.mockRejectedValueOnce(uniqueError);

      // Should NOT throw -- gracefully skip
      await expect(processCallback(buildCallback())).resolves.toBeUndefined();

      // Detection was attempted but failed; no AirplayEvent should be created for this one
      expect(mockDetectionCreate).toHaveBeenCalled();
    });
  });

  // ============================================
  // Snippet job enqueue
  // ============================================
  describe("Snippet job enqueue", () => {
    const mockSnippetQueueAdd = vi.fn().mockResolvedValue(undefined);
    const mockSnippetQueue = { add: mockSnippetQueueAdd } as unknown as import("bullmq").Queue;

    beforeEach(() => {
      mockSnippetQueueAdd.mockClear();
    });

    it("enqueues snippet job when creating a NEW AirplayEvent and SNIPPETS_ENABLED=true", async () => {
      process.env.SNIPPETS_ENABLED = "true";
      mockAirplayEventFindFirst.mockResolvedValue(null);
      mockAirplayEventCreate.mockResolvedValue({ id: 42 });

      // Re-import to pick up the snippet queue
      const mod = await import("../../src/workers/detection.js");
      // Start detection worker with snippet queue injected
      await mod.startDetectionWorker({ snippetQueue: mockSnippetQueue });
      await mod.processCallback(buildCallback());

      expect(mockSnippetQueueAdd).toHaveBeenCalledWith("extract", {
        airplayEventId: 42,
        stationId: 1,
        detectedAt: new Date("2026-03-15 14:30:00").toISOString(),
      });

      delete process.env.SNIPPETS_ENABLED;
    });

    it("does NOT enqueue snippet job when EXTENDING an existing AirplayEvent", async () => {
      process.env.SNIPPETS_ENABLED = "true";
      const existingEvent = {
        id: 10,
        stationId: 1,
        startedAt: new Date("2026-03-15 14:30:00"),
        endedAt: new Date("2026-03-15 14:30:00"),
        songTitle: "Doua Inimi",
        artistName: "Irina Rimes",
        isrc: "ROA231600001",
        playCount: 1,
        confidence: 0.85,
      };
      mockAirplayEventFindFirst.mockResolvedValue(existingEvent);

      const mod = await import("../../src/workers/detection.js");
      await mod.startDetectionWorker({ snippetQueue: mockSnippetQueue });
      await mod.processCallback(buildCallback());

      expect(mockSnippetQueueAdd).not.toHaveBeenCalled();

      delete process.env.SNIPPETS_ENABLED;
    });

    it("does NOT enqueue snippet job when SNIPPETS_ENABLED is not 'true'", async () => {
      process.env.SNIPPETS_ENABLED = "false";
      mockAirplayEventFindFirst.mockResolvedValue(null);
      mockAirplayEventCreate.mockResolvedValue({ id: 43 });

      const mod = await import("../../src/workers/detection.js");
      await mod.startDetectionWorker({ snippetQueue: mockSnippetQueue });
      await mod.processCallback(buildCallback());

      expect(mockSnippetQueueAdd).not.toHaveBeenCalled();

      delete process.env.SNIPPETS_ENABLED;
    });

    it("does NOT enqueue snippet job when no snippetQueue is provided", async () => {
      process.env.SNIPPETS_ENABLED = "true";
      mockAirplayEventFindFirst.mockResolvedValue(null);
      mockAirplayEventCreate.mockResolvedValue({ id: 44 });

      const mod = await import("../../src/workers/detection.js");
      // Start WITHOUT snippet queue
      await mod.startDetectionWorker();
      await mod.processCallback(buildCallback());

      expect(mockSnippetQueueAdd).not.toHaveBeenCalled();

      delete process.env.SNIPPETS_ENABLED;
    });
  });

  // ============================================
  // Worker lifecycle
  // ============================================
  describe("Worker lifecycle", () => {
    it("startDetectionWorker returns { queue, worker }", async () => {
      const result = await startDetectionWorker();

      expect(result).toHaveProperty("queue");
      expect(result).toHaveProperty("worker");
    });

    it("startDetectionWorker accepts optional snippetQueue parameter", async () => {
      const mockSnippetQueue = { add: vi.fn() } as unknown as import("bullmq").Queue;
      const result = await startDetectionWorker({ snippetQueue: mockSnippetQueue });

      expect(result).toHaveProperty("queue");
      expect(result).toHaveProperty("worker");
    });

    it("worker processes jobs from DETECTION_QUEUE", async () => {
      const { Queue, Worker } = await import("bullmq");

      await startDetectionWorker();

      // Worker should be created with "detection-processing" queue name
      expect(Worker).toHaveBeenCalledWith(
        "detection-processing",
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("worker registers 'failed' event handler", async () => {
      await startDetectionWorker();

      expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
    });
  });
});
