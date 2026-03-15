import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

export interface CurrentUser {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  scopes: Array<{ entityType: string; entityId: number }>;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser;
  }
}

/**
 * Fastify preHandler that verifies JWT, loads user from DB,
 * and attaches currentUser to the request.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();

    const payload = request.user as { sub: number };
    const userId = payload.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { scopes: true },
    });

    if (!user || !user.isActive) {
      reply.code(401).send({ error: "Invalid or expired token" });
      return;
    }

    request.currentUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      scopes: user.scopes.map((s) => ({
        entityType: s.entityType,
        entityId: s.entityId,
      })),
    };
  } catch {
    reply.code(401).send({ error: "Invalid or expired token" });
  }
}
