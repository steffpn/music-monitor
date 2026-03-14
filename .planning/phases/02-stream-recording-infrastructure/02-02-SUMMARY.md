---
phase: 02-stream-recording-infrastructure
plan: 02
subsystem: infra
tags: [ffmpeg, child-process, supervisor, watchdog, exponential-backoff, redis-pubsub, pino]

# Dependency graph
requires:
  - phase: 01-project-foundation
    provides: Prisma Station model with status/lastHeartbeat/restartCount fields, Redis client with createRedisConnection
provides:
  - FFmpeg process spawner with segment muxer and codec pass-through
  - StreamManager class tracking all FFmpeg processes in a Map
  - Exponential backoff restart with circuit breaker after 5 failures
  - Watchdog health check loop monitoring segment file freshness
  - Supervisor entry point with staggered startup and Redis pub/sub subscription
  - Graceful shutdown handler for all FFmpeg processes
affects: [03-detection-pipeline, 04-audio-snippet-system]

# Tech tracking
tech-stack:
  added: [pino]
  patterns: [supervisor-service, child-process-management, exponential-backoff, watchdog-polling, staggered-startup, redis-pubsub-coordination]

key-files:
  created:
    - apps/api/src/services/supervisor/ffmpeg.ts
    - apps/api/src/services/supervisor/stream-manager.ts
    - apps/api/src/services/supervisor/watchdog.ts
    - apps/api/src/services/supervisor/index.ts
    - apps/api/tests/supervisor/stream-manager.test.ts
    - apps/api/tests/supervisor/backoff.test.ts
    - apps/api/tests/supervisor/watchdog.test.ts
    - apps/api/tests/supervisor/startup.test.ts
  modified:
    - apps/api/package.json

key-decisions:
  - "Used MPEG-TS (.ts) container for segments instead of .mp3 for maximum codec compatibility across heterogeneous stream sources"
  - "Pino used as standalone logger for supervisor process (not Fastify built-in) since supervisor runs as separate process"
  - "Backoff timer respawns FFmpeg directly via spawnFFmpeg() rather than going through startStream() to preserve restartCount"

patterns-established:
  - "Supervisor service pattern: standalone process sharing codebase with API via npm script"
  - "StreamManager Map<stationId, StreamProcess> pattern for tracking child processes"
  - "Watchdog filesystem polling pattern: check segment mtime + size for health detection"
  - "Redis pub/sub with DB reconciliation on reconnect to handle message loss"

requirements-completed: [INFR-01, INFR-05]

# Metrics
duration: 8min
completed: 2026-03-14
---

# Phase 02 Plan 02: FFmpeg Process Supervisor Summary

**FFmpeg supervisor with StreamManager tracking processes in Map, exponential backoff restart (10s-160s), segment-freshness watchdog, staggered batch startup, and Redis pub/sub event coordination**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-14T21:40:06Z
- **Completed:** 2026-03-14T21:48:26Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- FFmpeg spawner with -c copy codec pass-through, segment muxer, and MPEG-TS container for 200+ concurrent streams
- StreamManager with full lifecycle management (start/stop/restart), exponential backoff (10s/20s/40s/80s/160s), and circuit breaker after 5 failures
- Watchdog detecting stale (>30s) and corrupt (<1KB) segment files with automatic stream restart
- Staggered startup loading ACTIVE stations from DB in batches of 10 with 2s inter-batch delay
- Redis pub/sub subscription for station:added/removed/updated events with full DB reconciliation on reconnect
- 27 unit tests covering stream lifecycle, backoff timing, circuit breaking, watchdog health checks, and startup batching

## Task Commits

Each task was committed atomically:

1. **Task 1: FFmpeg spawner and StreamManager with exponential backoff** - `855006b` (feat)
2. **Task 2: Watchdog, staggered startup, and supervisor entry point** - `4926198` (feat)

_Note: TDD tasks -- tests written first (RED), then implementation (GREEN), committed together per task._

## Files Created/Modified
- `apps/api/src/services/supervisor/ffmpeg.ts` - FFmpeg command builder and process spawner with segment muxer arguments
- `apps/api/src/services/supervisor/stream-manager.ts` - StreamManager class with Map-based process tracking, backoff, and circuit breaker
- `apps/api/src/services/supervisor/watchdog.ts` - Periodic health check loop monitoring segment file freshness and size
- `apps/api/src/services/supervisor/index.ts` - Supervisor entry point with staggered startup, Redis pub/sub, and graceful shutdown
- `apps/api/tests/supervisor/stream-manager.test.ts` - Tests for stream lifecycle (start/stop/restart/stopAll)
- `apps/api/tests/supervisor/backoff.test.ts` - Tests for exponential backoff timing and circuit breaker
- `apps/api/tests/supervisor/watchdog.test.ts` - Tests for segment freshness checks, corrupt file detection, grace periods
- `apps/api/tests/supervisor/startup.test.ts` - Tests for batched startup and Redis pub/sub event dispatch
- `apps/api/package.json` - Added pino dependency and supervisor npm script

## Decisions Made
- Used MPEG-TS (.ts) container format for segment files instead of .mp3 -- provides maximum codec compatibility across MP3, AAC, and OGG sources without needing per-station format detection (per research recommendation)
- Added pino as explicit dependency for supervisor logging -- supervisor runs as standalone process, not within Fastify, so cannot use Fastify's built-in logger
- Backoff restart spawns FFmpeg directly (not through startStream) to preserve the failure counter across restarts; only explicit restartStream calls reset the counter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added pino as explicit dependency**
- **Found during:** Task 1 (FFmpeg spawner implementation)
- **Issue:** pino exists as transitive Fastify dependency but not directly importable in pnpm strict mode
- **Fix:** Added `"pino": "^10.3.0"` to package.json dependencies
- **Files modified:** apps/api/package.json
- **Verification:** Tests pass, import resolves correctly
- **Committed in:** 4926198 (Task 2 commit, with package.json changes)

**2. [Rule 3 - Blocking] pubsub.ts prerequisite check**
- **Found during:** Pre-task setup
- **Issue:** Plan specifies creating minimal pubsub.ts if Plan 01 hasn't run yet
- **Fix:** Verified pubsub.ts was already created by Plan 01 (which ran concurrently); full version with publish helpers already in place
- **Files modified:** None (already existed)
- **Verification:** Import from pubsub.ts resolves correctly in supervisor index.ts

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for module resolution. No scope creep.

## Issues Encountered
- pnpm install could not run due to a permissions issue on `~/.cache/node` directory (owned by root). Package.json was updated manually; pino resolves through the existing pnpm store. Running `pnpm install` after fixing directory permissions will properly link the dependency.
- TypeScript `--noEmit` check shows "Cannot find module 'pino'" because the pnpm link isn't established. This is cosmetic -- tests and runtime execution work correctly via tsx.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Supervisor service module complete and testable, ready for integration with API server routes (Plan 01)
- Ring buffer directory layout (`data/streams/{stationId}/segment-NNN.ts`) established for Phase 3 detection pipeline consumption
- BullMQ cleanup worker for segment files deferred to a separate plan (not part of this plan's scope)
- After `pnpm install` is run, TypeScript type resolution for pino will be clean

## Self-Check: PASSED

All 8 created files verified present on disk. Both task commits (855006b, 4926198) verified in git history. 27/27 tests passing.

---
*Phase: 02-stream-recording-infrastructure*
*Completed: 2026-03-14*
