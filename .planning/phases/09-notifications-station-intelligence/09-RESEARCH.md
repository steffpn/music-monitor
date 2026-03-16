# Phase 9: Notifications & Station Intelligence - Research

**Researched:** 2026-03-16
**Domain:** Push notifications (APNS), scheduled job processing (BullMQ cron), iOS notification lifecycle, competitor data aggregation (TimescaleDB)
**Confidence:** HIGH

## Summary

This phase adds two distinct feature sets: (1) periodic digest push notifications for all users and (2) competitor station monitoring for STATION-role users. The notification system requires a full push notification stack: iOS APNS registration and permission handling, server-side device token storage, BullMQ cron-scheduled digest computation jobs, and APNS delivery via HTTP/2. The station intelligence feature requires new API endpoints for competitor station selection and aggregated play data, plus corresponding iOS views.

The existing codebase already has BullMQ job scheduling infrastructure (cleanup worker, detection worker, snippet worker all use `upsertJobScheduler`), Redis connections, TimescaleDB continuous aggregate queries (dashboard handlers), role-based scope filtering, and the iOS MVVM + @Observable pattern. The primary new technology is `apns2` for APNS delivery and `UIApplicationDelegateAdaptor` for iOS push token registration.

**Primary recommendation:** Use `apns2` (v12.2.0) for APNS HTTP/2 delivery with token-based auth (.p8 key), BullMQ `upsertJobScheduler` with cron `pattern` + `tz: "Europe/Bucharest"` for digest scheduling, and a dedicated `digest-notifications` worker that computes stats from `daily_station_plays` continuous aggregate then sends via APNS.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Daily digest: play count + top song + top station -- e.g., "47 plays today. 'Melodia' was #1 with 15 plays, mostly on Kiss FM"
- Weekly digest: play count + week-over-week % change + top song + top station + new stations count -- e.g., "312 plays (+15%). 'Melodia' #1. 3 new stations played your music this week"
- Digests sent at 9 AM Romania time (EET/EEST)
- Daily digest sent every morning summarizing yesterday's stats
- Weekly digest sent Monday morning summarizing last week's stats
- Delivered via Apple Push Notification Service (APNS)
- Backend scheduled jobs (BullMQ) compute digest data and send push notifications
- Tapping a push notification opens a dedicated digest detail view in the app (not just the Dashboard)
- Digest detail view shows expanded stats beyond what fits in the notification
- Separate Notifications screen accessible from Settings (Settings > Notifications)
- Two toggles: "Daily Digest" on/off and "Weekly Digest" on/off
- No time-of-day picker -- fixed at 9 AM Romania time
- Default for new users: both daily and weekly enabled
- Preferences stored server-side (API endpoint for read/update)
- iOS push notification permission dialog prompted on first launch after registration
- If user denies, notification toggles in Settings still work (server-side prefs saved) but push won't be delivered until user enables in iOS Settings
- App should handle the denied-permission state gracefully (show a hint in Notifications settings if permission is denied)
- Station-role users only -- Artist/Label/Admin users do not see competitor features
- Accessible from Settings: Settings > "Competitor Stations" row (only visible to STATION role)
- Not a new tab -- keeps the 5-tab layout (Dashboard, Live, Detections, Search, Settings)
- User self-selects which stations to watch as competitors (browse all stations, pick up to 10-20)
- Manage watched list from within the competitor view itself (+ button to add, swipe to remove)
- Watched competitor list stored server-side per user
- Main screen: cards layout, each competitor station shown as a card with station name + today's play count + top song preview
- Tap a card to drill into station detail view
- Day | Week | Month segmented control (consistent with Dashboard pattern)
- Station detail view shows three sections: Top songs, Recent detections, Play count comparison

