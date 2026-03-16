# Phase 6: Core iOS App & Dashboard - Research

**Researched:** 2026-03-16
**Domain:** iOS SwiftUI app development (auth, dashboard analytics, detection browsing, audio playback)
**Confidence:** HIGH

## Summary

Phase 6 builds the full iOS client that consumes the backend API built in Phases 1-5. The app covers four major domains: (1) authentication flow with Keychain token storage and silent refresh, (2) dashboard with aggregated play count analytics and charts, (3) detection browsing with search, filtering, and infinite scroll pagination, and (4) inline audio snippet playback. The backend already provides auth endpoints (register/login/refresh/logout), a snippet presigned URL endpoint, and station listing. However, two critical gaps exist: there are NO API endpoints for listing/searching airplay events with pagination, and NO API endpoints for dashboard aggregate data (the TimescaleDB continuous aggregates exist in the DB but have no REST surface).

The iOS app targets iOS 17.0 with Swift 5.0 and SWIFT_STRICT_CONCURRENCY=complete. The project already has an actor-based APIClient, all data models (Detection, AirplayEvent, Station, User, AudioSnippet), and empty directory scaffolding for ViewModels/, Views/, and Utilities/. The @Observable macro (iOS 17+) is the standard for MVVM. Swift Charts (built-in since iOS 16) handles all charting needs. AVPlayer handles remote audio URL playback. The Security framework (Keychain Services) handles secure token storage without third-party dependencies, consistent with the project's no-external-deps iOS pattern.

**Primary recommendation:** Split implementation into backend API additions first (airplay event listing/search/pagination + dashboard aggregate endpoints), then iOS auth flow with Keychain, then dashboard views with Swift Charts, then detection browsing with infinite scroll, then snippet playback. Each domain is independently testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Multi-step onboarding flow: welcome splash -> enter invite code -> create account (email + password + name) -> login confirmation -> land on dashboard
- Silent token refresh -- app automatically refreshes the JWT access token in the background when it expires (1h); user never sees token expiry
- Tokens stored securely in iOS Keychain (access token + refresh token)
- After login, user lands on the Dashboard tab
- If refresh token is invalid/expired (30d), redirect to login screen silently
- Standard iOS tab bar at the bottom with tabs: Dashboard, Detections, Search, Settings
- Tab bar visible on all main screens
- Settings tab for logout, account info, and future notification preferences (Phase 9)
- Vertically scrollable view with sections: summary cards at top, then play count chart, then top stations list
- Summary cards: bold numbers for total plays today, this week, this month
- Play count trend shown as a line/bar chart over the selected time period
- Segmented control at the top to switch time period: Day | Week | Month -- charts and cards update in place
- Top stations shown as a ranked list (top 5-10) with horizontal bars showing relative play count, station name, and count number
- Data sourced from TimescaleDB continuous aggregates (already set up in Phase 1)
- Compact row layout: each detection shows song title, artist, station name, timestamp, and small play button in a single row
- Persistent search bar at top of the Detections/Search tab -- type to search by song title, artist name, or ISRC
- Filter chips below search bar for date range and station selection
- Filters apply immediately as changed
- Infinite scroll -- automatically loads more detections as user scrolls near the bottom
- Pull-to-refresh supported -- pull down to fetch latest detections
- Inline expand-in-row player: tapping play on a detection row expands that row to show a progress bar and play/pause button
- Simple thin horizontal progress bar showing playback position (no waveform)
- One snippet plays at a time -- tapping play on a different detection stops the current one immediately, collapses the previous row, and starts the new one
- When a detection has no snippet (snippetUrl is null), the play button is shown but grayed out/disabled
- Audio fetched via GET /airplay-events/:id/snippet presigned URL (24h expiry, from Phase 4)

