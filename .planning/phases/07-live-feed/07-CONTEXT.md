# Phase 7: Live Feed - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time detection stream — users see new detections appear within seconds of identification, filtered by their role and scope. Covers requirements LIVE-01 (real-time detection feed via SSE) and LIVE-02 (role-based feed filtering). Backend publishes detection events via SSE; iOS app displays them in a dedicated Live tab. Historical browsing, search, and export remain in existing tabs.

</domain>

<decisions>
## Implementation Decisions

### Transport protocol
- SSE (Server-Sent Events), not WebSocket — one-way server→client is sufficient
- Detection worker publishes to a Redis pub/sub channel when new detections are processed
- Fastify SSE route subscribes to Redis channel and pushes events to connected clients
- JWT authentication via query parameter (?token=xxx) — SSE EventSource API doesn't support custom headers
- Server-side filtering: read JWT claims and only push detections matching user's role/scope (consistent with Phase 5 pattern)
- Backfill on reconnect: client sends Last-Event-ID header, server replays missed events since that ID before switching to live stream

### Feed placement in app
- New "Live" tab added to the tab bar (5 tabs total)
- Tab order: Dashboard, **Live**, Detections, Search, Settings — Live is second position
- Tab icon: SF Symbol "waveform" with label "Live"
- No badge on the Live tab when detections arrive on other tabs

### Feed presentation
- New detections slide in from the top of the list (newest first)
- Reuse existing DetectionRowView from Phase 6 — same compact row with song title, artist, station, timestamp, play button
- Snippet playback works identically via AudioPlayerManager (shared environment instance)
- Maximum 50 detections kept in the live feed — older items drop off the bottom
- When user has scrolled down and a new detection arrives: keep scroll position, show a "New detections" pill/banner at the top that taps to scroll to latest (Twitter/X-style behavior)

### Connection lifecycle
- SSE connection stays alive for ~30 seconds after app backgrounds; disconnect after timeout
- On foreground return: reconnect and backfill missed events via Last-Event-ID
- Subtle connection status indicator: small colored dot in the nav bar area (green = connected, gray/red = disconnected)
- Empty state on first open: "Listening for detections..." centered message with a subtle pulsing animation (waveform or dot)

### Claude's Discretion
- Exact Redis pub/sub channel naming and message format
- SSE event ID generation strategy (for Last-Event-ID replay)
- Reconnection backoff timing
- Exact animation timing for slide-in and "New detections" pill
- "Listening..." animation implementation details
- Network error retry strategy
- Memory management for the 50-item buffer

</decisions>

<specifics>
## Specific Ideas

- "New detections" indicator when scrolled away should behave like Twitter/X's "New posts" pill — non-intrusive, tappable to jump to top
- Connection dot should be subtle — not distracting, just informational
- Feed should feel live and responsive — detections appearing within seconds of identification

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DetectionRowView** (Views/Detections/DetectionRowView.swift): Compact detection row with song title, artist, station, timestamp, play button — reuse directly for live feed items
- **SnippetPlayerView** (Views/Detections/SnippetPlayerView.swift): Inline expand-in-row player — works with DetectionRowView for live feed playback
- **AudioPlayerManager** (Services/AudioPlayerManager.swift): Shared playback instance via .environment() — already available across all tabs
- **AirplayEvent model** (Models/Detection.swift): AirplayEvent struct with snippetUrl and StationInfo — matches what SSE events will deliver
- **APIClient** (Services/APIClient.swift): Actor-based URLSession client — needs SSE/EventSource support added
- **AuthManager** (Services/AuthManager.swift): @Observable with role/scope info and token access — needed for SSE auth query param
- **Redis** (lib/redis.ts): createRedisConnection utility already exists for BullMQ — reuse for pub/sub subscriber

### Established Patterns
- @Observable macro with .environment() injection (iOS 17+)
- Fastify plugin route pattern: routes/v1/{resource}/index.ts + schema.ts + handlers.ts
- Role-based scope filtering on API endpoints (Phase 5 middleware)
- BullMQ worker pattern for detection processing (Phase 3)
- Redis already in stack for BullMQ job queues

### Integration Points
- **Detection worker** (workers/detection.ts): Add Redis PUBLISH after successful detection processing
- **Fastify SSE route**: New route at GET /v1/live-feed?token=xxx — subscribes to Redis pub/sub, streams SSE events
- **MainTabView** (Views/MainTabView.swift): Add Live tab in second position
- **AuthManager**: Access token needed for SSE query parameter

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-live-feed*
*Context gathered: 2026-03-16*