### Claude's Discretion
- APNS integration approach (direct APNS vs third-party service like Firebase Cloud Messaging)
- Push notification payload format and size optimization
- BullMQ cron schedule configuration for digest jobs
- Digest detail view layout and styling
- Competitor card design specifics
- Query optimization for competitor data aggregation
- Empty states (no competitors selected, no data for a competitor)
- Error handling for failed push delivery

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTF-01 | User receives daily digest push notification with summary stats | BullMQ cron at `0 9 * * *` tz Europe/Bucharest + apns2 APNS delivery + digest computation from daily_station_plays aggregate |
| NOTF-02 | User receives weekly digest push notification with summary stats | BullMQ cron at `0 9 * * 1` (Monday) tz Europe/Bucharest + week-over-week comparison query + apns2 delivery |
| NOTF-03 | User can configure notification preferences (daily/weekly/off) | New User model fields (dailyDigestEnabled, weeklyDigestEnabled) + preferences API endpoints + iOS Settings > Notifications screen |
| STIN-01 | Station-role user can view what competitor stations are playing | WatchedStation model + competitor API endpoints with TimescaleDB aggregate queries + iOS competitor cards view |
| STIN-02 | Station-role user can see top songs on competitor stations | Competitor station detail API with top-songs-by-station query + iOS station detail view with ranked list |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| apns2 | 12.2.0 | APNS HTTP/2 push delivery | Pure TypeScript, JWT token-based auth (.p8), maintained (May 2025 release), no native deps, clean async API |
| bullmq | 5.71.0 (existing) | Cron-scheduled digest jobs | Already in project, upsertJobScheduler supports cron pattern + tz option |
| cron-parser | 4.9.0 (existing, BullMQ dep) | Cron expression parsing with timezone | Used by BullMQ internally, confirms tz support via ParserOptions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | 5.4.0 (existing) | Redis connection for BullMQ | Queue and worker connections |
| pino | 10.3.0 (existing) | Structured logging for digest worker | Log digest computation and delivery results |
| @sinclair/typebox | 0.34.48 (existing) | Fastify route schema validation | New notification/competitor route schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| apns2 | @parse/node-apn | Parse fork is more feature-rich but heavier; apns2 is simpler, TypeScript-native, actively maintained |
| apns2 | node-apn (original) | Abandoned since 2019 (v3.0.0), seeking maintainers -- not suitable |
| apns2 | Firebase Cloud Messaging (FCM) | Adds Google dependency, requires Firebase SDK on iOS, unnecessary complexity for iOS-only app |
| Direct APNS | OneSignal/Pusher | Third-party service adds cost and vendor lock-in for a simple digest-only use case |

