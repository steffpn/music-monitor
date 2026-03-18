import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import { getPresignedUrl } from "../../../lib/r2.js";
import type { AirplayEventParams, ListEventsQuery } from "./schema.js";

/**
 * GET /airplay-events/:id/snippet - Get a presigned URL for the event's audio snippet.
 *
 * Returns a fresh presigned URL valid for 24 hours (86400 seconds).
 * Returns 404 if the event doesn't exist, has no snippet, or is outside user's scope.
 *
 * Scope filtering:
 * - ADMIN: no filtering, can access any event
 * - STATION: can only access events belonging to stations in their scopes
 * - ARTIST/LABEL: allowed access if they have any scope entry (refined when entity models added)
 */
export async function getSnippetUrl(
  request: FastifyRequest<{ Params: AirplayEventParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params;
  const { currentUser } = request;

  const event = await prisma.airplayEvent.findUnique({
    where: { id },
  });

  if (!event) {
    return reply.status(404).send({ error: "Airplay event not found" });
  }

  // Scope-based data filtering per locked decision:
  // "Route handlers filter Prisma queries by user's scoped entity IDs"
  if (currentUser.role !== "ADMIN") {
    const stationScopes = currentUser.scopes
      .filter((s) => s.entityType === "STATION")
      .map((s) => s.entityId);

    if (currentUser.role === "STATION") {
      // STATION users can only access events from their scoped stations
      if (!stationScopes.includes(event.stationId)) {
        return reply.status(404).send({ error: "Airplay event not found" });
      }
    } else {
      // ARTIST/LABEL: allow access if they have any scope entry
      // (refined when artist/label entity models are added in later phases)
      if (currentUser.scopes.length === 0) {
        return reply.status(404).send({ error: "Airplay event not found" });
      }
    }
  }

  if (!event.snippetUrl) {
    request.log.info({ eventId: id, snippetUrl: event.snippetUrl }, "Snippet 404 - no snippetUrl on event");
    return reply
      .status(404)
      .send({ error: "No snippet available for this event" });
  }

  try {
    request.log.info({ eventId: id, snippetUrl: event.snippetUrl }, "Generating presigned URL");
    const presignedUrl = await getPresignedUrl(event.snippetUrl, 86400);
    return reply.send({ url: presignedUrl, expiresIn: 86400 });
  } catch (err) {
    request.log.error({ eventId: id, err }, "Failed to generate presigned URL");
    return reply.status(500).send({ error: "Failed to generate snippet URL" });
  }
}

/**
 * GET /airplay-events - List airplay events with search, filters, and cursor pagination.
 *
 * Query params:
 * - cursor: event ID to paginate from (results with id < cursor)
 * - limit: max results per page (default 20, max 100)
 * - q: search songTitle, artistName (case-insensitive contains) and isrc (case-insensitive equals)
 * - startDate: filter startedAt >= date
 * - endDate: filter startedAt <= date
 * - stationId: filter by specific station
 *
 * Scope filtering:
 * - ADMIN: sees all events
 * - STATION: only events from scoped station IDs
 * - ARTIST/LABEL: sees all events (scope filtering deferred)
 */
export async function listEvents(
  request: FastifyRequest<{ Querystring: ListEventsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { cursor, limit: rawLimit, q, startDate, endDate, stationId } = request.query;
  const limit = rawLimit || 20;
  const { currentUser } = request;

  // Build where clause
  const where: Record<string, unknown> = {};

  // Cursor-based pagination (descending order: id < cursor)
  if (cursor) {
    where.id = { lt: cursor };
  }

  // Search: OR across songTitle, artistName (contains), isrc (equals)
  if (q) {
    where.OR = [
      { songTitle: { contains: q, mode: "insensitive" } },
      { artistName: { contains: q, mode: "insensitive" } },
      { isrc: { equals: q, mode: "insensitive" } },
    ];
  }

  // Date range filter
  if (startDate || endDate) {
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    where.startedAt = dateFilter;
  }

  // Station filter
  if (stationId) {
    where.stationId = stationId;
  }

  // Scope-based filtering
  if (currentUser.role === "STATION") {
    const stationScopes = currentUser.scopes
      .filter((s) => s.entityType === "STATION")
      .map((s) => s.entityId);

    // Override any explicit stationId with scope constraint
    where.stationId = { in: stationScopes };
  }
  // ADMIN, ARTIST, LABEL: no additional scope filter

  // Fetch limit + 1 to determine if there are more results
  const events = await prisma.airplayEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    include: { station: { select: { name: true } } },
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return reply.send({ data, nextCursor });
}
