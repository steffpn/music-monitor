---
phase: 02-stream-recording-infrastructure
plan: 03
subsystem: infra
tags: [bullmq, cleanup-worker, docker, ffmpeg, segment-management, job-scheduler]

# Dependency graph
requires:
  - phase: 02-stream-recording-infrastructure
    provides: Station CRUD API with Redis pub/sub (Plan 01), FFmpeg supervisor with watchdog and StreamManager (Plan 02)
  - phase: 01-project-foundation
    provides: Prisma Station model, Redis client with createRedisConnection, Docker Compose with TimescaleDB and Redis
provides:
  - BullMQ segment cleanup worker deleting stale files older than 3 minutes on 30-second schedule
  - Orphaned directory cleanup for deleted/inactive stations
  - Docker Compose API service with FFmpeg and data volume mount
  - End-to-end verified stream recording pipeline (API -> supervisor -> FFmpeg -> segments -> health)
affects: [03-detection-pipeline, 04-audio-snippet-system]

# Tech tracking
tech-stack:
  added: [bullmq]
  patterns: [bullmq-job-scheduler, cleanup-worker, docker-multi-service, volume-mount-persistence]

key-files:
  created:
    - apps/api/src/workers/cleanup.ts
    - apps/api/tests/workers/cleanup.test.ts
    - apps/api/Dockerfile
  modified:
    - docker-compose.yml
    - apps/api/package.json
    - apps/api/src/services/supervisor/index.ts

key-decisions:
  - "BullMQ v5 upsertJobScheduler API for repeating jobs (not deprecated repeatable API)"
  - "Cleanup worker integrated into supervisor lifecycle for coordinated startup/shutdown"

patterns-established:
  - "BullMQ worker pattern: queue + worker + job scheduler with createRedisConnection for isolation"
  - "Docker multi-service pattern: API service with Dockerfile extending node:20 with system packages (FFmpeg)"

requirements-completed: [INFR-05]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 02 Plan 03: BullMQ Cleanup Worker and Docker Infrastructure Summary

**BullMQ segment cleanup worker on 30-second schedule deleting files older than 3 minutes, Docker Compose API service with FFmpeg and data volume, end-to-end verified stream recording pipeline**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T21:54:20Z
- **Completed:** 2026-03-15T00:00:00Z
- **Tasks:** 2 (1 TDD task + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- BullMQ cleanup worker using v5 upsertJobScheduler API running every 30 seconds to delete segment files older than 3 minutes
- Orphaned directory cleanup for stations no longer ACTIVE in the database (via Prisma query)
- Cleanup worker wired into supervisor lifecycle with coordinated startup and graceful shutdown
- Docker Compose updated with API service including FFmpeg, data/streams volume mount, and file descriptor ulimits
- End-to-end verification passed: station created via API -> pub/sub event -> supervisor spawns FFmpeg -> segment files appearing -> watchdog heartbeat updating
- 63 tests passing across 9 test files covering the full Phase 2 infrastructure

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): BullMQ cleanup worker tests** - `220b5ff` (test)
2. **Task 1 (GREEN): BullMQ cleanup worker and Docker infrastructure** - `1d8a1a1` (feat)
3. **Task 2: End-to-end stream recording verification** - checkpoint approved by human (no code commit)

_Note: TDD task with RED/GREEN commits. Human-verify checkpoint approved after E2E validation._

## Files Created/Modified
- `apps/api/src/workers/cleanup.ts` - BullMQ worker with job scheduler for segment file cleanup on 30-second interval
- `apps/api/tests/workers/cleanup.test.ts` - Unit tests for cleanup logic: stale file deletion, fresh file preservation, orphan directory cleanup, error handling
- `apps/api/Dockerfile` - Docker image extending node:20-bookworm-slim with FFmpeg installed
- `docker-compose.yml` - Added API service with Dockerfile, data/streams volume mount, and ulimits for file descriptors
- `apps/api/package.json` - Added bullmq dependency and cleanup npm script
- `apps/api/src/services/supervisor/index.ts` - Integrated cleanup worker startup and shutdown into supervisor lifecycle

## Decisions Made
- Used BullMQ v5 `upsertJobScheduler` API (not deprecated repeatable jobs API) for the 30-second cleanup schedule
- Cleanup worker runs within the supervisor process rather than as a standalone service, sharing the startup/shutdown lifecycle for operational simplicity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete stream recording infrastructure verified end-to-end: Station CRUD API, FFmpeg supervisor with watchdog, BullMQ cleanup worker, Docker Compose
- Ring buffer directory layout (`data/streams/{stationId}/segment-NNN.ts`) ready for Phase 3 detection pipeline to consume
- Phase 2 success criteria fully met: admin can add stations, segments recorded in rolling buffer, watchdog auto-restarts failed streams, health status visible, system designed for 200+ concurrent FFmpeg processes
- Ready for Phase 3: Detection Pipeline (ACRCloud webhook receiver, detection storage, deduplication)

## Self-Check: PASSED

All 6 files verified present on disk. Both task commits (220b5ff, 1d8a1a1) verified in git history.

---
*Phase: 02-stream-recording-infrastructure*
*Completed: 2026-03-15*