**Recommendation (Claude's Discretion):** Use `apns2` directly. The app is iOS-only, notifications are digest-only (not high-volume real-time), and apns2 provides clean TypeScript types with HTTP/2 and JWT auth. No need for FCM or third-party services.

**Installation:**
```bash
cd apps/api && pnpm add apns2
```

## Architecture Patterns

### Recommended Project Structure

**Backend additions:**
```
apps/api/src/
  workers/
    digest.ts                    # Digest computation + APNS delivery worker
  lib/
    apns.ts                      # ApnsClient singleton factory
  routes/v1/
    notifications/
      index.ts                   # Route registration
      schema.ts                  # TypeBox schemas
      handlers.ts                # GET/PUT notification preferences
    competitors/
      index.ts                   # Route registration
      schema.ts                  # TypeBox schemas
      handlers.ts                # Competitor CRUD + aggregation queries
```

**iOS additions:**
```
Apps/ios/myFuckingMusic/
  Services/
    NotificationManager.swift    # UNUserNotificationCenter + APNS token registration
  Views/
    Settings/
      NotificationsSettingsView.swift  # Two toggles + permission hint
    Notifications/
      DigestDetailView.swift           # Expanded digest stats on notification tap
    Competitors/
      CompetitorListView.swift         # Cards layout with competitor stations
      CompetitorDetailView.swift       # Station detail: top songs, recent, comparison
      CompetitorStationPickerView.swift # Browse + select competitor stations
  ViewModels/
    NotificationsViewModel.swift       # Preferences fetch/update
    CompetitorListViewModel.swift      # Competitor list + card data
    CompetitorDetailViewModel.swift    # Station detail data
  Models/
    NotificationModels.swift           # Digest, preferences response types
    CompetitorModels.swift             # Competitor card, detail response types
```

### Pattern 1: BullMQ Cron Digest Worker
**What:** A dedicated BullMQ worker queue for digest notification jobs, started from the supervisor alongside existing workers.
**When to use:** For scheduled background work that needs timezone-aware cron expressions.
**Example:**
```typescript
// Source: BullMQ docs + existing cleanup.ts pattern
import { Worker, Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis.js";

const DIGEST_QUEUE = "digest-notifications";

export async function startDigestWorker(): Promise<{
  queue: Queue;
  worker: Worker;
}> {
  const queue = new Queue(DIGEST_QUEUE, {
    connection: createRedisConnection(),
  });

  // Daily digest: 9 AM Romania time every day
  await queue.upsertJobScheduler(
    "daily-digest-scheduler",
    { pattern: "0 9 * * *", tz: "Europe/Bucharest" },
    { name: "daily-digest", data: {} },
  );

  // Weekly digest: 9 AM Romania time every Monday
  await queue.upsertJobScheduler(
    "weekly-digest-scheduler",
    { pattern: "0 9 * * 1", tz: "Europe/Bucharest" },
    { name: "weekly-digest", data: {} },
  );

  const worker = new Worker(
    DIGEST_QUEUE,
    async (job) => {
      if (job.name === "daily-digest") {
        await computeAndSendDailyDigest();
      } else if (job.name === "weekly-digest") {
        await computeAndSendWeeklyDigest();
      }
    },
    { connection: createRedisConnection() },
  );

  return { queue, worker };
}
```

### Pattern 2: APNS Client Singleton
**What:** Lazy-initialized ApnsClient configured from environment variables.
**When to use:** Any code that needs to send push notifications.
**Example:**
```typescript
// Source: apns2 README
import { ApnsClient } from "apns2";
import fs from "node:fs";
import pino from "pino";

const logger = pino({ name: "apns" });

let client: ApnsClient | null = null;

export function getApnsClient(): ApnsClient {
  if (!client) {
    const signingKey = process.env.APNS_SIGNING_KEY_PATH;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;

    if (!signingKey || !keyId || !teamId) {
      throw new Error("APNS not configured: missing APNS_SIGNING_KEY_PATH, APNS_KEY_ID, or APNS_TEAM_ID");
    }

    client = new ApnsClient({
      team: teamId,
      keyId: keyId,
      signingKey: fs.readFileSync(signingKey),
      defaultTopic: process.env.APNS_BUNDLE_ID || "com.myfuckingmusic.app",
      host: process.env.APNS_HOST || "api.push.apple.com",
    });

    // Handle bad device tokens -- remove from DB
    client.on("error", (err) => {
      logger.error({ err }, "APNS error");
    });
  }
  return client;
}
```

### Pattern 3: iOS Push Token Registration with UIApplicationDelegateAdaptor
**What:** SwiftUI app lifecycle integration for remote notification registration.
**When to use:** To register for APNS and capture the device token.
**Example:**
```swift
// Source: Apple Developer docs + nilcoalescing.com guide
import UIKit
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.reduce("") { $0 + String(format: "%02x", $1) }
        // Send token to backend
        Task {
            try? await APIClient.shared.request(
                .registerDeviceToken(token: token)
            ) as EmptyResponse
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register for remote notifications: \(error)")
    }
}

// In myFuckingMusicApp.swift:
@main
struct myFuckingMusicApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    // ... existing code
}
```

### Pattern 4: Notification Tap Deep Linking
**What:** Handle notification taps to navigate to digest detail view.
**When to use:** When user taps a push notification outside the app.
**Example:**
```swift
// Source: Apple Developer docs
extension AppDelegate: UNUserNotificationCenterDelegate {
    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        if let type = userInfo["type"] as? String,
           type == "daily_digest" || type == "weekly_digest" {
            // Post notification to navigate to digest detail
            NotificationCenter.default.post(
                name: .digestNotificationTapped,
                object: nil,
                userInfo: userInfo
            )
        }
    }

    // Show notification even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]
    }
}
```

### Pattern 5: Competitor Data Aggregation Queries
**What:** TimescaleDB queries against daily_station_plays for competitor station analysis.
**When to use:** Competitor API endpoints that need aggregated play data per station.
**Example:**
```typescript
// Source: Existing dashboard/handlers.ts pattern
// Top songs on a competitor station for a period
const topSongs = await prisma.$queryRaw`
  SELECT
    ae.song_title,
    ae.artist_name,
    ae.isrc,
    COUNT(*)::int AS play_count
  FROM airplay_events ae
  WHERE ae.station_id = ${stationId}
    AND ae.started_at >= NOW() - ${days + " days"}::interval
  GROUP BY ae.song_title, ae.artist_name, ae.isrc
  ORDER BY play_count DESC
  LIMIT ${limit}
`;
```

### Anti-Patterns to Avoid
- **Sending push notifications synchronously in the API request path:** Digest computation and APNS delivery must happen in background BullMQ jobs, never in HTTP request handlers.
- **Storing device tokens in Redis:** Device tokens are persistent user data -- store in PostgreSQL, not ephemeral Redis.
- **Using legacy APNS certificate-based auth:** Use token-based auth (.p8 key) exclusively. Certificate auth requires annual renewal and is deprecated for new integrations.
- **Hardcoding timezone offset instead of using IANA timezone:** Romania observes EET (UTC+2) in winter and EEST (UTC+3) in summer. Use `"Europe/Bucharest"` IANA timezone, never a fixed UTC offset.
- **Computing digests by iterating detections table directly:** Use the existing `daily_station_plays` continuous aggregate for performance. Querying raw detections for 200+ stations would be extremely slow.
- **Per-user cron jobs:** Do NOT create separate BullMQ schedulers per user. Run one daily and one weekly cron job that iterates all eligible users within a single job execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| APNS HTTP/2 connection | Custom HTTP/2 client with JWT signing | `apns2` library | JWT token rotation, connection pooling, error classification, retry logic |
| Cron scheduling with timezone | Custom setTimeout/setInterval with manual timezone math | BullMQ `upsertJobScheduler` with `tz` option | DST transitions, missed job recovery, distributed locking |
| Device token hex encoding | Manual byte-to-hex conversion | Standard `reduce` pattern (shown above) | Off-by-one errors, endianness issues |
| Push permission status checking | Manual UIApplication settings URL | `UNUserNotificationCenter.current().notificationSettings()` | Apple's API handles all edge cases |
| Week-over-week percentage calculation | Custom date arithmetic | SQL window functions or two-query comparison | Timezone-aware week boundaries, edge cases at month/year boundaries |

**Key insight:** APNS has many subtle failure modes (token invalidation, HTTP/2 stream errors, rate limiting, payload size limits). The `apns2` library handles all of these. Similarly, timezone-aware cron scheduling with DST transitions is deceptively complex -- BullMQ + cron-parser handles it correctly.

## Common Pitfalls

### Pitfall 1: APNS Token Invalidation
**What goes wrong:** Device tokens become invalid when users uninstall the app, disable notifications, or get a new device. Sending to invalid tokens wastes resources and Apple may throttle your provider.
**Why it happens:** APNS tokens are device+app specific and Apple rotates them.
**How to avoid:** Listen for `badDeviceToken` errors from apns2 and delete the token from the database. Run periodic cleanup of tokens that consistently fail.
**Warning signs:** Increasing APNS error rates, "Unregistered" responses from Apple.

### Pitfall 2: APNS Sandbox vs Production
**What goes wrong:** Notifications work in development but fail in production (or vice versa).
**Why it happens:** APNS has separate sandbox (`api.sandbox.push.apple.com`) and production (`api.push.apple.com`) endpoints. Tokens generated in sandbox are NOT valid in production and vice versa.
**How to avoid:** Store a `tokenEnvironment` field alongside the device token ("sandbox" or "production"). Configure the APNS client host via environment variable. The iOS app knows its environment at build time.
**Warning signs:** All sends fail with "BadDeviceToken" after deploying to TestFlight/App Store.

### Pitfall 3: Timezone DST Transitions
**What goes wrong:** Digest arrives at 8 AM or 10 AM instead of 9 AM during DST transitions.
**Why it happens:** Romania switches between EET (UTC+2) and EEST (UTC+3). If you use a fixed UTC offset instead of IANA timezone, the cron fires at the wrong local time.
**How to avoid:** Always use `tz: "Europe/Bucharest"` (IANA name), never `tz: "UTC+2"` or `tz: "EET"`. BullMQ + cron-parser handles DST correctly with IANA timezones.
**Warning signs:** User complaints arriving exactly during DST transition weekends (last Sunday of March, last Sunday of October in Romania).

### Pitfall 4: Push Notification Payload Size
**What goes wrong:** Notifications silently fail or get truncated.
**Why it happens:** APNS payload max is 4KB (4096 bytes). The digest text plus custom data keys can exceed this if not careful.
**How to avoid:** Keep the notification alert text concise (the locked decision formats are well within limits). Put minimal data in the push payload -- just enough for deep linking (type, date range). Load full digest data from API when the digest detail view opens.
**Warning signs:** Notifications not arriving for users with long song titles or station names.

### Pitfall 5: iOS Notification Permission Timing
**What goes wrong:** Permission dialog shows before user understands the app, leading to denial.
**Why it happens:** Requesting permission too early (e.g., app launch) when user hasn't seen the value yet.
**How to avoid:** Per user decision, request permission on first launch after registration. At that point the user has committed to the app. If denied, show a non-intrusive hint in the Notifications settings screen explaining how to enable in iOS Settings.
**Warning signs:** Low notification permission grant rate.

### Pitfall 6: Competitor Query Performance
**What goes wrong:** Competitor view is slow because it queries play data for multiple stations.
**Why it happens:** Querying airplay_events for 10-20 competitor stations across a month can be expensive.
**How to avoid:** Use the existing `daily_station_plays` continuous aggregate for card-level summary data (play count per station per day). Only query `airplay_events` directly for the station detail drill-down (limited to one station + limited result set). Consider adding an index on `(song_title, station_id, started_at)` if top-songs queries are slow.
**Warning signs:** Competitor card list taking >2s to load.

## Code Examples

### Digest Computation Query (Daily)
```typescript
// Source: Existing dashboard/handlers.ts pattern adapted for digest
// Compute yesterday's stats for a user (scoped by their stations)
async function computeDailyDigest(stationIds: number[]): Promise<{
  playCount: number;
  topSong: { title: string; artist: string; count: number } | null;
  topStation: { name: string; count: number } | null;
}> {
  // Total plays yesterday
  const [totals] = await prisma.$queryRaw<Array<{ play_count: number }>>`
    SELECT COALESCE(SUM(play_count), 0)::int AS play_count
    FROM daily_station_plays
    WHERE bucket = CURRENT_DATE - INTERVAL '1 day'
      AND station_id IN (${Prisma.join(stationIds)})
  `;

  // Top song yesterday
  const topSongs = await prisma.$queryRaw<Array<{
    song_title: string; artist_name: string; count: number;
  }>>`
    SELECT song_title, artist_name, COUNT(*)::int AS count
    FROM airplay_events
    WHERE station_id IN (${Prisma.join(stationIds)})
      AND started_at >= CURRENT_DATE - INTERVAL '1 day'
      AND started_at < CURRENT_DATE
    GROUP BY song_title, artist_name
    ORDER BY count DESC
    LIMIT 1
  `;

  // Top station yesterday
  const topStations = await prisma.$queryRaw<Array<{
    station_name: string; count: number;
  }>>`
    SELECT s.name AS station_name, SUM(d.play_count)::int AS count
    FROM daily_station_plays d
    JOIN stations s ON s.id = d.station_id
    WHERE d.bucket = CURRENT_DATE - INTERVAL '1 day'
      AND d.station_id IN (${Prisma.join(stationIds)})
    GROUP BY s.name
    ORDER BY count DESC
    LIMIT 1
  `;

  return {
    playCount: totals?.play_count ?? 0,
    topSong: topSongs[0] ? {
      title: topSongs[0].song_title,
      artist: topSongs[0].artist_name,
      count: topSongs[0].count,
    } : null,
    topStation: topStations[0] ? {
      name: topStations[0].station_name,
      count: topStations[0].count,
    } : null,
  };
}
```

### APNS Notification Payload
```typescript
// Source: apns2 README + Apple APNS docs
import { Notification } from "apns2";

function buildDailyDigestNotification(
  deviceToken: string,
  digest: { playCount: number; topSong: { title: string } | null; topStation: { name: string } | null },
): Notification {
  const body = digest.topSong && digest.topStation
    ? `${digest.playCount} plays today. '${digest.topSong.title}' was #1, mostly on ${digest.topStation.name}`
    : `${digest.playCount} plays today.`;

  return new Notification(deviceToken, {
    alert: {
      title: "Daily Airplay Digest",
      body,
    },
    badge: 0,
    data: {
      type: "daily_digest",
      date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    },
  });
}
```

### iOS Notification Preferences Toggle View
```swift
// Source: SwiftUI iOS 17+ patterns from existing codebase
struct NotificationsSettingsView: View {
    @State private var viewModel = NotificationsViewModel()

