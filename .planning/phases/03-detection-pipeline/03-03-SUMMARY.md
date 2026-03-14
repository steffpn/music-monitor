---
phase: 03-detection-pipeline
plan: 03
subsystem: api, workers
tags: [bullmq, detection, deduplication, acrcloud, prisma, vitest]

# Dependency graph
requires:
  - phase: 03-detection-pipeline
    plan: 01
    provides: Prisma schema with acrcloudStreamId, NoMatchCallback, AirplayEvent.confidence, normalization functions, DETECTION_QUEUE constant
  - phase: 02-stream-recording
    provides: BullMQ infrastructure, cleanup worker pattern, Redis connection factory
provides:
  - processCallback function that transforms ACRCloud callbacks into Detection records
  - Gap-tolerance deduplication producing AirplayEvent aggregates with accurate playCount
  - ISRC-first matching with normalized title+artist fallback for deduplication
  - Highest-confidence metadata selection for AirplayEvent updates
  - No-match callback storage in NoMatchCallback table
  - startDetectionWorker BullMQ lifecycle (concurrency 10, exponential backoff retry)
affects: [03-detection-pipeline, 04-audio-snippets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gap-tolerance deduplication: ISRC-first match, title+artist fallback, 5min window, playCount increment"
    - "ISRC normalization: array -> first element, string -> direct, null -> null"
    - "Confidence-based metadata selection: higher score/100 updates AirplayEvent title/artist"
    - "Idempotent detection insert: catch P2002 unique constraint on rawCallbackId and skip"

key-files:
  created:
    - apps/api/src/workers/detection.ts
    - apps/api/tests/workers/detection.test.ts
  modified: []

key-decisions:
  - "Title+artist fallback deduplication uses in-memory normalization comparison (not DB-level LOWER()) to avoid schema changes"
  - "Duplicate detection callbacks caught via Prisma P2002 error code and skipped gracefully"
  - "BullMQ worker concurrency set to 10 for I/O-bound DB writes per research recommendation"

patterns-established:
  - "Detection processing pattern: station lookup -> no-match check -> detection create -> dedup upsert -> heartbeat update"
  - "Prisma mock proxy pattern: top-level vi.fn() referenced via proxy in vi.mock factory to survive vi.clearAllMocks"

requirements-completed: [DETC-02, DETC-03]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 3 Plan 3: Detection Processing Worker Summary

**Detection worker with gap-tolerance deduplication transforming ACRCloud callbacks into Detection records and AirplayEvent aggregates using ISRC-first matching with title+artist fallback**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T23:11:47Z
- **Completed:** 2026-03-14T23:14:46Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- processCallback correctly maps all ACRCloud fields to Detection model columns (title, artist, album, ISRC, confidence, duration, rawCallbackId)
- Gap-tolerance deduplication produces accurate AirplayEvent aggregates: same song within 5 minutes increments playCount, beyond 5 minutes creates separate events
- ISRC-first matching with normalized title+artist fallback when ISRC is null handles Romanian diacritics and separator variations
- Highest-confidence callback metadata wins for AirplayEvent songTitle/artistName/confidence
- No-match callbacks (code 1001 or empty music array) stored in NoMatchCallback table
- Station lastHeartbeat updated on each successful detection for health monitoring
- 23 comprehensive tests covering station lookup, detection storage, deduplication, no-match handling, idempotency, and worker lifecycle
- Full test suite green: 116 tests across 12 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Detection worker tests (RED)** - `9a44637` (test)
2. **Task 2: Detection worker implementation (GREEN)** - `67c3fdd` (feat)

_Note: TDD plan with RED/GREEN commits_

## Files Created/Modified
- `apps/api/src/workers/detection.ts` - Detection processing worker with processCallback and startDetectionWorker exports
- `apps/api/tests/workers/detection.test.ts` - 23 tests covering all detection processing behaviors and edge cases

## Decisions Made
- Title+artist fallback dedup queries AirplayEvents by station + null ISRC + gap window, then filters in JS via normalizeTitle/normalizeArtist comparison -- avoids schema changes while handling all normalization edge cases
- Duplicate rawCallbackId handled by catching Prisma P2002 unique constraint error and continuing (no retry, no throw)
- Worker concurrency=10 for I/O-bound DB operations, with removeOnComplete: 1000 and removeOnFail: 5000

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - tests passed on first implementation attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Detection worker ready for integration with webhook route (Plan 02) and supervisor lifecycle (Plan 04)
- processCallback export available for BullMQ job processor wiring
- startDetectionWorker export follows cleanup worker pattern for supervisor integration
- All deduplication edge cases tested: ISRC match, title+artist fallback, gap tolerance boundary, confidence selection

## Self-Check: PASSED

All created files verified present. All commit hashes (9a44637, 67c3fdd) confirmed in git log.

---
*Phase: 03-detection-pipeline*
*Completed: 2026-03-15*
