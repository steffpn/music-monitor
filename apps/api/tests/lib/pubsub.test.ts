import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { redis, createRedisConnection } from "../../src/lib/redis.js";
import {
  CHANNELS,
  publishStationEvent,
  type StationEvent,
} from "../../src/lib/pubsub.js";

describe("Pub/Sub Helpers", () => {
  let subscriber: ReturnType<typeof createRedisConnection>;

  beforeAll(async () => {
    subscriber = createRedisConnection();
  });

  afterAll(async () => {
    subscriber.disconnect();
  });

  it("CHANNELS defines station:added, station:removed, station:updated", () => {
    expect(CHANNELS.STATION_ADDED).toBe("station:added");
    expect(CHANNELS.STATION_REMOVED).toBe("station:removed");
    expect(CHANNELS.STATION_UPDATED).toBe("station:updated");
  });

  it("publishStationEvent publishes JSON payload to station:added channel", async () => {
    const received = new Promise<StationEvent>((resolve) => {
      subscriber.on("message", (_channel: string, message: string) => {
        resolve(JSON.parse(message));
      });
    });

    await subscriber.subscribe(CHANNELS.STATION_ADDED);
    // Small delay for subscription to register
    await new Promise((r) => setTimeout(r, 100));

    const event: StationEvent = {
      stationId: 1,
      streamUrl: "http://example.com/stream",
      timestamp: new Date().toISOString(),
    };

    await publishStationEvent(CHANNELS.STATION_ADDED, event);

    const msg = await received;
    expect(msg.stationId).toBe(1);
    expect(msg.streamUrl).toBe("http://example.com/stream");
    expect(msg.timestamp).toBeDefined();

    await subscriber.unsubscribe(CHANNELS.STATION_ADDED);
    subscriber.removeAllListeners("message");
  });

  it("publishStationEvent publishes to station:removed channel", async () => {
    const received = new Promise<StationEvent>((resolve) => {
      subscriber.on("message", (_channel: string, message: string) => {
        resolve(JSON.parse(message));
      });
    });

    await subscriber.subscribe(CHANNELS.STATION_REMOVED);
    await new Promise((r) => setTimeout(r, 100));

    const event: StationEvent = {
      stationId: 42,
      timestamp: new Date().toISOString(),
    };

    await publishStationEvent(CHANNELS.STATION_REMOVED, event);

    const msg = await received;
    expect(msg.stationId).toBe(42);
    expect(msg.streamUrl).toBeUndefined();

    await subscriber.unsubscribe(CHANNELS.STATION_REMOVED);
    subscriber.removeAllListeners("message");
  });

  it("publishStationEvent publishes to station:updated channel with streamUrl", async () => {
    const received = new Promise<StationEvent>((resolve) => {
      subscriber.on("message", (_channel: string, message: string) => {
        resolve(JSON.parse(message));
      });
    });

    await subscriber.subscribe(CHANNELS.STATION_UPDATED);
    await new Promise((r) => setTimeout(r, 100));

    const event: StationEvent = {
      stationId: 7,
      streamUrl: "http://new-url.com/stream",
      timestamp: new Date().toISOString(),
    };

    await publishStationEvent(CHANNELS.STATION_UPDATED, event);

    const msg = await received;
    expect(msg.stationId).toBe(7);
    expect(msg.streamUrl).toBe("http://new-url.com/stream");

    await subscriber.unsubscribe(CHANNELS.STATION_UPDATED);
    subscriber.removeAllListeners("message");
  });
});
