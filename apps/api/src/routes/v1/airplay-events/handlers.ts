import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import { getPresignedUrl } from "../../../lib/r2.js";
import type { AirplayEventParams } from "./schema.js";

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
    return reply
      .status(404)
      .send({ error: "No snippet available for this event" });
  }

  const presignedUrl = await getPresignedUrl(event.snippetUrl, 86400);

  return reply.send({ url: presignedUrl, expiresIn: 86400 });
}