    var body: some View {
        List {
            Section {
                Toggle("Daily Digest", isOn: $viewModel.dailyDigestEnabled)
                    .onChange(of: viewModel.dailyDigestEnabled) {
                        Task { await viewModel.updatePreferences() }
                    }
                Toggle("Weekly Digest", isOn: $viewModel.weeklyDigestEnabled)
                    .onChange(of: viewModel.weeklyDigestEnabled) {
                        Task { await viewModel.updatePreferences() }
                    }
            } header: {
                Text("Notifications")
            } footer: {
                Text("Digests are sent at 9:00 AM Romania time.")
            }

            if viewModel.pushPermissionDenied {
                Section {
                    Label {
                        Text("Push notifications are disabled. Enable them in iOS Settings to receive digests.")
                    } icon: {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
        .navigationTitle("Notifications")
        .task { await viewModel.loadPreferences() }
    }
}
```

### Prisma Schema Additions
```prisma
// New models for device tokens, notification preferences, and competitor watching

model DeviceToken {
  id          Int      @id @default(autoincrement())
  userId      Int      @map("user_id")
  token       String   @unique
  environment String   @default("production") // "sandbox" or "production"
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("device_tokens")
}

model WatchedStation {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  stationId  Int      @map("station_id")
  createdAt  DateTime @default(now()) @map("created_at")

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  station    Station  @relation(fields: [stationId], references: [id])

  @@unique([userId, stationId])
  @@index([userId])
  @@map("watched_stations")
}

// Add to existing User model:
// dailyDigestEnabled  Boolean @default(true) @map("daily_digest_enabled")
// weeklyDigestEnabled Boolean @default(true) @map("weekly_digest_enabled")
// deviceTokens        DeviceToken[]
// watchedStations     WatchedStation[]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-apn (certificate auth) | apns2 (JWT token auth, HTTP/2) | 2020+ | No annual cert renewal, simpler setup |
| BullMQ repeatable jobs API | BullMQ upsertJobScheduler API | BullMQ v5.16+ | Idempotent scheduling, no duplicate jobs on restart |
| ObservableObject + @Published | @Observable macro | iOS 17 / 2023 | Project already uses @Observable exclusively |
| AppDelegate lifecycle | SwiftUI App protocol + UIApplicationDelegateAdaptor | iOS 14+ | Allows mixing SwiftUI lifecycle with UIKit delegate methods |

**Deprecated/outdated:**
- `node-apn` v3.0.0: Last updated Sep 2019, seeking maintainers -- do not use
- BullMQ `add()` with `repeat` option: Deprecated in favor of `upsertJobScheduler()` -- project already uses the new API
- APNS certificate-based authentication: Still works but token-based (.p8) is preferred by Apple

## Open Questions

1. **Apple Developer Account APNS Key Setup**
   - What we know: Need a .p8 key from Apple Developer portal with APNS capability enabled
   - What's unclear: Whether the project owner has already generated the .p8 key and configured the app's bundle ID for push notifications
   - Recommendation: Implementation should document the Apple Developer setup steps. Code should fail gracefully if APNS env vars are not configured (digest computation still runs, just skips push delivery).

2. **Digest Detail View Data Source**
   - What we know: Tapping notification opens a digest detail view with expanded stats
   - What's unclear: Whether to compute and cache digest data server-side (retrievable via API) or compute it client-side from existing dashboard endpoints
   - Recommendation: Add a dedicated `GET /notifications/digest/:date` endpoint that returns pre-computed digest data. This is simpler than trying to reconstruct the exact same data the notification showed from dashboard endpoints.

3. **Device Token Lifecycle at Scale**
   - What we know: Users can have multiple devices, tokens can become invalid
   - What's unclear: Whether a user will realistically use multiple iOS devices
   - Recommendation: Support multiple tokens per user (one per device) but clean up stale tokens on APNS error response. The data model supports this.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.0.0 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test -- --grep "digest\|notification\|competitor"` |
| Full suite command | `cd apps/api && pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTF-01 | Daily digest computation produces correct stats | unit | `cd apps/api && pnpm test -- tests/workers/digest.test.ts -x` | Wave 0 |
| NOTF-02 | Weekly digest computation with week-over-week % | unit | `cd apps/api && pnpm test -- tests/workers/digest.test.ts -x` | Wave 0 |
| NOTF-03 | Notification preferences GET/PUT endpoints | integration | `cd apps/api && pnpm test -- tests/routes/notifications.test.ts -x` | Wave 0 |
| STIN-01 | Competitor watched station CRUD + listing | integration | `cd apps/api && pnpm test -- tests/routes/competitors.test.ts -x` | Wave 0 |
| STIN-02 | Top songs on competitor station aggregation | integration | `cd apps/api && pnpm test -- tests/routes/competitors.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test -- --grep "digest\|notification\|competitor" -x`
- **Per wave merge:** `cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/workers/digest.test.ts` -- covers NOTF-01, NOTF-02 (digest computation logic)
- [ ] `tests/routes/notifications.test.ts` -- covers NOTF-03 (preferences endpoints + device token registration)
- [ ] `tests/routes/competitors.test.ts` -- covers STIN-01, STIN-02 (competitor CRUD + aggregation)
- [ ] Framework install: `cd apps/api && pnpm add apns2` -- new dependency

## Sources

### Primary (HIGH confidence)
- BullMQ v5.71.0 TypeScript definitions in project node_modules -- confirmed `tz?: string` in RepeatOptions via cron-parser ParserOptions
- BullMQ official docs (https://docs.bullmq.io/guide/job-schedulers) -- upsertJobScheduler API with cron pattern support
- apns2 GitHub (https://github.com/AndrewBarba/apns2) -- v12.2.0, TypeScript, HTTP/2, JWT auth, maintained May 2025
- Apple Developer docs -- APNS payload structure, 4KB max, alert/badge/data format
- Existing codebase: cleanup.ts, detection.ts, snippet.ts, supervisor/index.ts -- established BullMQ worker patterns
- Existing codebase: dashboard/handlers.ts -- TimescaleDB continuous aggregate query patterns
- Existing codebase: AuthManager.swift, APIClient.swift, DashboardViewModel.swift -- iOS architecture patterns

### Secondary (MEDIUM confidence)
- nilcoalescing.com iOS push setup guide -- UIApplicationDelegateAdaptor pattern with SwiftUI, verified against Apple forums
- Apple Developer Forums thread 650534 -- Confirmation that SwiftUI App protocol requires UIApplicationDelegateAdaptor for push
- BullMQ repeat strategies docs -- cron-parser timezone handling, DST support

### Tertiary (LOW confidence)
- apns2 npm page -- Last publish date "9 months ago" at time of search (consistent with May 2025 v12.2.0)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- apns2 verified on GitHub/npm, BullMQ tz option verified in local TypeScript definitions
- Architecture: HIGH -- All patterns follow existing codebase conventions (MVVM, Fastify plugins, BullMQ workers)
- Pitfalls: HIGH -- APNS failure modes well-documented by Apple, timezone issues verified via cron-parser source
- Competitor queries: MEDIUM -- Query patterns follow existing dashboard handlers but performance at scale with 10-20 competitor stations needs validation

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (30 days -- stable technologies, no fast-moving changes expected)
