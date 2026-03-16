---
phase: 09-notifications-station-intelligence
verified: 2026-03-17T00:00:00Z
status: human_needed
score: 20/20 must-haves verified
re_verification: false
human_verification:
  - test: "Receive daily and weekly push notifications"
    expected: "After APNS credentials are configured, digest notifications arrive at 9AM Romania time with the correct body format"
    why_human: "Requires real device, APNS .p8 credentials, and a 24h wait for the cron job to fire"
  - test: "Tapping a push notification deep-links to DigestDetailView"
    expected: "Tapping a delivered digest notification opens the app and presents DigestDetailView with matching type/date"
    why_human: "APNS delivery and tap routing cannot be exercised in Simulator without real push certificates"
  - test: "Notification permission prompt on first launch after registration"
    expected: "After logging in on a fresh install, iOS presents the standard permission dialog"
    why_human: "Permission prompt only fires once per install; cannot reliably test programmatically"
  - test: "Toggle persistence in NotificationsSettingsView"
    expected: "Toggling Daily Digest off, navigating away, and returning shows the preference still off"
    why_human: "Round-trip persistence via API requires a running backend and cannot be verified statically"
  - test: "Competitor station picker shows STATION-role restriction in Settings"
    expected: "STATION-role user sees 'Competitor Stations' row; ARTIST-role user does not"
    why_human: "Role-gating in SwiftUI conditionals requires runtime auth state to exercise both branches"
  - test: "CompetitorDetailView day/week/month period switching reloads data"
    expected: "Changing the segmented control causes a new API call with the updated period parameter"
    why_human: ".task(id:) reactive reload behavior requires a running app and backend to observe"
---

# Phase 9: Notifications & Station Intelligence Verification Report