### Claude's Discretion
- Chart library choice (Swift Charts or third-party)
- Exact color scheme and typography
- Loading skeleton/shimmer design
- Error state handling and retry UX
- Empty state illustrations and copy
- Keychain wrapper implementation details
- API response pagination format (cursor vs offset)
- ViewModel structure within MVVM pattern
- Network reachability handling

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | User sees aggregated play counts (daily/weekly/monthly) on dashboard | New backend endpoints needed to query TimescaleDB continuous aggregates (daily_station_plays, weekly_artist_plays, monthly_song_plays). Swift Charts BarMark/LineMark for visualization. @Observable DashboardViewModel. |
| DASH-02 | User sees top stations playing their music | Backend endpoint returns station-level play counts ranked. SwiftUI horizontal bar chart using Swift Charts BarMark with station names on y-axis. |
| DASH-03 | User sees station-level breakdown with trend data over time | Backend endpoint for station play counts over time buckets. Swift Charts LineMark with station series. Segmented control switches time granularity. |
| DASH-04 | User can search by song title, artist name, or ISRC | New backend GET /airplay-events endpoint with query params (q, isrc). SwiftUI .searchable modifier or custom search bar. DetectionsViewModel manages search state. |
| DASH-05 | User can filter results by date range and station | Backend query params (startDate, endDate, stationId). Filter chips UI with date picker and station picker sheets. |
| DETC-04 | User can query historical detections by date range | Backend pagination endpoint with date range filtering. Infinite scroll via LazyVStack + onAppear threshold. Cursor-based pagination recommended. |
| PLAY-01 | User can tap a detection to play the 5-second audio snippet in-app | AVPlayer with remote URL from GET /airplay-events/:id/snippet. AudioPlayerManager actor for thread-safe playback control. |
| PLAY-02 | Snippet plays without leaving the current view (inline player) | Expand-in-row animation using SwiftUI .matchedGeometryEffect or conditional row content. ProgressView with AVPlayer periodic time observer. Single-active-player enforcement. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SwiftUI | iOS 17+ | UI framework | Project-locked decision, modern declarative UI |
| Swift Charts | iOS 17+ (built-in) | Dashboard charts | Apple first-party, no dependencies, native SwiftUI integration, supports BarMark/LineMark/AreaMark |
| AVFoundation (AVPlayer) | iOS 17+ (built-in) | Audio snippet playback | Streams audio from URL, progress observation via addPeriodicTimeObserver |
| Security.framework | iOS 17+ (built-in) | Keychain token storage | No third-party deps pattern matches existing codebase (no Alamofire, no external libs) |
| Observation framework | iOS 17+ (@Observable) | MVVM state management | Replaces ObservableObject/Combine, granular view updates, simpler code |
| URLSession | iOS 17+ (built-in) | Network requests | Already established in APIClient.swift, async/await pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Fastify (backend) | 5.8.0 | New API endpoints | Dashboard aggregates + airplay event listing/search/pagination |
| @sinclair/typebox (backend) | 0.34.48 | Route schema validation | Request/response schema for new endpoints |
| Prisma (backend) | 7.3.0 | Database queries | Query airplay_events table + raw SQL for TimescaleDB continuous aggregates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Swift Charts | DGCharts (Charts) | Third-party dep, more customization but unnecessary complexity for bar/line charts |
| Security.framework | KeychainAccess SPM | Simpler API but adds external dependency; project pattern avoids external iOS deps |
| Cursor pagination | Offset pagination | Offset is simpler but performs poorly on large datasets; cursor is standard for infinite scroll |

