import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  generateInviteCode,
  generateTokenPair,
  bootstrapAdmin,
} from "../../src/lib/auth.js";
import { server } from "../../src/index.js";

describe("Auth Library", () => {
  beforeAll(async () => {
    await server.ready();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    await server.close();
  });

  describe("hashPassword", () => {
    it("returns an argon2id hash string", async () => {
      const hash = await hashPassword("test123");
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it("returns different hashes for same password (salted)", async () => {
      const hash1 = await hashPassword("test123");
      const hash2 = await hashPassword("test123");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for matching password", async () => {
      const hash = await hashPassword("test123");
      const result = await verifyPassword("test123", hash);
      expect(result).toBe(true);
    });

    it("returns false for wrong password", async () => {
      const hash = await hashPassword("test123");
      const result = await verifyPassword("wrong-password", hash);
      expect(result).toBe(false);
    });
  });

  describe("generateInviteCode", () => {
    it("returns a 14-character string in XXXX-XXXX-XXXX format", () => {
      const code = generateInviteCode();
      expect(code).toHaveLength(14);
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    });

    it("generates unique codes", () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()));
      expect(codes.size).toBe(100);
    });
  });

  describe("generateTokenPair", () => {
    beforeEach(async () => {
      await prisma.refreshToken.deleteMany({});
      await prisma.user.deleteMany({});
    });

    it("returns accessToken and refreshToken strings", async () => {
      const user = await prisma.user.create({
        data: {
          email: "tokentest@test.com",
          passwordHash: "dummy",
          name: "Token Tester",
          role: "ADMIN",
        },
      });

      const tokens = await generateTokenPair(server, user.id);
      expect(tokens.accessToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe("string");
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.refreshToken).toBe("string");
    });

    it("creates a RefreshToken row in the database", async () => {
      const user = await prisma.user.create({
        data: {
          email: "tokendb@test.com",
          passwordHash: "dummy",
          name: "DB Tester",
          role: "ADMIN",
        },
      });

      const tokens = await generateTokenPair(server, user.id);

      const dbToken = await prisma.refreshToken.findUnique({
        where: { token: tokens.refreshToken },
      });
      expect(dbToken).not.toBeNull();
      expect(dbToken!.userId).toBe(user.id);
      expect(dbToken!.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("bootstrapAdmin", () => {
    beforeEach(async () => {
      await prisma.refreshToken.deleteMany({});
      await prisma.user.deleteMany({});
    });

    it("creates admin user when no users exist and env vars set", async () => {
      const origEmail = process.env.ADMIN_EMAIL;
      const origPassword = process.env.ADMIN_PASSWORD;
      process.env.ADMIN_EMAIL = "admin@test.com";
      process.env.ADMIN_PASSWORD = "AdminPass123";

      await bootstrapAdmin();

      const admin = await prisma.user.findUnique({
        where: { email: "admin@test.com" },
      });
      expect(admin).not.toBeNull();
      expect(admin!.role).toBe("ADMIN");
      expect(admin!.isActive).toBe(true);
      expect(admin!.passwordHash).toMatch(/^\$argon2id\$/);

      process.env.ADMIN_EMAIL = origEmail;
      process.env.ADMIN_PASSWORD = origPassword;
    });

    it("does nothing when users already exist", async () => {
      await prisma.user.create({
        data: {
          email: "existing@test.com",
          passwordHash: "dummy",
          name: "Existing User",
          role: "ARTIST",
        },
      });

      const origEmail = process.env.ADMIN_EMAIL;
      const origPassword = process.env.ADMIN_PASSWORD;
      process.env.ADMIN_EMAIL = "admin-skip@test.com";
      process.env.ADMIN_PASSWORD = "AdminPass123";

      await bootstrapAdmin();

      const count = await prisma.user.count();
      expect(count).toBe(1);

      process.env.ADMIN_EMAIL = origEmail;
      process.env.ADMIN_PASSWORD = origPassword;
    });
  });
});
