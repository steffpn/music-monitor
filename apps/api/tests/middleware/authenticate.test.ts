import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import { prisma } from "../../src/lib/prisma.js";
import { authenticate } from "../../src/middleware/authenticate.js";
import { requireRole } from "../../src/middleware/authorize.js";

describe("Authentication & Authorization Middleware", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(fastifyJwt, {
      secret: "test-secret-for-middleware",
      sign: { expiresIn: "1h" },
    });

    // Protected route for testing authenticate
    app.get(
      "/protected",
      { preHandler: [authenticate] },
      async (request) => {
        return { user: request.currentUser };
      }
    );

    // Admin-only route for testing requireRole
    app.get(
      "/admin-only",
      { preHandler: [authenticate, requireRole("ADMIN")] },
      async (request) => {
        return { user: request.currentUser };
      }
    );

    await app.ready();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.userScope.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.userScope.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  describe("authenticate middleware", () => {
    it("attaches currentUser for valid JWT with active user", async () => {
      const user = await prisma.user.create({
        data: {
          email: "auth@test.com",
          passwordHash: "dummy",
          name: "Auth User",
          role: "ADMIN",
        },
      });

      await prisma.userScope.create({
        data: {
          userId: user.id,
          entityType: "station",
          entityId: 1,
        },
      });

      const token = app.jwt.sign({ sub: user.id });

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user.id).toBe(user.id);
      expect(body.user.email).toBe("auth@test.com");
      expect(body.user.role).toBe("ADMIN");
      expect(body.user.isActive).toBe(true);
      expect(body.user.scopes).toHaveLength(1);
      expect(body.user.scopes[0].entityType).toBe("station");
      expect(body.user.scopes[0].entityId).toBe(1);
    });

    it("returns 401 for missing authorization header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for invalid JWT", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: "Bearer invalid-token-here" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for expired JWT", async () => {
      const user = await prisma.user.create({
        data: {
          email: "expired@test.com",
          passwordHash: "dummy",
          name: "Expired User",
          role: "ADMIN",
        },
      });

      // Sign with negative expiry to create expired token
      const token = app.jwt.sign({ sub: user.id }, { expiresIn: "0s" });

      // Small delay to ensure token is expired
      await new Promise((r) => setTimeout(r, 1100));

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for deactivated user with valid JWT", async () => {
      const user = await prisma.user.create({
        data: {
          email: "deactivated@test.com",
          passwordHash: "dummy",
          name: "Deactivated User",
          role: "ADMIN",
          isActive: false,
        },
      });

      const token = app.jwt.sign({ sub: user.id });

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for JWT with non-existent user", async () => {
      const token = app.jwt.sign({ sub: 99999 });

      const response = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("requireRole middleware", () => {
    it("allows ADMIN user to access admin-only route", async () => {
      const user = await prisma.user.create({
        data: {
          email: "admin-role@test.com",
          passwordHash: "dummy",
          name: "Admin Role",
          role: "ADMIN",
        },
      });

      const token = app.jwt.sign({ sub: user.id });

      const response = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it("returns 403 for non-ADMIN user on admin-only route", async () => {
      const user = await prisma.user.create({
        data: {
          email: "artist-role@test.com",
          passwordHash: "dummy",
          name: "Artist Role",
          role: "ARTIST",
        },
      });

      const token = app.jwt.sign({ sub: user.id });

      const response = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe("Insufficient permissions");
    });
  });
});
