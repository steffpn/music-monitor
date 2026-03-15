import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
} from "../../../lib/auth.js";
import type { RegisterBody, LoginBody, RefreshBody, LogoutBody } from "./schema.js";

/**
 * Format a user record for API responses.
 * Only returns public fields -- never passwordHash.
 */
function formatUser(user: { id: number; email: string; name: string; role: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

/**
 * POST /auth/register
 *
 * Validates invitation code, creates user, generates tokens.
 * Creates UserScope if the invitation has a scopeId.
 */
export async function register(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply
): Promise<void> {
  const { code, email, password, name } = request.body;

  // Find invitation by code
  const invitation = await prisma.invitation.findUnique({
    where: { code },
  });

  if (!invitation) {
    return reply.code(400).send({ error: "Invalid invitation code" });
  }

  // Validate invitation status
  if (invitation.status !== "PENDING") {
    return reply.code(400).send({ error: "Invitation code is no longer valid" });
  }

  // Check expiry
  if (invitation.expiresAt < new Date()) {
    return reply.code(400).send({ error: "Invitation code has expired" });
  }

  // Check maxUses
  if (invitation.usedCount >= invitation.maxUses) {
    return reply.code(400).send({ error: "Invitation code has been fully used" });
  }

  // Check email uniqueness
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return reply.code(409).send({ error: "Email already registered" });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user, update invitation, and optionally create scope in a transaction
  const newUsedCount = invitation.usedCount + 1;
  const newStatus = newUsedCount >= invitation.maxUses ? "REDEEMED" : "PENDING";

  const user = await prisma.$transaction(async (tx) => {
    // Create user with role from invitation
    const createdUser = await tx.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: invitation.role,
        isActive: true,
      },
    });

    // Create UserScope if invitation has scopeId
    if (invitation.scopeId !== null) {
      await tx.userScope.create({
        data: {
          userId: createdUser.id,
          entityType: invitation.role,
          entityId: invitation.scopeId,
        },
      });
    }

    // Update invitation usage
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        usedCount: newUsedCount,
        status: newStatus,
      },
    });

    return createdUser;
  });

  // Generate token pair
  const tokens = await generateTokenPair(request.server, user.id);

  return reply.code(201).send({
    user: formatUser(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

/**
 * POST /auth/login
 *
 * Authenticates user by email + password, returns tokens.
 */
export async function login(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
): Promise<void> {
  const { email, password } = request.body;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Opaque error for both missing user and wrong password
  if (!user || !user.isActive) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate token pair
  const tokens = await generateTokenPair(request.server, user.id);

  return reply.code(200).send({
    user: formatUser(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

/**
 * POST /auth/refresh
 *
 * Accepts a valid refresh token, rotates it (revokes old, creates new).
 */
export async function refresh(
  request: FastifyRequest<{ Body: RefreshBody }>,
  reply: FastifyReply
): Promise<void> {
  const { refreshToken } = request.body;

  // Find the refresh token in DB
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  // Validate token
  if (!storedToken) {
    return reply.code(401).send({ error: "Invalid refresh token" });
  }

  if (storedToken.revokedAt !== null) {
    return reply.code(401).send({ error: "Invalid refresh token" });
  }

  if (storedToken.expiresAt < new Date()) {
    return reply.code(401).send({ error: "Invalid refresh token" });
  }

  if (!storedToken.user.isActive) {
    return reply.code(401).send({ error: "Invalid refresh token" });
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  // Generate new token pair
  const tokens = await generateTokenPair(request.server, storedToken.userId);

  return reply.code(200).send({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

/**
 * POST /auth/logout
 *
 * Revokes the provided refresh token. Requires authentication.
 */
export async function logout(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { refreshToken } = request.body as LogoutBody;
  const userId = request.currentUser.id;

  // Find the refresh token belonging to the current user
  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      token: refreshToken,
      userId,
    },
  });

  if (storedToken) {
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });
  }

  return reply.code(200).send({ message: "Logged out" });
}
