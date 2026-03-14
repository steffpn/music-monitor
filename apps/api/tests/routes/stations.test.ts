import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { server } from "../../src/index.js";
import { prisma } from "../../src/lib/prisma.js";
import { createRedisConnection } from "../../src/lib/redis.js";
import { CHANNELS, type StationEvent } from "../../src/lib/pubsub.js";

describe("Station CRUD Routes", () => {
  let subscriber: ReturnType<typeof createRedisConnection>;

  beforeAll(async () => {
    await server.ready();
    subscriber = createRedisConnection();
  });

  beforeEach(async () => {
    // Clean up test stations before each test
    await prisma.station.deleteMany({});
    subscriber.removeAllListeners("message");
  });

  afterAll(async () => {
    await prisma.station.deleteMany({});
    subscriber.disconnect();
    await server.close();
  });

  // --- POST /api/v1/stations ---

  describe("POST /api/v1/stations", () => {
    it("creates a station with valid body and returns 201", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations",
        payload: {
          name: "Radio Test",
          streamUrl: "http://example.com/stream",
          stationType: "radio",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe("Radio Test");
      expect(body.streamUrl).toBe("http://example.com/stream");
      expect(body.stationType).toBe("radio");
      expect(body.status).toBe("ACTIVE");
      expect(body.country).toBe("RO");
      expect(body.id).toBeDefined();
    });

    it("returns 400 when required fields are missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations",
        payload: {
          name: "Radio Test",
          // missing streamUrl and stationType
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when name is empty string", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations",
        payload: {
          name: "",
          streamUrl: "http://example.com/stream",
          stationType: "radio",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("publishes station:added event to Redis", async () => {
      const received = new Promise<StationEvent>((resolve) => {
        subscriber.on("message", (_channel: string, message: string) => {
          resolve(JSON.parse(message));
        });
      });

      await subscriber.subscribe(CHANNELS.STATION_ADDED);
      await new Promise((r) => setTimeout(r, 100));

      await server.inject({
        method: "POST",
        url: "/api/v1/stations",
        payload: {
          name: "PubSub Test Station",
          streamUrl: "http://example.com/stream",
          stationType: "radio",
        },
      });

      const event = await received;
      expect(event.stationId).toBeDefined();
      expect(event.streamUrl).toBe("http://example.com/stream");
      expect(event.timestamp).toBeDefined();

      await subscriber.unsubscribe(CHANNELS.STATION_ADDED);
    });

    it("accepts optional country field", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations",
        payload: {
          name: "Radio France",
          streamUrl: "http://example.fr/stream",
          stationType: "radio",
          country: "FR",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.country).toBe("FR");
    });
  });

  // --- POST /api/v1/stations/bulk ---

  describe("POST /api/v1/stations/bulk", () => {
    it("creates multiple stations and returns 201", async () => {
      const stations = [
        {
          name: "Station A",
          streamUrl: "http://example.com/a",
          stationType: "radio",
        },
        {
          name: "Station B",
          streamUrl: "http://example.com/b",
          stationType: "tv",
        },
      ];

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations/bulk",
        payload: stations,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("Station A");
      expect(body[0].status).toBe("ACTIVE");
      expect(body[1].name).toBe("Station B");
      expect(body[1].stationType).toBe("tv");
    });

    it("publishes station:added for each created station", async () => {
      const events: StationEvent[] = [];
      const received = new Promise<void>((resolve) => {
        subscriber.on("message", (_channel: string, message: string) => {
          events.push(JSON.parse(message));
          if (events.length === 2) resolve();
        });
      });

      await subscriber.subscribe(CHANNELS.STATION_ADDED);
      await new Promise((r) => setTimeout(r, 100));

      await server.inject({
        method: "POST",
        url: "/api/v1/stations/bulk",
        payload: [
          {
            name: "Bulk A",
            streamUrl: "http://example.com/a",
            stationType: "radio",
          },
          {
            name: "Bulk B",
            streamUrl: "http://example.com/b",
            stationType: "radio",
          },
        ],
      });

      await received;
      expect(events).toHaveLength(2);
      expect(events[0].stationId).toBeDefined();
      expect(events[1].stationId).toBeDefined();

      await subscriber.unsubscribe(CHANNELS.STATION_ADDED);
    });

    it("returns 400 for empty array", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/stations/bulk",
        payload: [],
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // --- GET /api/v1/stations ---

  describe("GET /api/v1/stations", () => {
    it("returns array of all stations with health fields", async () => {
      // Create test stations
      await prisma.station.createMany({
        data: [
          {
            name: "Radio 1",
            streamUrl: "http://example.com/1",
            stationType: "radio",
            status: "ACTIVE",
          },
          {
            name: "TV 1",
            streamUrl: "http://example.com/2",
            stationType: "tv",
            status: "INACTIVE",
          },
        ],
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/stations",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveLength(2);

      // Check health fields are present
      const station = body[0];
      expect(station.id).toBeDefined();
      expect(station.name).toBeDefined();
      expect(station.streamUrl).toBeDefined();
      expect(station.stationType).toBeDefined();
      expect(station.status).toBeDefined();
      expect("lastHeartbeat" in station).toBe(true);
      expect("restartCount" in station).toBe(true);
    });
  });

  // --- GET /api/v1/stations/:id ---

  describe("GET /api/v1/stations/:id", () => {
    it("returns single station", async () => {
      const station = await prisma.station.create({
        data: {
          name: "Single Station",
          streamUrl: "http://example.com/single",
          stationType: "radio",
          status: "ACTIVE",
        },
      });

      const response = await server.inject({
        method: "GET",
        url: `/api/v1/stations/${station.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe("Single Station");
      expect(body.id).toBe(station.id);
    });

    it("returns 404 for non-existent station", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/stations/99999",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // --- PATCH /api/v1/stations/:id ---

  describe("PATCH /api/v1/stations/:id", () => {
    it("updates station and returns updated data", async () => {
      const station = await prisma.station.create({
        data: {
          name: "Update Test",
          streamUrl: "http://example.com/old",
          stationType: "radio",
          status: "ACTIVE",
        },
      });

      const response = await server.inject({
        method: "PATCH",
        url: `/api/v1/stations/${station.id}`,
        payload: {
          streamUrl: "http://example.com/new",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.streamUrl).toBe("http://example.com/new");
    });

    it("publishes station:updated event", async () => {
      const station = await prisma.station.create({
        data: {
          name: "PubSub Update",
          streamUrl: "http://example.com/pubsub",
          stationType: "radio",
          status: "ACTIVE",
        },
      });

      const received = new Promise<StationEvent>((resolve) => {
        subscriber.on("message", (_channel: string, message: string) => {
          resolve(JSON.parse(message));
        });
      });

      await subscriber.subscribe(CHANNELS.STATION_UPDATED);
      await new Promise((r) => setTimeout(r, 100));

      await server.inject({
        method: "PATCH",
        url: `/api/v1/stations/${station.id}`,
        payload: {
          streamUrl: "http://example.com/updated",
        },
      });

      const event = await received;
      expect(event.stationId).toBe(station.id);
      expect(event.streamUrl).toBe("http://example.com/updated");
      expect(event.timestamp).toBeDefined();

      await subscriber.unsubscribe(CHANNELS.STATION_UPDATED);
    });

    it("returns 404 for non-existent station", async () => {
      const response = await server.inject({
        method: "PATCH",
        url: "/api/v1/stations/99999",
        payload: {
          name: "Ghost",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // --- DELETE /api/v1/stations/:id ---

  describe("DELETE /api/v1/stations/:id", () => {
    it("soft-deletes station by setting status to INACTIVE", async () => {
      const station = await prisma.station.create({
        data: {
          name: "Delete Test",
          streamUrl: "http://example.com/delete",
          stationType: "radio",
          status: "ACTIVE",
        },
      });

      const response = await server.inject({
        method: "DELETE",
        url: `/api/v1/stations/${station.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe("INACTIVE");

      // Verify in DB
      const dbStation = await prisma.station.findUnique({
        where: { id: station.id },
      });
      expect(dbStation).not.toBeNull();
      expect(dbStation!.status).toBe("INACTIVE");
    });

    it("publishes station:removed event", async () => {
      const station = await prisma.station.create({
        data: {
          name: "PubSub Delete",
          streamUrl: "http://example.com/pubsub-del",
          stationType: "radio",
          status: "ACTIVE",
        },
      });

      const received = new Promise<StationEvent>((resolve) => {
        subscriber.on("message", (_channel: string, message: string) => {
          resolve(JSON.parse(message));
        });
      });

      await subscriber.subscribe(CHANNELS.STATION_REMOVED);
      await new Promise((r) => setTimeout(r, 100));

      await server.inject({
        method: "DELETE",
        url: `/api/v1/stations/${station.id}`,
      });

      const event = await received;
      expect(event.stationId).toBe(station.id);
      expect(event.timestamp).toBeDefined();

      await subscriber.unsubscribe(CHANNELS.STATION_REMOVED);
    });

    it("returns 404 for non-existent station", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/stations/99999",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
