---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 06-05-PLAN.md (Phase 6 complete)
last_updated: "2026-03-16T08:44:14.420Z"
last_activity: 2026-03-16 -- Completed plan 06-05 (Snippet Playback) -- Phase 6 complete
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Artists and labels can see exactly where, when, and how often their music is being played across Romanian radio and TV -- with audio proof.
**Current focus:** Phase 6: Core iOS App & Dashboard -- COMPLETE. Next: Phase 7

## Current Position

Phase: 6 of 9 (Core iOS App & Dashboard) -- COMPLETE
Plan: 5 of 5 in current phase (complete)
Status: Phase 6 complete. All 5 plans delivered. Next: Phase 7 (Live Feed)
Last activity: 2026-03-16 -- Completed plan 06-05 (Snippet Playback) -- Phase 6 complete

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 21
- Average duration: 6 min
- Total execution time: 2.37 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Project Foundation | 3/3 | 19 min | 6 min |
| 2. Stream Recording Infrastructure | 3/3 | 20 min | 7 min |
| 3. Detection Pipeline | 4/4 | 23 min | 6 min |
| 4. Audio Snippet System | 2/2 | 10 min | 5 min |
| 5. Authentication & User Management | 4/4 | 24 min | 6 min |
| 6. Core iOS App & Dashboard | 5/5 | 51 min | 10 min |

**Recent Trend:**
- Last 5 plans: 06-01 (10 min), 06-02 (15 min), 06-03 (6 min), 06-04 (8 min), 06-05 (12 min)
- Trend: stable