**Phase Goal:** Digest push notifications and competitor station views
**Verified:** 2026-03-17
**Status:** human_needed — all automated checks pass; 6 items require runtime/device verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 01 (Backend Notification System — NOTF-01, NOTF-02, NOTF-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Daily digest job computes yesterday's play count, top song, and top station per user scope | VERIFIED | `computeDailyDigest()` in digest.ts queries `daily_station_plays` for `CURRENT_DATE - INTERVAL '1 day'` and `airplay_events` for top song/station; returns typed `DailyDigest` struct |
| 2 | Weekly digest job computes last week's stats with week-over-week % change, top song, top station, new stations count | VERIFIED | `computeWeeklyDigest()` queries 7-day and 14-day windows; calculates `weekOverWeekChange` with correct 100% edge case for zero-to-plays; `newStationsCount` via NOT IN subquery |
| 3 | Digest jobs iterate all eligible users and send APNS push notifications | VERIFIED | `processDailyDigests()` and `processWeeklyDigests()` both: find users with `isActive=true` and the respective flag, loop device tokens, call `apns.send()`, delete `BadDeviceToken`/`Unregistered` tokens |
| 4 | User can read and update their notification preferences (daily/weekly toggles) | VERIFIED | `getNotificationPreferences` returns `dailyDigestEnabled`/`weeklyDigestEnabled` from DB; `updateNotificationPreferences` does partial update; routes registered at `/api/v1/notifications/preferences` |
| 5 | Device tokens are stored per user and cleaned up on APNS error | VERIFIED | `registerDeviceToken` uses `prisma.deviceToken.upsert`; error handler in digest worker deletes token on `BadDeviceToken` or `Unregistered` |

#### Plan 02 (Backend Competitor Intelligence — STIN-01, STIN-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Station-role user can add and remove competitor stations (up to 20) | VERIFIED | `addWatchedStation` enforces max-20 check, own-station guard, P2002 catch for duplicates; `removeWatchedStation` deletes and returns 404 if not found |
| 7 | Station-role user can view a summary card for each watched competitor (play count + top song for period) | VERIFIED | `getCompetitorSummary` queries `airplay_events` and uses DISTINCT ON subquery for top song per station; returns array of cards with `playCount` and `topSong` |
| 8 | Station-role user can drill into a competitor to see top songs ranked by play count | VERIFIED | `getCompetitorDetail` queries `airplay_events GROUP BY song_title ORDER BY play_count DESC LIMIT 20` |
| 9 | Station-role user can see recent detections on a competitor station | VERIFIED | `getCompetitorDetail` returns `recentDetections` from `airplay_events ORDER BY started_at DESC LIMIT 50` |
| 10 | Station-role user can see play count comparison for overlapping songs | VERIFIED | `getCompetitorDetail` uses conditional SUM CASE query with HAVING clause to find overlapping songs between competitor and own stations |
| 11 | Non-STATION roles are rejected from competitor endpoints | VERIFIED | `competitors/index.ts` applies `fastify.addHook("preHandler", requireRole("STATION"))` at plugin level — affects all five routes |

#### Plan 03 (iOS Notification UI — NOTF-01, NOTF-02, NOTF-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 12 | App requests push notification permission on first launch after registration | VERIFIED (human confirm) | `myFuckingMusicApp.swift` calls `notificationManager.requestPermissionIfNeeded()` when `authManager.isAuthenticated`; `NotificationManager.requestPermissionIfNeeded()` checks `.notDetermined` before prompting |
| 13 | Device token is sent to backend API after successful APNS registration | VERIFIED | `AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken` hex-encodes token and fires `APIClient.shared.request(.registerDeviceToken(...))` in a Task |
| 14 | User can navigate to Settings > Notifications and toggle daily/weekly digests | VERIFIED | `SettingsView` has `NavigationLink { NotificationsSettingsView() }` with bell icon; `NotificationsSettingsView` contains two `Toggle` controls |
| 15 | Toggling a preference immediately syncs with the backend API | VERIFIED | Both toggles have `.onChange` calling `Task { await viewModel.updatePreferences() }`; `NotificationsViewModel.updatePreferences()` fires PUT to `/notifications/preferences` |
| 16 | If push permission is denied, a hint is shown in Notifications settings | VERIFIED | `NotificationsSettingsView` has `if notificationManager.pushPermissionDenied` section with exclamationmark.triangle icon and descriptive text |
| 17 | Tapping a push notification opens DigestDetailView with expanded stats | VERIFIED (human confirm) | `AppDelegate` posts `.digestNotificationTapped`; `myFuckingMusicApp` listens via `.onReceive` and presents `DigestDetailView` as a sheet |
| 18 | DigestDetailView loads data from backend and displays formatted stats | VERIFIED | `loadDigest()` calls `APIClient.shared.request(.digestDetail(...))` and sets `digest` state; view renders hero play count, top song card, top station card, week-over-week badge, new stations count |

#### Plan 04 (iOS Competitor Views — STIN-01, STIN-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 19 | Station-role user sees 'Competitor Stations' row in Settings; non-STATION users do not | VERIFIED (human confirm) | `SettingsView` has `if authManager.currentUser?.role.uppercased() == "STATION"` guard around `NavigationLink { CompetitorListView() }` |
| 20 | User can add/remove competitor stations; list shows cards with play count and top song; tapping opens detail with top songs, recent detections, and play comparison; Day/Week/Month control changes period | VERIFIED | `CompetitorListView` has swipe-to-delete, `+` toolbar button, `CompetitorCardView` renders name/play count/top song, `NavigationLink` to `CompetitorDetailView`; detail view has segmented picker with `.task(id: viewModel.selectedPeriod)` reload; all three sections (topSongs, recentDetections, comparison) rendered |

**Score: 20/20 truths verified**

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `apps/api/prisma/schema.prisma` | — | — | VERIFIED | `model DeviceToken` at line 112; `dailyDigestEnabled`/`weeklyDigestEnabled` at lines 97-98; `model WatchedStation` at line 189 |
| `apps/api/src/lib/apns.ts` | — | 71 | VERIFIED | Exports `getApnsClient()`, lazy singleton, returns null with log when env vars missing |
| `apps/api/src/workers/digest.ts` | — | 455 | VERIFIED | Exports `startDigestWorker`, `computeDailyDigest`, `computeWeeklyDigest`, `processDailyDigests`, `processWeeklyDigests` |
| `apps/api/src/routes/v1/notifications/handlers.ts` | — | 105 | VERIFIED | Exports `getNotificationPreferences`, `updateNotificationPreferences`, `registerDeviceToken`, `deleteDeviceToken` |
| `apps/api/tests/workers/digest.test.ts` | 50 | 277 | VERIFIED | 277 lines, well above minimum |
| `apps/api/tests/routes/notifications.test.ts` | 50 | 296 | VERIFIED | 296 lines, well above minimum |

### Plan 02 Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `apps/api/prisma/schema.prisma` | — | — | VERIFIED | `model WatchedStation` with `@@unique([userId, stationId])` constraint |
| `apps/api/src/routes/v1/competitors/handlers.ts` | — | 336 | VERIFIED | Exports all 5 handlers: `getWatchedStations`, `addWatchedStation`, `removeWatchedStation`, `getCompetitorSummary`, `getCompetitorDetail` |
| `apps/api/tests/routes/competitors.test.ts` | 80 | 440 | VERIFIED | 440 lines, well above minimum |

### Plan 03 Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `apps/ios/myFuckingMusic/App/AppDelegate.swift` | 30 | 88 | VERIFIED | Full APNS delegate with token registration, tap handling, foreground presentation |
| `apps/ios/myFuckingMusic/Services/NotificationManager.swift` | 20 | 66 | VERIFIED | @Observable permission manager with `requestPermission`, `checkPermissionStatus`, `requestPermissionIfNeeded` |
| `apps/ios/myFuckingMusic/Views/Settings/NotificationsSettingsView.swift` | 30 | 65 | VERIFIED | Two toggles, permission denied hint, footer text, `.task` lifecycle |
| `apps/ios/myFuckingMusic/Views/Notifications/DigestDetailView.swift` | 40 | 182 | VERIFIED | Hero stat, top song card, top station card, weekly change/new stations, error/loading states |
| `apps/ios/myFuckingMusic/ViewModels/NotificationsViewModel.swift` | 30 | 49 | VERIFIED | `loadPreferences()` and `updatePreferences()` with revert on error |

### Plan 04 Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `apps/ios/myFuckingMusic/Views/Competitors/CompetitorListView.swift` | 50 | 147 | VERIFIED | Cards, segmented period picker, swipe-to-delete, empty state, station picker sheet |
| `apps/ios/myFuckingMusic/Views/Competitors/CompetitorDetailView.swift` | 60 | 245 | VERIFIED | Three sections (top songs, recent detections, comparison), period picker, color-coded comparison |
| `apps/ios/myFuckingMusic/Views/Competitors/CompetitorStationPickerView.swift` | 30 | 133 | VERIFIED | Searchable list, already-watched checkmarks, add-on-tap with error handling |
| `apps/ios/myFuckingMusic/ViewModels/CompetitorListViewModel.swift` | 40 | 87 | VERIFIED | `loadSummary`, `loadWatchedStations`, `addStation`, `removeStation` all call real APIClient |
| `apps/ios/myFuckingMusic/ViewModels/CompetitorDetailViewModel.swift` | 30 | 56 | VERIFIED | `loadDetail()` calls `APIClient.shared.request(.competitorDetail(...))` |
| `apps/ios/myFuckingMusic/Models/CompetitorModels.swift` | 20 | 79 | VERIFIED | All 7 model types: `WatchedStation`, `CompetitorCard`, `CompetitorTopSong`, `CompetitorDetail`, `CompetitorSong`, `CompetitorDetection`, `CompetitorComparison`, `AddWatchedStationRequest` |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `digest.ts` | `apns.ts` | `getApnsClient()` for push delivery | WIRED | Line 16: `import { getApnsClient } from "../lib/apns.js"`; called at line 302 in `processDailyDigests` and line 354 in `processWeeklyDigests` |
| `digest.ts` | prisma | `daily_station_plays` raw queries | WIRED | Lines 50, 61, 83, 114, 126, 148, 169, 192: `prisma.$queryRaw` against `daily_station_plays` and `airplay_events` |
| `supervisor/index.ts` | `digest.ts` | `startDigestWorker()` in lifecycle | WIRED | Line 21: `import { startDigestWorker } from "../../workers/digest.js"`; line 100-101: `const { queue: digestQueue, worker: digestWorker } = await startDigestWorker()`; shutdown at lines 199-200 |

### Plan 02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `competitors/handlers.ts` | prisma | `WatchedStation` CRUD + aggregate queries | WIRED | `prisma.watchedStation.findMany/create/deleteMany/count/findFirst` throughout; `prisma.$queryRaw` at lines 162, 175, 249, 271, 295 |
| `competitors/index.ts` | `middleware/auth.ts` | `authenticate` + `requireRole('STATION')` | WIRED | Lines 19-20: `fastify.addHook("preHandler", authenticate)` and `fastify.addHook("preHandler", requireRole("STATION"))` |

### Plan 03 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `AppDelegate.swift` | `APIClient.swift` | POST device token | WIRED | Line 34: `APIClient.shared.request(.registerDeviceToken(token: hexToken, environment: environment))` |
| `NotificationsSettingsView.swift` | `NotificationsViewModel.swift` | Toggle bindings calling `updatePreferences()` | WIRED | Lines 17, 22: `.onChange { Task { await viewModel.updatePreferences() } }` |
| `SettingsView.swift` | `NotificationsSettingsView.swift` | NavigationLink in Settings list | WIRED | Lines 42-46: `NavigationLink { NotificationsSettingsView() } label: { Label("Notifications", systemImage: "bell") }` |

### Plan 04 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `SettingsView.swift` | `CompetitorListView.swift` | NavigationLink (STATION role only) | WIRED | Lines 48-54: `if authManager.currentUser?.role.uppercased() == "STATION"` guard wraps `NavigationLink { CompetitorListView() }` |
| `CompetitorListViewModel.swift` | `APIClient.swift` | GET `/competitors/summary` and `/competitors/watched` | WIRED | `loadSummary()` calls `.competitorSummary(period:)`; `loadWatchedStations()` calls `.watchedStations` |
| `CompetitorListView.swift` | `CompetitorDetailView.swift` | NavigationLink on card tap | WIRED | Lines 36-43: `NavigationLink { CompetitorDetailView(stationId: card.stationId, stationName: card.stationName) }` |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| NOTF-01 | 09-01, 09-03 | User receives daily digest push notification with summary stats | SATISFIED | Digest worker fires daily at 9AM; `computeDailyDigest` + `buildDailyDigestNotification` produce the payload; iOS `AppDelegate` receives and routes notification tap; `DigestDetailView` displays stats |
| NOTF-02 | 09-01, 09-03 | User receives weekly digest push notification with summary stats | SATISFIED | `computeWeeklyDigest` computes 7-day stats with week-over-week %; `buildWeeklyDigestNotification` produces locked format body; `DigestDetailView` shows weekly-specific fields |
| NOTF-03 | 09-01, 09-03 | User can configure notification preferences (daily/weekly/off) | SATISFIED | Backend GET/PUT `/notifications/preferences` with `dailyDigestEnabled`/`weeklyDigestEnabled` booleans; iOS `NotificationsSettingsView` provides the toggles and syncs with backend on every change |
| STIN-01 | 09-02, 09-04 | Station-role user can view what competitor stations are playing | SATISFIED | `getCompetitorSummary` returns play count cards; `getCompetitorDetail` returns `recentDetections`; `CompetitorListView` and `CompetitorDetailView` render this data for STATION-role users |
| STIN-02 | 09-02, 09-04 | Station-role user can see top songs on competitor stations | SATISFIED | `getCompetitorDetail` returns `topSongs` ranked by play count (LIMIT 20); `CompetitorDetailView.topSongsSection` renders numbered list with play count badge; comparison section shows overlap |

All 5 requirements (NOTF-01, NOTF-02, NOTF-03, STIN-01, STIN-02) are satisfied.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/lib/apns.ts` | 46, 55 | `return null` | Info | Intentional graceful degradation — returns null when env vars are missing, not a stub. Logged with warning. |

No blockers or warnings found. The two `return null` instances in `apns.ts` are documented design decisions (graceful degradation without APNS credentials).

---

## Human Verification Required

### 1. Live push notification delivery (NOTF-01, NOTF-02)

**Test:** Configure APNS credentials (`APNS_SIGNING_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_HOST`) on the API server. Register a real iOS device. Wait for the daily-digest cron at 9:00 AM Romania time, or manually enqueue a `daily-digest` job in the BullMQ queue.

**Expected:** A push notification arrives on the device with title "Daily Airplay Digest" and body matching the locked format: "X plays today. 'Song' was #1 with Y plays, mostly on Station"

**Why human:** Requires a real iOS device, valid APNS .p8 credentials, and cron execution at a specific time. Not testable in Simulator or statically.

### 2. Push notification tap deep-links to DigestDetailView (NOTF-01, NOTF-02)

**Test:** With APNS delivering notifications, tap a delivered digest push on a real device.

**Expected:** App opens and presents a sheet containing `DigestDetailView` showing the correct type (daily/weekly) and date, with play count, top song, top station, and (for weekly) week-over-week stats populated from the backend.

**Why human:** Deep link routing via `NotificationCenter.default` post from `AppDelegate` cannot be exercised without an actual delivered push notification on a real device.

### 3. Push permission dialog on first post-registration launch (NOTF-03)

**Test:** Delete the app, reinstall, log in with a valid account.

**Expected:** iOS presents the standard "Allow 'myFuckingMusic' to send you notifications?" permission dialog shortly after login completes.

**Why human:** Permission dialog state is per-install and only fires once. Cannot reliably simulate in Simulator. The code path (`requestPermissionIfNeeded` → `requestPermission`) is statically verified; the dialog appearance requires runtime exercise.

### 4. Toggle preference persistence across navigation (NOTF-03)

**Test:** Log in, navigate to Settings > Notifications, toggle "Daily Digest" off, navigate back to Settings, then re-enter Notifications.

**Expected:** "Daily Digest" toggle remains off. Verify via GET `/api/v1/notifications/preferences` that `dailyDigestEnabled` is `false` in the backend.

**Why human:** Round-trip preference sync requires a live backend and UI session to confirm the PUT was persisted and the subsequent GET returns the updated value.

### 5. Competitor Stations row shows only for STATION role (STIN-01)

**Test:** Log in with a STATION-role user — verify "Competitor Stations" row appears in Settings App section. Then log in with an ARTIST-role user — verify "Competitor Stations" row is absent.

**Expected:** Row visible for STATION role; invisible for all other roles.

**Why human:** Requires two test accounts with different roles in a running app instance.

### 6. Day/Week/Month segmented control refreshes competitor data (STIN-01, STIN-02)

**Test:** Open `CompetitorDetailView` for a watched competitor, change the segmented control from "Today" to "This Week".

**Expected:** A new API call fires to `GET /competitors/:stationId/detail?period=week` and the top songs, recent detections, and comparison sections update to reflect the new period.

**Why human:** `.task(id: selectedPeriod)` reactive reload behavior requires a running app and live backend to observe the actual API request and data update.

---

## Commits Verified

All task commits documented in SUMMARY files are present in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `99de1b0` | 09-01 Task 1 | Schema migration, APNS client, digest worker |
| `c8f67ef` | 09-01 Task 2 | Notification preferences and device token API |
| `9d9fa3c` | 09-02 Task 1 RED | Failing competitor tests |
| `bc4d62d` | 09-02 Task 1 GREEN | Competitor API implementation |
| `33fc5fc` | 09-03/09-04 Task 1 | APNS registration, NotificationManager, competitor models/VMs |
| `9421b12` | 09-03 Task 2 | NotificationsSettingsView, DigestDetailView, SettingsView |
| `35f627d` | 09-04 Task 2 | CompetitorListView, CompetitorDetailView, StationPickerView |
| `d0e4547` | 09-04 Task 3 | Fix stations role access + competitor snake_case schema |

---

## Gaps Summary

No gaps. All 20 observable truths verified. All artifacts pass existence, substantive, and wiring checks. All 5 requirement IDs (NOTF-01, NOTF-02, NOTF-03, STIN-01, STIN-02) are satisfied.

The 6 human verification items are inherent to the nature of push notifications (require real APNS credentials and devices) and role-gated UI (require runtime login sessions). They do not indicate missing implementation — the code is complete and correct.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
