# Phase 9: Notifications & Station Intelligence - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Periodic airplay digest push notifications (daily and weekly) with user-configurable preferences, plus a competitor station monitoring view for station-role users. Covers requirements NOTF-01 (daily digest), NOTF-02 (weekly digest), NOTF-03 (notification preferences), STIN-01 (view competitor station activity), STIN-02 (see top songs on competitor stations). Per-detection push notifications are explicitly out of scope (PROJECT.md: "Digest notifications over push").

</domain>

<decisions>
## Implementation Decisions

### Digest content & format
- Daily digest: play count + top song + top station — e.g., "47 plays today. 'Melodia' was #1 with 15 plays, mostly on Kiss FM"
- Weekly digest: play count + week-over-week % change + top song + top station + new stations count — e.g., "312 plays (+15%). 'Melodia' #1. 3 new stations played your music this week"
- Digests sent at 9 AM Romania time (EET/EEST)
- Daily digest sent every morning summarizing yesterday's stats
- Weekly digest sent Monday morning summarizing last week's stats

### Digest delivery & deep linking
- Delivered via Apple Push Notification Service (APNS)
- Backend scheduled jobs (BullMQ) compute digest data and send push notifications
- Tapping a push notification opens a dedicated digest detail view in the app (not just the Dashboard)
- Digest detail view shows expanded stats beyond what fits in the notification

### Notification preferences
- Separate Notifications screen accessible from Settings (Settings > Notifications >)
- Two toggles: "Daily Digest" on/off and "Weekly Digest" on/off
- No time-of-day picker — fixed at 9 AM Romania time
- Default for new users: both daily and weekly enabled
- Preferences stored server-side (API endpoint for read/update)

### Push permission flow
- iOS push notification permission dialog prompted on first launch after registration
- If user denies, notification toggles in Settings still work (server-side prefs saved) but push won't be delivered until user enables in iOS Settings
- App should handle the denied-permission state gracefully (show a hint in Notifications settings if permission is denied)

### Competitor view placement & access
- Station-role users only — Artist/Label/Admin users do not see competitor features
- Accessible from Settings: Settings > "Competitor Stations" row (only visible to STATION role)
- Not a new tab — keeps the 5-tab layout (Dashboard, Live, Detections, Search, Settings)

### Competitor station list
- User self-selects which stations to watch as competitors (browse all stations, pick up to 10-20)
- Manage watched list from within the competitor view itself (+ button to add, swipe to remove)
- Watched competitor list stored server-side per user

### Competitor view layout
- Main screen: cards layout, each competitor station shown as a card with station name + today's play count + top song preview
- Tap a card to drill into station detail view
- Day | Week | Month segmented control (consistent with Dashboard pattern)
- Station detail view shows three sections:
  1. Top songs — ranked list of most-played songs on that station for selected period
  2. Recent detections — scrollable feed of recent plays on that station
  3. Play count comparison — overlapping songs shown with "they played X, you played Y" side-by-side

### Claude's Discretion
- APNS integration approach (direct APNS vs third-party service like Firebase Cloud Messaging)
- Push notification payload format and size optimization
- BullMQ cron schedule configuration for digest jobs
- Digest detail view layout and styling
- Competitor card design specifics
- Query optimization for competitor data aggregation
- Empty states (no competitors selected, no data for a competitor)
- Error handling for failed push delivery

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SettingsView** (Views/Settings/SettingsView.swift): Existing Settings screen with Account/App/Logout sections — add Notifications row and Competitor Stations row here
- **MainTabView** (Views/MainTabView.swift): 5-tab layout — no changes needed, competitor view lives under Settings
- **AuthManager** (Services/AuthManager.swift): @Observable with role info — use to conditionally show competitor row for STATION role
- **DashboardView** (Views/Dashboard/): Day|Week|Month segmented control pattern — reuse for competitor time period selector
- **DetectionRowView** (Views/Detections/DetectionRowView.swift): Compact detection row — reuse for competitor recent detections feed
- **BullMQ** (workers/): Job queue infrastructure already in place for scheduled work — reuse for digest cron jobs
- **Redis** (lib/redis.ts): Redis connection utility — already available for pub/sub and job queues
- **Dashboard aggregate endpoints** (routes/v1/dashboard/): TimescaleDB continuous aggregate query patterns — reuse for digest stat computation and competitor aggregation

### Established Patterns
- @Observable macro with .environment() injection (iOS 17+)
- MVVM with ViewModel per screen
- Fastify plugin route pattern: routes/v1/{resource}/index.ts + schema.ts + handlers.ts
- BullMQ job scheduling with upsertJobScheduler API (Phase 2)
- Role-based scope filtering on API endpoints (Phase 5)
- Cursor pagination for list endpoints

### Integration Points
- **SettingsView**: Add "Notifications" and "Competitor Stations" navigation rows
- **User model/DB**: Add notification preferences fields (dailyDigest, weeklyDigest boolean)
- **User model/DB**: Add watched competitor stations relation
- **APNS**: Backend needs to store device push tokens, send via APNS
- **AppDelegate/App**: Register for remote notifications, handle device token
- **BullMQ scheduler**: New cron jobs for daily (9 AM EET) and weekly (Monday 9 AM EET) digest computation
- **Airplay events queries**: New query patterns for competitor station data (top songs by station, cross-station comparison)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-notifications-station-intelligence*
*Context gathered: 2026-03-16*
