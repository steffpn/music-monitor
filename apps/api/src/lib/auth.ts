import * as argon2 from "argon2";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "./prisma.js";
import { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY } from "@myfuckingmusic/shared";

/**
 * Hash a password using argon2id with recommended settings.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verify a password against a stored argon2id hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Generate a cryptographically secure invitation code in XXXX-XXXX-XXXX format.
 * Uses uppercase hex characters.
 */
export function generateInviteCode(): string {
  const hex = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * Generate an access token + refresh token pair for a user.
 * Creates a RefreshToken row in the database.
 */
export async function generateTokenPair(
  fastify: FastifyInstance,
  userId: number
): Promise<{ accessToken: string; refreshToken: string }> {
  // Sign JWT access token
  const accessToken = fastify.jwt.sign(
    { sub: userId },
    { expiresIn: JWT_ACCESS_EXPIRY }
  );

  // Generate opaque refresh token
  const refreshToken = crypto.randomBytes(32).toString("hex");

  // Calculate refresh token expiry (parse "30d" format)
  const daysMatch = JWT_REFRESH_EXPIRY.match(/^(\d+)d$/);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Bootstrap an admin user from environment variables on first startup.
 * Only creates admin when no users exist in the database.
 */
export async function bootstrapAdmin(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("[auth] Users exist, skipping admin bootstrap");
    return;
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "[auth] No ADMIN_EMAIL/ADMIN_PASSWORD set, skipping admin bootstrap"
    );
    return;
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Admin",
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`[auth] Admin user bootstrapped: ${email}`);
}
