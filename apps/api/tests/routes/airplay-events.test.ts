import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock ----
const mockAirplayEventFindUnique = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    airplayEvent: {
      findUnique: (...args: unknown[]) => mockAirplayEventFindUnique(...args),
    },
    // Stub required for Fastify server initialization
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---- R2 mock ----
const mockGetPresignedUrl = vi.fn();

vi.mock("../../src/lib/r2.js", () => ({
  getPresignedUrl: (...args: unknown[]) => mockGetPresignedUrl(...args),
  r2Client: null,
  uploadToR2: vi.fn(),
}));

// ---- Redis mock ----
const mockRedisDisconnect = vi.fn();
vi.mock("../../src/lib/redis.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    disconnect: mockRedisDisconnect,
    removeAllListeners: vi.fn(),
  }),
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    disconnect: vi.fn(),
  },
}));

describe("Airplay Events Routes", () => {
  let server: Awaited<typeof import("../../src/index.js")>["server"];

  beforeEach(async () => {
    mockAirplayEventFindUnique.mockClear();
    mockGetPresignedUrl.mockClear();

    const mod = await import("../../src/index.js");
    server = mod.server;
    await server.ready();
  });

  describe("GET /api/v1/airplay-events/:id/snippet", () => {
    it("returns 200 with presigned URL when event has snippetUrl", async () => {
      mockAirplayEventFindUnique.mockResolvedValue({
        id: 1,
        snippetUrl: "snippets/1/2026-03-15/1.aac",
      });
      mockGetPresignedUrl.mockResolvedValue("https://r2.example.com/presigned-url");

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/airplay-events/1/snippet",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.url).toBe("https://r2.example.com/presigned-url");
      expect(body.expiresIn).toBe(86400);
      expect(mockGetPresignedUrl).toHaveBeenCalledWith(
        "snippets/1/2026-03-15/1.aac",
        86400,
      );
    });

    it("returns 404 when event ID does not exist", async () => {
      mockAirplayEventFindUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/airplay-events/99999/snippet",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe("Airplay event not found");
    });

    it("returns 404 when event has no snippet (snippetUrl is null)", async () => {
      mockAirplayEventFindUnique.mockResolvedValue({
        id: 1,
        snippetUrl: null,
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/airplay-events/1/snippet",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe("No snippet available for this event");
    });
  });
});
