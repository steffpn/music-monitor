/**
 * Seed test users for each role + tier combo.
 * Run: DATABASE_URL=... npx tsx prisma/seed-test-users.ts
 *
 * Creates 7 test accounts (password: test1234):
 *   admin@mfm.test        ADMIN
 *   artist-free@mfm.test  ARTIST  (free tier)
 *   artist-premium@mfm.test ARTIST (premium subscription)
 *   label-free@mfm.test   LABEL   (free tier)
 *   label-premium@mfm.test LABEL  (premium subscription)
 *   station-free@mfm.test STATION (free tier)
 *   station-premium@mfm.test STATION (premium subscription)
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import argon2 from "argon2";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TEST_PASSWORD = "test1234";

const TEST_USERS = [
  { email: "admin@mfm.test", name: "Admin Test", role: "ADMIN", tier: null },
  { email: "artist-free@mfm.test", name: "Artist Free", role: "ARTIST", tier: "FREE" },
  { email: "artist-premium@mfm.test", name: "Artist Premium", role: "ARTIST", tier: "PREMIUM" },
  { email: "label-free@mfm.test", name: "Label Free", role: "LABEL", tier: "FREE" },
  { email: "label-premium@mfm.test", name: "Label Premium", role: "LABEL", tier: "PREMIUM" },
  { email: "station-free@mfm.test", name: "Station Free", role: "STATION", tier: "FREE" },
  { email: "station-premium@mfm.test", name: "Station Premium", role: "STATION", tier: "PREMIUM" },
];

async function main() {
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  console.log("Creating test users (password: test1234)...\n");

  for (const u of TEST_USERS) {
    // Skip if exists
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  [skip] ${u.email} — already exists (id: ${existing.id})`);

      // Still assign subscription if premium and missing
      if (u.tier === "PREMIUM") {
        const sub = await prisma.subscription.findFirst({ where: { userId: existing.id } });
        if (!sub) {
          const plan = await prisma.plan.findFirst({
            where: { role: u.role, tier: "PREMIUM", isActive: true },
          });
          if (plan) {
            await prisma.subscription.create({
              data: { userId: existing.id, planId: plan.id, status: "active", billingInterval: "monthly" },
            });
            console.log(`         → subscribed to ${plan.name}`);
          }
        }
      }
      continue;
    }

    // Create user
    const user = await prisma.user.create({
      data: { email: u.email, name: u.name, role: u.role, passwordHash },
    });

    // Scope STATION users to first active station
    if (u.role === "STATION") {
      const station = await prisma.station.findFirst({ where: { status: "active" } });
      if (station) {
        await prisma.userScope.create({
          data: { userId: user.id, entityType: "STATION", entityId: station.id },
        });
        console.log(`  [ok] ${u.email} (${u.role} ${u.tier || ""}) — id: ${user.id}, station: ${station.name}`);
      } else {
        console.log(`  [ok] ${u.email} (${u.role} ${u.tier || ""}) — id: ${user.id}`);
      }
    } else {
      console.log(`  [ok] ${u.email} (${u.role} ${u.tier || ""}) — id: ${user.id}`);
    }

    // Assign premium subscription
    if (u.tier === "PREMIUM") {
      const plan = await prisma.plan.findFirst({
        where: { role: u.role, tier: "PREMIUM", isActive: true },
      });
      if (plan) {
        await prisma.subscription.create({
          data: { userId: user.id, planId: plan.id, status: "active", billingInterval: "monthly" },
        });
        console.log(`         → subscribed to ${plan.name}`);
      }
    }
  }

  // Also clean up old test users (artist@mfm.test etc) if they exist
  for (const email of ["artist@mfm.test", "label@mfm.test", "station@mfm.test"]) {
    const old = await prisma.user.findUnique({ where: { email } });
    if (old) {
      await prisma.refreshToken.deleteMany({ where: { userId: old.id } });
      await prisma.userScope.deleteMany({ where: { userId: old.id } });
      await prisma.user.delete({ where: { email } });
      console.log(`  [cleanup] removed old ${email}`);
    }
  }

  console.log("\n=== Test Credentials ===");
  console.log("Password for all: test1234\n");
  for (const u of TEST_USERS) {
    console.log(`  ${(u.role + (u.tier ? ` ${u.tier}` : "")).padEnd(18)} → ${u.email}`);
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
