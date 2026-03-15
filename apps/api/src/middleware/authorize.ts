import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Factory that returns a preHandler checking the authenticated user's role.
 * Must be used after the authenticate middleware.
 */
export function requireRole(
  ...roles: string[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.currentUser || !roles.includes(request.currentUser.role)) {
      reply.code(403).send({ error: "Insufficient permissions" });
      return;
    }
  };
}
