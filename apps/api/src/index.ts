import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { bootstrapAdmin } from "./lib/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = Fastify({ logger: true });

// JWT authentication
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || "dev-secret-change-me",
  sign: { expiresIn: "1h" },
});

// Health check -- verifies DB and Redis connections
server.get("/health", async () => {
  const dbOk = await prisma
    .$queryRaw`SELECT 1 as ok`
    .then(() => true)
    .catch(() => false);
  const redisOk = await redis
    .ping()
    .then((r) => r === "PONG")
    .catch(() => false);
  return {
    status: dbOk && redisOk ? "ok" : "degraded",
    db: dbOk ? "connected" : "disconnected",
    redis: redisOk ? "connected" : "disconnected",
  };
});

// Graceful shutdown
const shutdown = async () => {
  await prisma.$disconnect();
  redis.disconnect();
  await server.close();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Admin dashboard static files
server.register(fastifyStatic, {
  root: path.join(__dirname, "admin-dashboard/public"),
  prefix: "/admin/",
  decorateReply: false,
});

// Redirect /admin to /admin/ for convenience
server.get("/admin", async (_req, reply) => {
  return reply.redirect("/admin/");
});

// API v1 routes
server.register(import("./routes/v1/index.js"), { prefix: "/api/v1" });

export { server };

const start = async () => {
  try {
    await server.ready();
    await bootstrapAdmin();
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Only start if this is the main module (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
