/**
 * Reset and repopulate test account data.
 * DOES NOT TOUCH: detections, airplay_events, audio_snippets, stations, no_match_callbacks
 *
 * Artist (free+premium) = Vescan
 * Label (free+premium) = Global Records (roster of Romanian artists)
 * Station (free+premium) = Virgin Radio (watching Kiss FM)
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const ALL_TEST_EMAILS = [
  "artist-free@mfm.test", "artist-premium@mfm.test",
  "label-free@mfm.test", "label-premium@mfm.test",
  "station-free@mfm.test", "station-premium@mfm.test",
  "admin@mfm.test",
  "admin@test.com", "stefan@test.com", "label@test.com", "station@test.com",
];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: ALL_TEST_EMAILS } },
    select: { id: true, email: true, role: true },
  });
  const userIds = users.map(u => u.id);
  const u = (email: string) => users.find(x => x.email === email)!;

  console.log("=== CLEANUP ===\n");

  await prisma.labelMonitoredSong.deleteMany({ where: { monitoredSong: { userId: { in: userIds } } } });
  await prisma.labelArtist.deleteMany({ where: { labelUserId: { in: userIds } } });
  await prisma.monitoredSong.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userScope.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.watchedStation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.dailyReport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.chartAlert.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userSettings.deleteMany({ where: { userId: { in: userIds } } });
  console.log("  All test data cleaned.\n");

  // Stations
  const virginRadio = await prisma.station.findFirst({ where: { name: { contains: "Virgin" } } });
  const kissFM = await prisma.station.findFirst({ where: { name: { contains: "Kiss" } } });

  // activatedAt in the past so plays show up
  const activatedAt = new Date("2026-01-01");

  // ─── Vescan's songs from airplay ────────────────────────────────
  const vescanSongs = await prisma.$queryRaw<Array<{ isrc: string; song_title: string; artist_name: string }>>`
    SELECT DISTINCT isrc, song_title, artist_name FROM airplay_events
    WHERE artist_name ILIKE '%vescan%' AND isrc IS NOT NULL
  `;
  console.log(`  Vescan songs in airplay: ${vescanSongs.length}`);

  // ─── ARTIST FREE = Vescan ───────────────────────────────────────
  const artistFree = u("artist-free@mfm.test");
  await prisma.userSettings.create({ data: { userId: artistFree.id, dailyReportTime: "08:00", dailyReportTimezone: "Europe/Bucharest" } });
  for (const s of vescanSongs) {
    await prisma.monitoredSong.create({
      data: { userId: artistFree.id, songTitle: s.song_title, artistName: s.artist_name, isrc: s.isrc, activatedAt, status: "active" },
    }).catch(() => {});
  }
  console.log(`  artist-free (Vescan) → ${vescanSongs.length} songs`);

  // ─── ARTIST PREMIUM = Vescan ────────────────────────────────────
  const artistPremium = u("artist-premium@mfm.test");
  const artPremPlan = await prisma.plan.findFirst({ where: { role: "ARTIST", tier: "PREMIUM", isActive: true } });
  if (artPremPlan) await prisma.subscription.create({ data: { userId: artistPremium.id, planId: artPremPlan.id, status: "active", billingInterval: "monthly" } });
  await prisma.userSettings.create({ data: { userId: artistPremium.id, dailyReportTime: "09:00", dailyReportTimezone: "Europe/Bucharest", chartAlertCountries: ["RO", "US", "GB"] } });
  for (const s of vescanSongs) {
    await prisma.monitoredSong.create({
      data: { userId: artistPremium.id, songTitle: s.song_title, artistName: s.artist_name, isrc: s.isrc, activatedAt, status: "active" },
    }).catch(() => {});
  }
  console.log(`  artist-premium (Vescan) → ${vescanSongs.length} songs`);

  // ─── Global Records artist roster ───────────────────────────────
  const labelArtistDefs = [
    { name: "Vescan", pic: "https://cdn-images.dzcdn.net/images/artist/f26fdaaf3e17e085827bdefeb884c6d9/250x250-000000-80-0-0.jpg" },
    { name: "Irina Rimes", pic: "https://cdn-images.dzcdn.net/images/artist/2da3179fbc21f11aac5f638fc63fe1d9/250x250-000000-80-0-0.jpg" },
    { name: "Florian Rus", pic: "https://cdn-images.dzcdn.net/images/artist/bb8b611fa94a029780549c3f80c18738/250x250-000000-80-0-0.jpg" },
    { name: "Raluka", pic: "https://cdn-images.dzcdn.net/images/artist/ce6097099dcaf1cbd758010410db5921/250x250-000000-80-0-0.jpg" },
    { name: "IRAIDA", pic: "https://cdn-images.dzcdn.net/images/artist/8b006db4bd239cab99a639c66b2e8551/250x250-000000-80-0-0.jpg" },
    { name: "EMAA", pic: "https://cdn-images.dzcdn.net/images/artist/76a2fb45c71b9d71f5c3b894982d1c8a/250x250-000000-80-0-0.jpg" },
    { name: "Andia", pic: "https://cdn-images.dzcdn.net/images/artist/e2cf07b9c5c25e5b46a45e1346fad582/250x250-000000-80-0-0.jpg" },
    { name: "Feli", pic: "https://cdn-images.dzcdn.net/images/artist/9729bd836207192fa455461fcf6046e7/250x250-000000-80-0-0.jpg" },
    { name: "Liviu Teodorescu", pic: "https://cdn-images.dzcdn.net/images/artist/9c4e61fb9d81f3df3e22f2afd0b93e95/250x250-000000-80-0-0.jpg" },
    { name: "Alina Eremia", pic: "https://cdn-images.dzcdn.net/images/artist/76b83e5f5e7e77a1e69d8aa92ee7685d/250x250-000000-80-0-0.jpg" },
    { name: "rares", pic: "https://cdn-images.dzcdn.net/images/artist/0b3ff93e60d0bb6a07ff6b83e26fc4ea/250x250-000000-80-0-0.jpg" },
    { name: "Andra", pic: "https://cdn-images.dzcdn.net/images/artist/68d3e5a0a4ab99df3e76e89770c00682/250x250-000000-80-0-0.jpg" },
  ];

  async function setupLabel(userId: number, artists: typeof labelArtistDefs) {
    await prisma.userSettings.create({ data: { userId, dailyReportTime: "09:00", dailyReportTimezone: "Europe/Bucharest", chartAlertCountries: ["RO"] } });

    for (const art of artists) {
      const la = await prisma.labelArtist.create({
        data: { labelUserId: userId, artistName: art.name, pictureUrl: art.pic },
      });

      const artistSongs = await prisma.$queryRaw<Array<{ isrc: string; song_title: string; artist_name: string }>>`
        SELECT DISTINCT isrc, song_title, artist_name FROM airplay_events
        WHERE artist_name = ${art.name} AND isrc IS NOT NULL
      `;

      for (const s of artistSongs) {
        const ms = await prisma.monitoredSong.create({
          data: { userId, songTitle: s.song_title, artistName: s.artist_name, isrc: s.isrc, activatedAt, status: "active" },
        }).catch(() => null);
        if (ms) {
          await prisma.labelMonitoredSong.create({
            data: { labelArtistId: la.id, monitoredSongId: ms.id },
          }).catch(() => {});
        }
      }
      console.log(`    ${art.name}: ${artistSongs.length} songs`);
    }
  }

  // ─── LABEL FREE = Global Records (all artists) ──────────────────
  const labelFree = u("label-free@mfm.test");
  console.log("  label-free (Global Records):");
  await setupLabel(labelFree.id, labelArtistDefs);

  // ─── LABEL PREMIUM = Global Records (all artists) ───────────────
  const labelPremium = u("label-premium@mfm.test");
  const labPremPlan = await prisma.plan.findFirst({ where: { role: "LABEL", tier: "PREMIUM", isActive: true } });
  if (labPremPlan) await prisma.subscription.create({ data: { userId: labelPremium.id, planId: labPremPlan.id, status: "active", billingInterval: "annual" } });
  console.log("  label-premium (Global Records):");
  await setupLabel(labelPremium.id, labelArtistDefs);

  // ─── STATION FREE = Virgin Radio ────────────────────────────────
  const stationFree = u("station-free@mfm.test");
  await prisma.userScope.create({ data: { userId: stationFree.id, entityType: "STATION", entityId: virginRadio!.id } });
  await prisma.watchedStation.create({ data: { userId: stationFree.id, stationId: kissFM!.id } });
  await prisma.userSettings.create({ data: { userId: stationFree.id, dailyReportTime: "08:00", dailyReportTimezone: "Europe/Bucharest" } });
  console.log("  station-free → Virgin Radio (watching Kiss FM)");

  // ─── STATION PREMIUM = Virgin Radio ─────────────────────────────
  const stationPremium = u("station-premium@mfm.test");
  await prisma.userScope.create({ data: { userId: stationPremium.id, entityType: "STATION", entityId: virginRadio!.id } });
  await prisma.watchedStation.create({ data: { userId: stationPremium.id, stationId: kissFM!.id } });
  const stPremPlan = await prisma.plan.findFirst({ where: { role: "STATION", tier: "PREMIUM", isActive: true } });
  if (stPremPlan) await prisma.subscription.create({ data: { userId: stationPremium.id, planId: stPremPlan.id, status: "active", billingInterval: "monthly" } });
  await prisma.userSettings.create({ data: { userId: stationPremium.id, dailyReportTime: "09:00", dailyReportTimezone: "Europe/Bucharest", chartAlertCountries: ["RO"] } });
  console.log("  station-premium → Virgin Radio (watching Kiss FM)");

  console.log("\n=== DONE ===\n");
  console.log("  ARTIST FREE/PREMIUM  → Vescan (all his songs from airplay)");
  console.log("  LABEL FREE/PREMIUM   → Global Records (12 Romanian artists)");
  console.log("  STATION FREE/PREMIUM → Virgin Radio (watching Kiss FM)");
  console.log("  Password: test1234");
}

main().catch(console.error).finally(() => prisma.$disconnect());