**Recommendation (Claude's Discretion items):**
- **Chart library:** Use Swift Charts (built-in). It handles bar charts, line charts, and segmented controls natively. No third-party dependency needed.
- **Pagination format:** Use cursor-based pagination (cursor = last event ID). Consistent performance regardless of offset depth. Backend returns `{ data: [...], nextCursor: number | null }`.
- **Keychain wrapper:** Thin custom KeychainHelper struct wrapping Security.framework's SecItemAdd/SecItemCopyMatching/SecItemUpdate/SecItemDelete. Approximately 60 lines of code.

## Architecture Patterns

### Recommended Project Structure
```
apps/ios/myFuckingMusic/
├── App/
│   ├── myFuckingMusicApp.swift      # @main, auth-gated root view
│   └── ContentView.swift            # Replace with RootView (auth gate)
├── Models/                          # Already exists with all models
│   ├── Detection.swift
│   ├── AirplayEvent.swift
│   ├── User.swift
│   ├── Station.swift
│   ├── AudioSnippet.swift
│   └── Invitation.swift
├── Services/
│   ├── APIClient.swift              # Existing -- extend with auth header injection
│   ├── APIEndpoint.swift            # Existing -- add all new endpoints
│   ├── AuthManager.swift            # NEW: actor for token lifecycle
│   ├── KeychainHelper.swift         # NEW: Keychain read/write/delete
│   └── AudioPlayerManager.swift     # NEW: AVPlayer wrapper for snippet playback
├── ViewModels/
│   ├── AuthViewModel.swift          # NEW: onboarding + login state
│   ├── DashboardViewModel.swift     # NEW: aggregates, charts data
│   ├── DetectionsViewModel.swift    # NEW: search, filter, pagination
│   └── SettingsViewModel.swift      # NEW: user info, logout
├── Views/
│   ├── Auth/
│   │   ├── WelcomeView.swift        # Splash with "Get Started" button
│   │   ├── InviteCodeView.swift     # Enter XXXX-XXXX-XXXX code
│   │   ├── RegisterView.swift       # Email + password + name form
│   │   └── LoginView.swift          # Email + password login
│   ├── Dashboard/
│   │   ├── DashboardView.swift      # Main dashboard tab
│   │   ├── SummaryCardsView.swift   # Today/week/month cards
│   │   ├── PlayCountChartView.swift # Line/bar chart
│   │   └── TopStationsView.swift    # Ranked horizontal bar list
│   ├── Detections/
│   │   ├── DetectionsView.swift     # Main detections tab
│   │   ├── DetectionRowView.swift   # Compact row with play button
│   │   ├── FilterChipsView.swift    # Date range + station chips
│   │   └── SnippetPlayerView.swift  # Expanded inline player
│   ├── Settings/
│   │   └── SettingsView.swift       # Account info + logout
│   └── Shared/
│       ├── LoadingView.swift        # Skeleton/shimmer placeholder
│       └── ErrorView.swift          # Error state with retry button
├── Utilities/
│   └── DateFormatters.swift         # Shared date formatting
└── Resources/
```

### Backend API Additions (Required)
```
apps/api/src/routes/v1/
├── airplay-events/
│   ├── handlers.ts     # ADD: listEvents (paginated, filtered, searchable)
│   ├── schema.ts       # ADD: query param schemas for list endpoint
│   └── index.ts        # ADD: GET / route registration
├── dashboard/           # NEW route group
│   ├── handlers.ts     # Aggregate queries using raw SQL on continuous aggregates
│   ├── schema.ts       # Response schemas for dashboard data
│   └── index.ts        # Route registration
```

### Pattern 1: Auth-Gated Root View
**What:** App entry point checks Keychain for tokens and routes to auth flow or main tab view.
**When to use:** App launch, token expiry detection.
**Example:**
```swift
// Source: @Observable pattern from nilcoalescing.com/blog/ObservableInSwiftUI
@Observable
class AuthManager {
    var isAuthenticated = false
    var currentUser: User?

    private var refreshTask: Task<Void, Error>?

    func checkStoredTokens() async {
        guard let accessToken = KeychainHelper.read(key: "accessToken"),
              let refreshToken = KeychainHelper.read(key: "refreshToken") else {
            isAuthenticated = false
            return
        }
        // Validate or refresh token
        do {
            try await refreshAccessToken(refreshToken)
            isAuthenticated = true
        } catch {
            clearTokens()
            isAuthenticated = false
        }
    }
}

// Root view
struct RootView: View {
    @State private var authManager = AuthManager()

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                MainTabView()
            } else {
                AuthFlowView()
            }
        }
        .environment(authManager)
        .task { await authManager.checkStoredTokens() }
    }
}
```

### Pattern 2: Actor-Based Token Refresh with Retry
**What:** Ensures only one token refresh happens at a time across concurrent requests.
**When to use:** Any authenticated API call that receives 401.
**Example:**
```swift
// Source: donnywals.com/building-a-token-refresh-flow
actor TokenRefresher {
    private var refreshTask: Task<String, Error>?

    func validAccessToken() async throws -> String {
        if let task = refreshTask {
            return try await task.value
        }

        guard let accessToken = KeychainHelper.read(key: "accessToken") else {
            throw AuthError.notAuthenticated
        }

        // Check if token is about to expire (within 5 minutes)
        if isTokenExpiringSoon(accessToken) {
            return try await refreshToken()
        }

        return accessToken
    }

    func refreshToken() async throws -> String {
        if let task = refreshTask {
            return try await task.value
        }

        let task = Task { () -> String in
            defer { refreshTask = nil }
            guard let refresh = KeychainHelper.read(key: "refreshToken") else {
                throw AuthError.notAuthenticated
            }
            let response = try await APIClient.shared.refreshTokens(refresh)
            KeychainHelper.save(key: "accessToken", value: response.accessToken)
            KeychainHelper.save(key: "refreshToken", value: response.refreshToken)
            return response.accessToken
        }

        refreshTask = task
        return try await task.value
    }
}
```

### Pattern 3: Cursor-Based Infinite Scroll
**What:** Loads paginated data as user scrolls, using cursor for consistent results.
**When to use:** Detection browsing with potentially thousands of results.
**Example:**
```swift
@Observable
class DetectionsViewModel {
    var detections: [AirplayEvent] = []
    var isLoading = false
    var nextCursor: Int?
    var hasMore: Bool { nextCursor != nil }

    func loadMore() async {
        guard !isLoading, hasMore || detections.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }

        let response = try? await APIClient.shared.fetchDetections(
            cursor: nextCursor,
            limit: 20,
            query: searchQuery,
            startDate: startDate,
            endDate: endDate,
            stationId: selectedStationId
        )

        if let response {
            detections.append(contentsOf: response.data)
            nextCursor = response.nextCursor
        }
    }
}

// In SwiftUI view:
ScrollView {
    LazyVStack(spacing: 0) {
        ForEach(viewModel.detections) { event in
            DetectionRowView(event: event)
                .onAppear {
                    if event.id == viewModel.detections.suffix(5).first?.id {
                        Task { await viewModel.loadMore() }
                    }
                }
        }
    }
}
.refreshable { await viewModel.refresh() }
```

### Pattern 4: Single-Active Audio Player
**What:** Only one snippet plays at a time. Tapping a new one stops the current.
**When to use:** Snippet playback in detection list.
**Example:**
```swift
@Observable
class AudioPlayerManager {
    var currentlyPlayingId: Int?
    var playbackProgress: Double = 0
    var isPlaying = false

    private var player: AVPlayer?
    private var timeObserver: Any?

    func play(eventId: Int, url: URL) {
        stop() // Stop current playback

        let item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)
        currentlyPlayingId = eventId
        isPlaying = true

        // Observe progress
        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self, let duration = self.player?.currentItem?.duration,
                  duration.seconds > 0 else { return }
            self.playbackProgress = time.seconds / duration.seconds
        }

        player?.play()

        // Auto-stop at end
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            self?.stop()
        }
    }

    func stop() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        player?.pause()
        player = nil
        currentlyPlayingId = nil
        isPlaying = false
        playbackProgress = 0
    }
}
```

### Anti-Patterns to Avoid
- **ObservableObject + @Published + Combine:** Outdated for iOS 17+. Use @Observable macro exclusively. The project already decided on iOS 17 minimum.
- **Storing tokens in UserDefaults:** Not secure. Must use Keychain per locked decision.
- **Offset-based pagination for infinite scroll:** Performance degrades on deep pages. Use cursor.
- **Creating new AVPlayer instances without stopping the previous one:** Leads to multiple audio streams playing simultaneously. Always stop before play.
- **Using .task { } without cancellation awareness:** SwiftUI task cancels on view disappear, which is correct behavior. Do not ignore CancellationError.
- **Blocking main thread with synchronous Keychain reads on launch:** Use async pattern for initial token check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charts / data visualization | Custom Canvas/Path drawing | Swift Charts (BarMark, LineMark) | Built-in, accessible, dark mode, dynamic type support out of box |
| Token storage | UserDefaults or file storage | Keychain via Security.framework | Encrypted at rest, per-app sandboxed, hardware-backed on devices with Secure Enclave |
| Audio playback + progress | URLSession data download + AudioToolbox | AVPlayer with URL + periodic observer | Handles streaming, buffering, codec decoding automatically |
| Pull-to-refresh | Custom gesture recognizer | .refreshable { } modifier | Built into ScrollView, shows standard iOS spinner |
| Search debouncing | Custom Timer-based debounce | .task(id: searchText) { try await Task.sleep(...) } | SwiftUI task auto-cancels on value change, natural debounce pattern |
| JSON date parsing | Custom DateFormatter | JSONDecoder with .iso8601 strategy | Already configured in APIClient, handles ISO8601 consistently |
| Tab bar | Custom HStack at bottom | TabView with .tabItem | Native iOS look and feel, accessibility, VoiceOver support |

**Key insight:** The iOS 17 minimum target unlocks all modern SwiftUI APIs (@Observable, Swift Charts, .searchable, .refreshable, NavigationStack). Every UI element in this phase has a first-party SwiftUI solution. Zero third-party iOS dependencies needed.

## Common Pitfalls

### Pitfall 1: Missing Backend Endpoints
**What goes wrong:** The iOS app is designed but there are no API endpoints for listing/searching airplay events or fetching dashboard aggregates.
**Why it happens:** Phases 1-5 built the detection pipeline and auth system but only exposed a snippet URL endpoint on airplay-events. No list/search/filter endpoint exists.
**How to avoid:** Build backend endpoints FIRST before iOS views that consume them. Two gaps:
  1. `GET /api/v1/airplay-events` -- paginated list with search (q param) and filters (startDate, endDate, stationId)
  2. `GET /api/v1/dashboard/summary` and `GET /api/v1/dashboard/top-stations` -- aggregate endpoints querying continuous aggregates via raw SQL ($queryRawUnsafe or $queryRaw)
**Warning signs:** iOS views showing empty states because no endpoint returns the data.

### Pitfall 2: Keychain Access from Wrong Thread Context
**What goes wrong:** Keychain reads/writes block the main thread or fail silently.
**Why it happens:** Security framework Keychain APIs are synchronous C calls. Under SWIFT_STRICT_CONCURRENCY=complete, accessing from wrong isolation context triggers warnings.
**How to avoid:** Make KeychainHelper a struct with static nonisolated methods (Keychain ops are fast enough to be synchronous). Wrap in Task { } if called from async context. Never call on a concurrent context that could cause data races -- the Keychain itself is thread-safe.
**Warning signs:** Purple runtime warnings about main actor usage, or UI freezes on launch.

### Pitfall 3: AVPlayer Not Playing Remote Audio
**What goes wrong:** AVPlayer silently fails to play audio from a presigned R2 URL.
**Why it happens:** (a) App Transport Security blocks HTTP URLs. (b) Audio session category not set. (c) Presigned URL expired.
**How to avoid:** (a) All R2 URLs should be HTTPS. (b) Set AVAudioSession.sharedInstance().setCategory(.playback) before first play. (c) Fetch a fresh presigned URL before each play (24h expiry, but fetch fresh to be safe).
**Warning signs:** Play button tapped but no sound, no error visible.

### Pitfall 4: Continuous Aggregate Queries Fail in Prisma
**What goes wrong:** Prisma ORM cannot query materialized views (daily_station_plays, weekly_artist_plays, monthly_song_plays) because they are not in the Prisma schema.
**Why it happens:** TimescaleDB continuous aggregates are PostgreSQL materialized views, not tables. Prisma models only map to tables.
**How to avoid:** Use `prisma.$queryRaw` or `prisma.$queryRawUnsafe` with tagged template literals. This is the standard pattern for querying views/aggregates in Prisma.
**Warning signs:** "Table not found" errors or attempts to add views to schema.prisma.

### Pitfall 5: Infinite Scroll Duplicate Loads
**What goes wrong:** The same page of results loads multiple times, causing duplicates in the list.
**Why it happens:** onAppear fires multiple times for the threshold item as the view recycles. Without a loading guard, parallel requests fetch the same cursor.
**How to avoid:** Use an `isLoading` guard at the top of `loadMore()`. Also check `hasMore` before initiating. The cursor-based approach naturally prevents true duplicates since each cursor points to a unique position.
**Warning signs:** Same detections appearing twice in the list.

### Pitfall 6: Token Refresh Race Condition
**What goes wrong:** Multiple concurrent API calls all detect 401 and all attempt token refresh simultaneously, causing multiple refresh token rotations (only one succeeds, the rest fail because the old refresh token was already revoked).
**Why it happens:** Backend rotates refresh tokens -- each refresh call revokes the old token and issues a new one. If two calls refresh simultaneously, the second one uses an already-revoked token.
**How to avoid:** Use the actor-based TokenRefresher pattern where a single `refreshTask` is shared. All concurrent callers await the same task. This is the standard pattern from Apple's async/await documentation.
**Warning signs:** Intermittent logouts, "Invalid refresh token" errors in logs.

### Pitfall 7: Snake Case Mismatch on New API Response Fields
**What goes wrong:** New backend endpoints return fields like `next_cursor` or `play_count` that don't decode properly on iOS.
**Why it happens:** APIClient uses `.convertFromSnakeCase` key decoding strategy but Swift struct properties must match the converted camelCase names exactly.
**How to avoid:** Ensure backend response fields follow snake_case convention and iOS structs use matching camelCase (next_cursor -> nextCursor). Test JSON decoding with sample payloads.
**Warning signs:** nil values for fields that should have data, or decoding errors.

## Code Examples

### Keychain Helper (Security.framework)
```swift
// Thin wrapper -- no third-party dependency
import Security
import Foundation

struct KeychainHelper {
    private static let service = "com.myfuckingmusic.auth"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        // Delete existing item first
        SecItemDelete(query as CFDictionary)

        var addQuery = query
        addQuery[kSecValueData as String] = data
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    static func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll() {
        delete(key: "accessToken")
        delete(key: "refreshToken")
    }
}
```

### Swift Charts -- Dashboard Play Count Chart
```swift
// Source: developer.apple.com/documentation/Charts
import Charts
import SwiftUI

struct PlayCountChartView: View {
    let data: [PlayCountBucket]
    let period: TimePeriod // .day, .week, .month

    var body: some View {
        Chart(data) { bucket in
            BarMark(
                x: .value("Date", bucket.date, unit: period.calendarComponent),
                y: .value("Plays", bucket.playCount)
            )
            .foregroundStyle(.blue.gradient)
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: period.calendarComponent)) { value in
                AxisGridLine()
                AxisValueLabel(format: period.dateFormat)
            }
        }
        .frame(height: 200)
    }
}

// Top Stations horizontal bar chart
struct TopStationsChartView: View {
    let stations: [StationPlayCount]

    var body: some View {
        Chart(stations) { station in
            BarMark(
                x: .value("Plays", station.playCount),
                y: .value("Station", station.name)
            )
            .foregroundStyle(.blue.gradient)
            .annotation(position: .trailing) {
                Text("\(station.playCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .chartYAxis {
            AxisMarks { value in
                AxisValueLabel()
            }
        }
        .frame(height: CGFloat(stations.count * 44))
    }
}
```

### APIEndpoint Extension (all new endpoints)
```swift
enum APIEndpoint: Sendable {
    // Health
    case health

    // Auth
    case register(code: String, email: String, password: String, name: String)
    case login(email: String, password: String)
    case refresh(refreshToken: String)
    case logout(refreshToken: String)

    // Dashboard
    case dashboardSummary(period: String) // "day" | "week" | "month"
    case topStations(period: String, limit: Int)

    // Airplay Events
    case airplayEvents(cursor: Int?, limit: Int, query: String?,
                       startDate: String?, endDate: String?, stationId: Int?)
    case snippetUrl(eventId: Int)

    // Stations (for filter picker)
    case stations

    var path: String {
        switch self {
        case .health: return "/health"
        case .register: return "/auth/register"
        case .login: return "/auth/login"
        case .refresh: return "/auth/refresh"
        case .logout: return "/auth/logout"
        case .dashboardSummary: return "/dashboard/summary"
        case .topStations: return "/dashboard/top-stations"
        case .airplayEvents: return "/airplay-events"
        case .snippetUrl(let id): return "/airplay-events/\(id)/snippet"
        case .stations: return "/stations"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .register, .login, .refresh, .logout: return .POST
        default: return .GET
        }
    }

    // query params for GET requests, body for POST requests...
}
```

### Backend Dashboard Aggregate Endpoint
```typescript
// Source: Prisma $queryRaw for TimescaleDB continuous aggregates
// apps/api/src/routes/v1/dashboard/handlers.ts

import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../../lib/prisma.js";

interface SummaryQuery { period: string; }

export async function getDashboardSummary(
  request: FastifyRequest<{ Querystring: SummaryQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { currentUser } = request;
  const { period } = request.query; // "day" | "week" | "month"

  // Build scope filter
  const stationFilter = currentUser.role === "STATION"
    ? currentUser.scopes.filter(s => s.entityType === "STATION").map(s => s.entityId)
    : null;

  // Query continuous aggregate
  const results = await prisma.$queryRaw`
    SELECT
      bucket,
      SUM(play_count)::int AS play_count,
      SUM(unique_songs)::int AS unique_songs,
      SUM(unique_artists)::int AS unique_artists
    FROM daily_station_plays
    WHERE bucket >= NOW() - ${period === "day" ? "1 day" : period === "week" ? "7 days" : "30 days"}::interval
    ${stationFilter ? Prisma.sql`AND station_id = ANY(${stationFilter})` : Prisma.empty}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return reply.send(results);
}
```

### Backend Airplay Events List Endpoint (Cursor Pagination)
```typescript
// apps/api/src/routes/v1/airplay-events/handlers.ts (addition)

