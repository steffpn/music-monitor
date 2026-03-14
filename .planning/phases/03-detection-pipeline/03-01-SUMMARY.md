---
phase: 03-detection-pipeline
plan: 01
subsystem: database, api
tags: [prisma, migration, normalization, typebox, bullmq, detection]

# Dependency graph
requires:
  - phase: 01-project-foundation
    provides: Prisma schema with Station, Detection, AirplayEvent models
  - phase: 02-stream-recording
    provides: BullMQ infrastructure, station CRUD routes, shared constants
provides:
  - acrcloudStreamId column on Station model for ACRCloud stream mapping
  - AirplayEvent.confidence column for highest-confidence metadata selection
  - NoMatchCallback model for lightweight no-result storage
  - normalizeTitle and normalizeArtist functions for deduplication matching
  - DETECTION_QUEUE constant for BullMQ queue naming
  - Station CRUD routes requiring acrcloudStreamId on create
affects: [03-detection-pipeline, 04-audio-snippets, 06-ios-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unicode NFKD normalization with diacritics stripping for text matching"
    - "Migration with placeholder values for existing rows when adding required unique columns"

key-files:
  created:
    - apps/api/src/lib/normalization.ts
    - apps/api/tests/lib/normalization.test.ts
    - apps/api/prisma/migrations/00000000000002_detection_pipeline_schema/migration.sql
  modified:
    - apps/api/prisma/schema.prisma
    - packages/shared/src/constants/index.ts
    - apps/api/src/routes/v1/stations/schema.ts
    - apps/api/src/routes/v1/stations/handlers.ts
    - apps/api/tests/routes/stations.test.ts
    - apps/api/tests/db/hypertable.test.ts

key-decisions:
  - "Apostrophe stripping in normalization for consistent artist matching (Carla's -> carlas)"
  - "Placeholder-based migration strategy: assign unique 'placeholder-{id}' values to existing rows before creating unique index"
  - "NoMatchCallback model includes station relation with FK constraint for referential integrity"

patterns-established:
  - "Unicode NFKD normalization: decompose -> strip diacritics -> lowercase -> domain-specific transforms -> collapse whitespace"
  - "Required unique column migration: ADD with DEFAULT -> UPDATE existing rows -> CREATE UNIQUE INDEX -> DROP DEFAULT"

requirements-completed: [DETC-01, DETC-02, DETC-03]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 3 Plan 1: Schema Migration, Normalization Utilities, and Station Route Update Summary

**Prisma schema extended with acrcloudStreamId, AirplayEvent.confidence, and NoMatchCallback model; normalization utilities for title/artist deduplication matching; station CRUD enforcing required ACRCloud stream ID**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T23:00:37Z
- **Completed:** 2026-03-14T23:07:40Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Prisma schema updated with acrcloudStreamId (required, unique) on Station, confidence on AirplayEvent, and NoMatchCallback model with indexes
- Tested normalizeTitle and normalizeArtist functions handling Romanian diacritics, parenthetical removal, separator normalization, and apostrophe stripping (17 tests)
- Station CRUD routes enforce required acrcloudStreamId on create with TypeBox validation
- DETECTION_QUEUE constant exported from shared package for cross-module BullMQ queue reference
- Full test suite green: 81 tests across 10 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalization tests (RED)** - `85d6965` (test)
2. **Task 1: Schema migration + normalization + constants (GREEN)** - `4f0bee6` (feat)
3. **Task 2: Station CRUD routes with acrcloudStreamId** - `31bed5d` (feat)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `apps/api/src/lib/normalization.ts` - normalizeTitle and normalizeArtist for deduplication matching
- `apps/api/tests/lib/normalization.test.ts` - 17 tests covering diacritics, brackets, separators, edge cases
- `apps/api/prisma/schema.prisma` - Added acrcloudStreamId, confidence, NoMatchCallback model
- `apps/api/prisma/migrations/00000000000002_detection_pipeline_schema/migration.sql` - Migration SQL for schema changes
- `packages/shared/src/constants/index.ts` - Added DETECTION_QUEUE constant
- `apps/api/src/routes/v1/stations/schema.ts` - Added acrcloudStreamId to create/update/response TypeBox schemas
- `apps/api/src/routes/v1/stations/handlers.ts` - Added acrcloudStreamId to create/bulk/list handlers
- `apps/api/tests/routes/stations.test.ts` - Updated all fixtures, added acrcloudStreamId validation test (18 tests)
- `apps/api/tests/db/hypertable.test.ts` - Fixed station create to include acrcloudStreamId

## Decisions Made
- Apostrophe stripping in normalization: ensures "Carla's Dreams" and "Carlas Dreams" produce identical match keys
- Migration uses placeholder values ("placeholder-{id}") for existing rows to satisfy unique constraint during column addition
- NoMatchCallback model includes station FK constraint for referential integrity (consistent with other models)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration failed due to duplicate empty default values**
- **Found during:** Task 1 (migration application)
- **Issue:** Multiple existing stations received default empty string for acrcloud_stream_id, preventing unique index creation
- **Fix:** Updated migration SQL to assign unique placeholder values ("placeholder-{id}") to existing rows before creating the unique index
- **Files modified:** apps/api/prisma/migrations/00000000000002_detection_pipeline_schema/migration.sql
- **Verification:** Migration applied successfully, unique index created
- **Committed in:** 4f0bee6 (Task 1 commit)

**2. [Rule 1 - Bug] Hypertable test missing required acrcloudStreamId**
- **Found during:** Task 2 (full test suite run)
- **Issue:** tests/db/hypertable.test.ts creates a station via Prisma without the now-required acrcloudStreamId field
- **Fix:** Added acrcloudStreamId with timestamp-based unique value to the test fixture
- **Files modified:** apps/api/tests/db/hypertable.test.ts
- **Verification:** Full test suite passes (81/81 tests)
- **Committed in:** 31bed5d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Prisma migrate deploy partially applied the migration (column added but index creation failed). Required manual completion of remaining SQL statements and `prisma migrate resolve --applied` to mark as complete.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- acrcloudStreamId on Station enables webhook handler to look up stations by ACRCloud stream ID
- NoMatchCallback table ready for no-result callback storage
- AirplayEvent.confidence column enables highest-confidence metadata selection during deduplication
- Normalization functions ready for fallback title+artist matching when ISRC is unavailable
- DETECTION_QUEUE constant available for BullMQ queue setup in detection worker
- All existing tests updated and passing with new schema requirements

## Self-Check: PASSED

All created files verified present. All commit hashes (85d6965, 4f0bee6, 31bed5d) confirmed in git log.

---
*Phase: 03-detection-pipeline*
*Completed: 2026-03-15*
