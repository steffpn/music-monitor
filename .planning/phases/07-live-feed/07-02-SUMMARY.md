---
phase: 07-live-feed
plan: 02
subsystem: ios
tags: [sse, streaming, swiftui, live-feed, real-time, urlsession, observable]

# Dependency graph
requires:
  - phase: 07-live-feed
    provides: SSE endpoint at GET /v1/live-feed, Redis pub/sub broadcasting, LiveDetectionEvent format
  - phase: 06-ios
    provides: DetectionRowView, AudioPlayerManager, MainTabView, KeychainHelper, APIClient, AirplayEvent model
provides:
  - SSEClient actor for URLSession.bytes SSE streaming with Last-Event-ID backfill
  - LiveFeedViewModel with 50-item buffer, connection state, scroll-aware new event counting
  - LiveFeedView with empty state, disconnected state, events list, and connection indicator
  - NewDetectionsPill overlay for scroll-to-top on new events
  - MainTabView updated with Live tab (waveform icon) in second position
affects: [ios-app, live-feed-feature]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Actor-based SSE client with URLSession.bytes line iteration", "SSE wire format parsing (id/event/data/empty-line)", "LiveDetectionEvent to AirplayEvent conversion", "ScrollViewReader with programmatic scroll-to-top", "onAppear/onDisappear scroll position tracking", "ScenePhase lifecycle for SSE connection management"]

key-files:
  created:
    - apps/ios/myFuckingMusic/Services/SSEClient.swift
    - apps/ios/myFuckingMusic/ViewModels/LiveFeedViewModel.swift
    - apps/ios/myFuckingMusic/Views/LiveFeed/LiveFeedView.swift
    - apps/ios/myFuckingMusic/Views/LiveFeed/NewDetectionsPill.swift
  modified:
    - apps/ios/myFuckingMusic/Services/APIClient.swift
    - apps/ios/myFuckingMusic/Views/MainTabView.swift
    - apps/ios/myFuckingMusic/myFuckingMusic.xcodeproj/project.pbxproj

key-decisions:
  - "SSEClient uses URLSession.shared.bytes(for:) with line-by-line SSE frame parsing instead of third-party EventSource library"
  - "LiveDetectionEvent private struct converts SSE JSON payload to existing AirplayEvent model (mapping stationName to StationInfo, setting playCount=1)"
  - "ISO 8601 date parsing with fractional seconds fallback reuses pattern from Phase 6 DashboardModels"
  - "APIClient.getBaseURL() exposed as public method for SSEClient URL construction (strips /v1 suffix)"
  - "Scroll position tracked via onAppear/onDisappear on first list item for isAtTop detection"
  - "NewDetectionsPill uses ScrollViewReader proxy.scrollTo for programmatic scroll-to-top"

patterns-established:
  - "Actor-based SSE client: URLSession.bytes -> AsyncSequence lines -> SSE frame parser -> AsyncStream<Model>"
  - "LiveDetectionEvent adapter pattern: decode SSE-specific format, convert to existing domain model"
  - "ScenePhase SSE lifecycle: background -> scheduleDisconnect(30s), foreground -> cancelScheduledDisconnect + reconnect"
  - "Scroll-aware event insertion: animated insert when at top, silent insert + counter when scrolled down"

requirements-completed: [LIVE-01, LIVE-02]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 07 Plan 02: iOS Live Feed Summary

**iOS Live Feed tab with actor-based SSE streaming via URLSession.bytes, 50-item event buffer, Twitter/X-style "New detections" pill, and background/foreground connection lifecycle**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T09:39:38Z
- **Completed:** 2026-03-16T09:45:19Z
- **Tasks:** 2 of 3 (Task 3 is human-verify checkpoint)
- **Files modified:** 7

## Accomplishments
- SSEClient actor connects to /v1/live-feed, parses SSE wire format, yields AirplayEvent objects via AsyncStream
- LiveFeedViewModel manages 50-item event buffer with scroll-aware insertion (animated at top, silent when scrolled down)
- LiveFeedView shows pulsing waveform empty state, connection indicator (green/gray/orange), and DetectionRowView reuse
- NewDetectionsPill overlay appears when scrolled down and new events arrive; tapping scrolls to top
- MainTabView updated to 5 tabs: Dashboard, Live (waveform icon), Detections, Search, Settings
- Background disconnect scheduling (30s) and foreground reconnection with Last-Event-ID backfill

## Task Commits

Each task was committed atomically:

1. **Task 1: SSEClient service and LiveFeedViewModel** - `32aacf8` (feat)
   - SSEClient actor with URLSession.bytes streaming, SSE frame parser, LiveDetectionEvent-to-AirplayEvent conversion
   - LiveFeedViewModel with 50-item buffer, connection state, scroll-aware counting, background scheduling
   - APIClient.getBaseURL() exposed for SSE URL construction
2. **Task 2: LiveFeedView, NewDetectionsPill, and MainTabView update** - `0c2b112` (feat)
   - LiveFeedView with empty/disconnected/events states, ScrollViewReader, connection indicator
   - NewDetectionsPill blue capsule overlay with scroll-to-top action
   - MainTabView Live tab in second position with waveform SF Symbol
3. **Task 3: Human verification checkpoint** - pending human verify

## Files Created/Modified
- `apps/ios/myFuckingMusic/Services/SSEClient.swift` - Actor-based SSE client using URLSession.bytes for streaming with Last-Event-ID backfill
- `apps/ios/myFuckingMusic/ViewModels/LiveFeedViewModel.swift` - @Observable ViewModel with 50-item buffer, scroll state, connection lifecycle
- `apps/ios/myFuckingMusic/Views/LiveFeed/LiveFeedView.swift` - Live feed list with DetectionRowView, connection indicator, empty state
- `apps/ios/myFuckingMusic/Views/LiveFeed/NewDetectionsPill.swift` - Twitter/X-style "New detections" overlay pill
- `apps/ios/myFuckingMusic/Views/MainTabView.swift` - Updated tab bar with Live tab in second position
- `apps/ios/myFuckingMusic/Services/APIClient.swift` - Added getBaseURL() public method
- `apps/ios/myFuckingMusic/myFuckingMusic.xcodeproj/project.pbxproj` - Added 4 new files to Xcode project

## Decisions Made
- Used URLSession.shared.bytes(for:) with manual SSE frame parsing rather than a third-party EventSource library -- keeps zero dependency policy and aligns with actor-based concurrency model
- Created private LiveDetectionEvent struct inside SSEClient to decode SSE payload format, then converts to existing AirplayEvent model (maps stationName to StationInfo struct, sets playCount=1, endedAt=startedAt)
- ISO 8601 date parsing with fractional seconds fallback reuses the established pattern from Phase 6 DashboardModels
- Scroll position tracking uses onAppear/onDisappear on the first list item rather than ScrollView position API for simplicity
- APIClient.getBaseURL() added as a method rather than static property since baseURL is mutable (can be changed via setBaseURL)
- LiveFeedView strips /v1 from APIClient's baseURL before passing to SSEClient since SSEClient appends v1/live-feed itself

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- iPhone 16 simulator not available (OS has iOS 26.2 / iPhone 17 series) -- used iPhone 17 Pro simulator for build verification instead

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- iOS Live Feed feature complete pending human verification (Task 3 checkpoint)
- SSE streaming, UI animations, connection lifecycle, and background/foreground management all implemented
- Ready for end-to-end testing with backend running

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (32aacf8, 0c2b112) verified in git log.

---
*Phase: 07-live-feed*
*Completed: 2026-03-16*