*Updated after each plan completion*
| Phase 01 P02 | 7min | 2 tasks | 12 files |
| Phase 01 P03 | 5 | 2 tasks | 14 files |
| Phase 02 P01 | 5min | 1 task (TDD) | 9 files |
| Phase 02 P02 | 8min | 2 tasks (TDD) | 9 files |
| Phase 02 P03 | 7min | 2 tasks (TDD+checkpoint) | 6 files |
| Phase 03 P01 | 7min | 2 tasks (TDD) | 9 files |
| Phase 03 P02 | 3min | 1 task (TDD) | 5 files |
| Phase 03 P03 | 3min | 2 tasks (TDD) | 2 files |
| Phase 03 P04 | 10min | 2 tasks (auto+checkpoint) | 2 files |
| Phase 04 P01 | 4min | 2 tasks (TDD) | 8 files |
| Phase 04 P02 | 6min | 2 tasks (TDD+checkpoint) | 8 files |
| Phase 05 P01 | 8min | 2 tasks (TDD) | 15 files |
| Phase 05 P02 | 5min | 1 task (TDD) | 6 files |
| Phase 05 P03 | 6min | 2 tasks (TDD) | 14 files |
| Phase 05 P04 | 5min | 2 tasks (auto+checkpoint) | 4 files |
| Phase 06 P01 | 10min | 2 tasks (TDD) | 9 files |
| Phase 06 P02 | 15min | 3 tasks (auto+checkpoint) | 16 files |
| Phase 06 P03 | 6min | 1 task (auto) | 9 files |
| Phase 06 P04 | 8min | 2 tasks (auto) | 10 files |
| Phase 06 P05 | 12min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 9 phases derived from 33 requirements with fine granularity. Backend pipeline (Phases 1-4) built before auth (Phase 5) and iOS app (Phase 6). Enhancement features (Phases 7-9) layer on last.
- [01-01]: Node 20.19.5 required for Prisma 7 compatibility (added .nvmrc)
- [01-01]: rootDir/outDir must be in consuming tsconfig, not shared base configs
- [01-01]: pnpm 10.x requires onlyBuiltDependencies whitelist for build scripts
- [Phase 01]: Composite PK (id, detected_at) on detections -- required by TimescaleDB hypertable partitioning
- [Phase 01]: FK constraints on hypertable enforced at application layer via Prisma, not DB-level
- [Phase 01]: TimescaleDB bg workers minimum 16 (not 8) for latest-pg17 Docker image
- [Phase 01-03]: Swift enum raw values use UPPER_CASE to match backend enum values
- [Phase 01-03]: Sendable conformance and SWIFT_STRICT_CONCURRENCY=complete for Swift 6 safety
- [Phase 02-01]: TypeBox for Fastify route validation with compile-time type inference
- [Phase 02-01]: Soft delete sets station status to INACTIVE, preserving DB record per user decision
- [Phase 02-01]: Fastify plugin route pattern: routes/v1/{resource}/index.ts + schema.ts + handlers.ts
- [Phase 02-02]: MPEG-TS (.ts) container for segments -- maximum codec compatibility across heterogeneous stream sources
- [Phase 02-02]: Pino standalone logger for supervisor process (separate from Fastify built-in)
- [Phase 02-02]: Backoff timer respawns FFmpeg directly to preserve restartCount; only explicit restartStream resets counter
- [Phase 02-03]: BullMQ v5 upsertJobScheduler API for repeating cleanup jobs (not deprecated repeatable API)
- [Phase 02-03]: Cleanup worker integrated into supervisor lifecycle for coordinated startup/shutdown
- [Phase 03-01]: Apostrophe stripping in title/artist normalization for consistent deduplication matching
- [Phase 03-01]: Migration placeholder strategy: assign unique values to existing rows before creating unique index on new required column
- [Phase 03-01]: NoMatchCallback includes station FK constraint for referential integrity
- [Phase 03-02]: BullMQ Queue created per-plugin with Fastify onClose hook for graceful shutdown
- [Phase 03-02]: Handler uses dependency injection (Queue parameter) for testability with mocked BullMQ
- [Phase 03-03]: Title+artist fallback deduplication uses in-memory normalization comparison (not DB-level LOWER()) to avoid schema changes
- [Phase 03-03]: Duplicate detection callbacks caught via Prisma P2002 error code and skipped gracefully
- [Phase 03-03]: BullMQ worker concurrency set to 10 for I/O-bound DB writes per research recommendation
- [Phase 03-04]: No-match cleanup co-located with existing cleanup worker on shared BullMQ queue per research recommendation
- [Phase 03-04]: Detection worker shutdown ordered before cleanup worker in supervisor shutdown sequence
- [Phase 04-01]: Segment mtime-based timestamp resolution: file mtime is source of truth for segment time range (not filename numbering) due to segment_wrap cycling
- [Phase 04-01]: R2 client lazy validation: when SNIPPETS_ENABLED is false, r2Client is null and functions throw if called, avoiding startup crash
- [Phase 04-01]: FFmpeg -ss as input option (before -i) for fast seeking combined with re-encoding for sample-accurate extraction
- [Phase 04-01]: Temp file path uses os.tmpdir() with unique prefix per job to avoid conflicts between concurrent extractions
- [Phase 04-02]: Snippet queue injected from supervisor to detection worker via optional parameter (no circular deps)
- [Phase 04-02]: Snippet enqueue is best-effort with try/catch -- errors logged but do not fail detection processing
- [Phase 04-02]: Snippet worker shutdown ordered after detection worker but before cleanup worker in supervisor sequence
- [Phase 04-02]: Snippet URL endpoint unauthenticated for now -- auth middleware deferred to Phase 5
- [Phase 05-01]: argon2id with memoryCost 65536, timeCost 3, parallelism 1 for password hashing (OWASP recommended)
- [Phase 05-01]: Opaque refresh tokens stored in DB (crypto.randomBytes(32).hex), not JWT-format refresh tokens -- enables server-side revocation
- [Phase 05-01]: Invite code format XXXX-XXXX-XXXX (uppercase hex, 14 chars) -- human-readable for manual sharing
- [Phase 05-01]: vitest fileParallelism: false -- integration tests share a database, parallel execution causes FK violations
- [Phase 05-02]: Invitation code validation checks status, expiry, and usedCount < maxUses before allowing registration
- [Phase 05-02]: Opaque "Invalid credentials" for all login failure modes -- prevents user enumeration
- [Phase 05-02]: Refresh token rotation: old token revoked before new pair generated
- [Phase 05-02]: Logout handler uses generic FastifyRequest with body cast to avoid Fastify preHandler+schema type conflict
- [Phase 05-03]: Plugin-level addHook for authenticate+requireRole instead of per-route preHandler arrays for admin routes
- [Phase 05-03]: Scope filtering: STATION role checks stationId membership; ARTIST/LABEL roles allowed if any scope entry exists (deferred until entity models added)
- [Phase 05-03]: User deactivation + token revocation in Prisma $transaction for atomicity
- [Phase 05-03]: Scope update uses deleteMany + create in transaction for atomic replacement
- [Phase 05-04]: Vanilla HTML/JS/CSS admin dashboard with no build step -- zero complexity admin tool
- [Phase 05-04]: @fastify/static with decorateReply: false to avoid decorator conflicts
- [Phase 06-01]: Raw SQL via Prisma.$queryRaw for TimescaleDB continuous aggregate queries (Prisma ORM cannot query materialized views)
- [Phase 06-01]: BigInt cast via ::int in SQL to avoid JavaScript BigInt serialization issues
- [Phase 06-01]: Prisma.join() for parameterized IN clauses with station ID arrays (SQL injection safe)
- [Phase 06-01]: Cursor pagination uses id < cursor with descending order, fetch limit+1 to detect hasMore
- [Phase 06-01]: ISRC search uses case-insensitive equals (not contains) since ISRCs are exact codes
- [Phase 06-02]: @Observable macro (not ObservableObject/@Published) with .environment() for iOS 17+ modern SwiftUI
- [Phase 06-02]: AuthManager is @MainActor @Observable class for UI-safe property updates
- [Phase 06-02]: Single-flight refresh pattern coalesces concurrent 401 retries into one refresh call
- [Phase 06-02]: Auth-gated root view: ContentView checks isAuthenticated to show MainTabView or auth flow
- [Phase 06-03]: Swift Charts framework for play count trend (BarMark vertical) and top stations (BarMark horizontal) -- no third-party chart library
- [Phase 06-03]: ISO8601DateFormatter with fallback (with/without fractional seconds) for robust bucket date parsing
- [Phase 06-03]: .task(id: selectedPeriod) pattern triggers automatic reload when segmented control changes period
- [Phase 06-03]: async let parallel fetching for dashboard summary and top stations endpoints
- [Phase 06-04]: StationInfo nested struct added to AirplayEvent (optional) for included station name from API
- [Phase 06-04]: Search debounce via SwiftUI .task(id: searchQuery) with 300ms sleep -- auto-cancels previous tasks
- [Phase 06-04]: Infinite scroll triggers loadMore when item is within last 5 items via onAppear on Color.clear
- [Phase 06-04]: FilterChipsView uses sheet presentations for date range and station selection
- [Phase 06-04]: SearchView only triggers API calls when searchQuery is non-empty (no initial load)
- [Phase 06-05]: AVPlayer-based playback with periodic time observer (0.1s interval) for progress tracking
- [Phase 06-05]: AudioPlayerManager injected via .environment() at app root for single shared instance across all tabs
- [Phase 06-05]: SnippetPlayerView uses ProgressView with .scaleEffect(y: 0.5) for thin horizontal progress bar

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Legal exposure from storing copyrighted audio snippets under Romanian/EU law must be validated with a Romanian IP attorney before Phase 4 (Audio Snippet System) is executed. Design snippet storage to be easily disabled.
- [Research]: FFmpeg memory behavior at 200 concurrent processes needs benchmarking on target hardware during Phase 2.
- [Research]: ACRCloud callback latency and reliability under load needs empirical testing during Phase 3.

## Session Continuity

Last session: 2026-03-16T08:34:32Z
Stopped at: Completed 06-05-PLAN.md (Phase 6 complete)
Resume file: Phase 7 planning needed (07-01-PLAN.md)