interface ListQuery {
  cursor?: number;
  limit?: number;
  q?: string;
  startDate?: string;
  endDate?: string;
  stationId?: number;
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { currentUser } = request;
  const { cursor, limit = 20, q, startDate, endDate, stationId } = request.query;

  const where: any = {};

  // Scope filtering
  if (currentUser.role === "STATION") {
    const stationIds = currentUser.scopes
      .filter(s => s.entityType === "STATION")
      .map(s => s.entityId);
    where.stationId = { in: stationIds };
  }

  // Search filter
  if (q) {
    where.OR = [
      { songTitle: { contains: q, mode: "insensitive" } },
      { artistName: { contains: q, mode: "insensitive" } },
      { isrc: { equals: q, mode: "insensitive" } },
    ];
  }

  // Date range filter
  if (startDate) where.startedAt = { ...where.startedAt, gte: new Date(startDate) };
  if (endDate) where.startedAt = { ...where.startedAt, lte: new Date(endDate) };

  // Station filter
  if (stationId) where.stationId = stationId;

  // Cursor pagination
  if (cursor) where.id = { lt: cursor };

  const events = await prisma.airplayEvent.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit + 1, // Fetch one extra to determine hasMore
    include: { station: { select: { name: true } } },
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return reply.send({ data, nextCursor });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ObservableObject + @Published + Combine | @Observable macro (Observation framework) | iOS 17 / WWDC 2023 | Simpler code, granular updates, no Combine boilerplate |
| NavigationView | NavigationStack | iOS 16 / WWDC 2022 | Programmatic navigation, type-safe paths |
| UIKit Charts (third-party) | Swift Charts (first-party) | iOS 16 / WWDC 2022 | Built-in, accessible, dark mode, localized |
| TabView { }.tabItem { } (label-based) | TabView { Tab("name", ...) { } } | iOS 18 / WWDC 2024 | Structural tabs, but iOS 17 target means use older API |

**Deprecated/outdated:**
- `ObservableObject` protocol: Still works but @Observable is preferred for iOS 17+. Do NOT use.
- `@EnvironmentObject`: Replaced by `@Environment(ModelType.self)` with @Observable.
- `NavigationView`: Deprecated in iOS 16. Use `NavigationStack`.
- `List { }` for custom layouts: `LazyVStack` in `ScrollView` gives more control for infinite scroll.

**iOS 17 target note:** TabView must use the older `.tabItem { }` API, not iOS 18's `Tab("", ...)` constructor. This is fine and fully supported.

## Open Questions

1. **Dashboard aggregate endpoint scope filtering for ARTIST/LABEL roles**
   - What we know: STATION role filters by stationId in scopes. ADMIN sees all.
   - What's unclear: ARTIST/LABEL roles have scopes but entity models for artists/labels don't exist yet (noted in Phase 5 decisions). Currently "allowed if any scope entry exists."
   - Recommendation: For Phase 6, ARTIST/LABEL users see ALL data (no scope filtering) since entity models are deferred. Add a TODO comment for future scope refinement. This matches the Phase 5 pattern.

2. **Dashboard time period alignment**
   - What we know: Continuous aggregates use `time_bucket('1 day', ...)` for daily, `time_bucket('7 days', ...)` for weekly.
   - What's unclear: Whether "this week" means last 7 days or calendar week (Mon-Sun). Whether "this month" means last 30 days or calendar month.
   - Recommendation: Use rolling windows (last 7 days, last 30 days) for simplicity. The continuous aggregates already bucket by interval, not calendar boundaries.

3. **Separate Detections and Search tabs vs combined**
   - What we know: CONTEXT.md says "tabs: Dashboard, Detections, Search, Settings" but also says "Persistent search bar at top of the Detections/Search tab."
   - What's unclear: The slash in "Detections/Search" suggests they may be the same tab.
   - Recommendation: Combine into a single "Detections" tab with search bar at top. Search is the primary interaction model for the detections list. Three tabs total: Dashboard, Detections, Settings. Alternatively keep four tabs with Search as a dedicated search-focused view. Follow the CONTEXT.md specification of four tabs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (backend API tests) |
| Config file | apps/api/vitest.config.ts |
| Quick run command | `cd apps/api && pnpm test -- --run tests/routes/airplay-events.test.ts` |
| Full suite command | `cd apps/api && pnpm test` |

**iOS Testing Note:** The iOS app uses SwiftUI with no existing test infrastructure. XCTest/XCUITest could be added but would require Xcode build toolchain. Given the project's pattern of testing backend routes via Vitest (mocking Prisma), validation for Phase 6 should focus on backend API endpoint tests. iOS view testing is manual (Xcode previews + simulator).

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Dashboard aggregate endpoint returns daily/weekly/monthly counts | integration | `cd apps/api && pnpm test -- --run tests/routes/dashboard.test.ts` | No -- Wave 0 |
| DASH-02 | Top stations endpoint returns ranked stations | integration | `cd apps/api && pnpm test -- --run tests/routes/dashboard.test.ts` | No -- Wave 0 |
| DASH-03 | Station trend endpoint returns time-bucketed data | integration | `cd apps/api && pnpm test -- --run tests/routes/dashboard.test.ts` | No -- Wave 0 |
| DASH-04 | Airplay events list supports search by title/artist/ISRC | integration | `cd apps/api && pnpm test -- --run tests/routes/airplay-events-list.test.ts` | No -- Wave 0 |
| DASH-05 | Airplay events list supports date range + station filtering | integration | `cd apps/api && pnpm test -- --run tests/routes/airplay-events-list.test.ts` | No -- Wave 0 |
| DETC-04 | Airplay events list supports cursor pagination + date range | integration | `cd apps/api && pnpm test -- --run tests/routes/airplay-events-list.test.ts` | No -- Wave 0 |
| PLAY-01 | Snippet URL endpoint returns presigned URL (existing) | integration | `cd apps/api && pnpm test -- --run tests/routes/airplay-events.test.ts` | Yes |
| PLAY-02 | Inline snippet playback | manual-only | Xcode Simulator manual test | N/A -- SwiftUI UI behavior |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test -- --run tests/routes/dashboard.test.ts tests/routes/airplay-events-list.test.ts`
- **Per wave merge:** `cd apps/api && pnpm test`
- **Phase gate:** Full backend suite green + iOS app builds without errors in Xcode

### Wave 0 Gaps
- [ ] `apps/api/tests/routes/dashboard.test.ts` -- covers DASH-01, DASH-02, DASH-03
- [ ] `apps/api/tests/routes/airplay-events-list.test.ts` -- covers DASH-04, DASH-05, DETC-04
- [ ] `apps/api/src/routes/v1/dashboard/` -- entire route group needs creation
- [ ] `apps/api/src/routes/v1/airplay-events/` -- list handler and schema additions needed

## Sources

### Primary (HIGH confidence)
- Existing codebase: apps/ios/ (all Swift files), apps/api/src/ (all route handlers, middleware, Prisma schema)
- Existing migration: apps/api/prisma/migrations/00000000000001_timescaledb_setup/migration.sql (continuous aggregate definitions)
- [nilcoalescing.com/blog/ObservableInSwiftUI](https://nilcoalescing.com/blog/ObservableInSwiftUI/) -- @Observable macro patterns with concrete code examples
- [donnywals.com/building-a-token-refresh-flow](https://www.donnywals.com/building-a-token-refresh-flow-with-async-await-and-swift-concurrency/) -- Actor-based token refresh pattern
- [Apple Developer: Swift Charts](https://developer.apple.com/documentation/Charts) -- Framework documentation
- [Apple Developer: Migrating to @Observable](https://developer.apple.com/documentation/SwiftUI/Migrating-from-the-observable-object-protocol-to-the-observable-macro) -- Official migration guide
- [Apple Developer: TabView](https://developer.apple.com/documentation/swiftui/enhancing-your-app-content-with-tab-navigation) -- Tab navigation patterns

### Secondary (MEDIUM confidence)
- [hackingwithswift.com - TabView](https://www.hackingwithswift.com/quick-start/swiftui/how-to-embed-views-in-a-tab-bar-using-tabview) -- iOS 17 TabView patterns verified against Apple docs
- [avanderlee.com - Swift Charts Bar Chart](https://www.avanderlee.com/swift-charts/bar-chart-creation-using-swift-charts/) -- Bar chart patterns
- [svpdigitalstudio.com - Lazy Loading Pagination](https://www.svpdigitalstudio.com/blog/how-to-implement-lazy-loading-pagination-with-observation-swiftui-task-async-await) -- Infinite scroll with @Observable
- [kishikawakatsumi/KeychainAccess](https://github.com/kishikawakatsumi/KeychainAccess) -- Reference for Keychain API wrapper patterns (not used, but informs our custom implementation)

### Tertiary (LOW confidence)
- [medium.com/@samwise23 - AVPlayer audio](https://medium.com/@samwise23/playing-audio-with-avplayer-in-swift-b3ce82fbeb6d) -- AVPlayer audio URL patterns (single source, verify with Apple docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries are Apple first-party built-ins, already established in project (iOS 17 target confirmed in Xcode project)
- Architecture: HIGH -- MVVM with @Observable is confirmed project pattern. Backend route patterns well-established across 5 prior phases.
- Pitfalls: HIGH -- Identified from direct codebase analysis (missing endpoints, Prisma view limitations, token refresh race condition are all code-verifiable gaps)
- Backend API design: HIGH -- Follows exact same patterns as existing routes (TypeBox schemas, Fastify plugin structure, authenticate middleware, scope filtering)
- Audio playback: MEDIUM -- AVPlayer URL streaming is well-documented but specific behavior with R2 presigned URLs needs runtime validation

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- all libraries are Apple first-party with annual release cycle)
