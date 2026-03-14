---
phase: 03-detection-pipeline
plan: 02
subsystem: api
tags: [fastify, typebox, bullmq, webhook, acrcloud, authentication]

# Dependency graph
requires:
  - phase: 03-detection-pipeline
    plan: 01
    provides: DETECTION_QUEUE constant, acrcloudStreamId on Station model, Fastify route plugin pattern
  - phase: 02-stream-recording
    provides: BullMQ infrastructure, Redis connection factory, Fastify route patterns
provides:
  - ACRCloud webhook endpoint at POST /api/v1/webhooks/acrcloud
  - TypeBox validation schema for ACRCloud callback payload (AcrCloudCallbackSchema, AcrCloudCallbackBody)
  - Webhook handler with shared secret auth and BullMQ enqueue (handleAcrCloudCallback)
  - Fastify plugin for webhook route registration
affects: [03-detection-pipeline, 04-audio-snippets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook receive-and-enqueue: validate auth + schema, enqueue raw payload to BullMQ, return 200 immediately"
    - "Silent auth drop: return 200 on invalid auth to prevent endpoint confirmation (no information leak)"
    - "Dependency injection for testability: pass BullMQ Queue instance to handler function"

key-files:
  created:
    - apps/api/src/routes/v1/webhooks/acrcloud/schema.ts
    - apps/api/src/routes/v1/webhooks/acrcloud/handlers.ts
    - apps/api/src/routes/v1/webhooks/acrcloud/index.ts
    - apps/api/tests/routes/webhooks-acrcloud.test.ts
  modified:
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "BullMQ Queue created per-plugin with graceful shutdown via Fastify onClose hook"
  - "Handler uses dependency injection (Queue parameter) for testability with mocked BullMQ"

patterns-established:
  - "Webhook route pattern: schema validation at Fastify level, auth check in handler, enqueue-only (no processing)"
  - "BullMQ mock pattern: vi.mock('bullmq') with mock Queue.add for testing without Redis"

requirements-completed: [DETC-01]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 3 Plan 2: ACRCloud Webhook Route Summary

**Fastify webhook endpoint at POST /api/v1/webhooks/acrcloud with TypeBox validation, shared secret auth (silent 200 on failure), and BullMQ enqueue for async detection processing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T23:11:33Z
- **Completed:** 2026-03-14T23:14:21Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- TypeBox schema validating full ACRCloud callback envelope including success (code 0) and no-result (code 1001) structures
- Webhook handler with X-ACR-Secret shared secret authentication; invalid/missing auth silently returns 200 (no information leak)
- Valid callbacks enqueued to BullMQ "detection-processing" queue with job name "process-callback" and cleanup limits (removeOnComplete: 1000, removeOnFail: 5000)
- 12 comprehensive tests covering auth, validation, enqueue behavior, and response format
- Full test suite green (93/93 tests across 11 test files, excluding pre-existing 03-03 RED tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Webhook tests (failing)** - `572254e` (test)
2. **Task 1 GREEN: Webhook implementation** - `31b9e36` (feat)

_Note: TDD task with RED/GREEN commits_

## Files Created/Modified
- `apps/api/src/routes/v1/webhooks/acrcloud/schema.ts` - TypeBox schemas for ACRCloud callback payload (AcrCloudCallbackSchema, AcrCloudCallbackBody)
- `apps/api/src/routes/v1/webhooks/acrcloud/handlers.ts` - handleAcrCloudCallback with auth check and BullMQ enqueue
- `apps/api/src/routes/v1/webhooks/acrcloud/index.ts` - Fastify plugin creating BullMQ Queue and registering POST route
- `apps/api/src/routes/v1/index.ts` - Added webhook route registration under /webhooks/acrcloud prefix
- `apps/api/tests/routes/webhooks-acrcloud.test.ts` - 12 tests for auth, validation, enqueue, and response behaviors

## Decisions Made
- BullMQ Queue created inside the Fastify plugin with onClose hook for graceful shutdown, rather than passed from outside
- Handler accepts Queue via dependency injection parameter for testability without Redis
- vi.mock('bullmq') pattern for mocking Queue.add in tests without requiring a live Redis connection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The ACRCLOUD_WEBHOOK_SECRET environment variable will need to be set in production but is handled via test setup for now.

## Next Phase Readiness
- Webhook endpoint ready to receive ACRCloud callbacks at POST /api/v1/webhooks/acrcloud
- Raw callbacks are enqueued to "detection-processing" BullMQ queue for async processing
- Plan 03-03 (Detection Worker) will consume these enqueued jobs to create Detection records and AirplayEvent aggregates
- TypeBox schema handles both success and no-result callback structures

## Self-Check: PASSED

All created files verified present. All commit hashes (572254e, 31b9e36) confirmed in git log.

---
*Phase: 03-detection-pipeline*
*Completed: 2026-03-15*
