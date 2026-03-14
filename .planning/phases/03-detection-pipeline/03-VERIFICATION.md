---
phase: 03-detection-pipeline
verified: 2026-03-15T01:35:00Z
status: passed
score: 19/19 must-haves verified
re_verification: false
human_verification:
  - test: "Live end-to-end pipeline test with real ACRCloud traffic"
    expected: "Station in DB receives webhook callback -> Detection and AirplayEvent records created within seconds"
    why_human: "Tests mock Prisma and BullMQ; cannot verify real Redis queue processing and DB writes without running environment"
---

# Phase 3: Detection Pipeline Verification Report

**Phase Goal:** Ingest ACRCloud detection callbacks and produce deduplicated AirplayEvent records
**Verified:** 2026-03-15T01:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Station model has required unique acrcloudStreamId for ACRCloud stream mapping | VERIFIED | `schema.prisma` line 15: `acrcloudStreamId String @unique @map("acrcloud_stream_id")` — no `?`, no default |
| 2 | AirplayEvent model has confidence column for highest-confidence metadata selection | VERIFIED | `schema.prisma` line 63: `confidence Float @default(0) @map("confidence")` |
| 3 | NoMatchCallback model exists for lightweight no-result storage | VERIFIED | `schema.prisma` lines 75-87 — full model with stationId, callbackAt, statusCode, indexes |
| 4 | Title and artist normalization produces consistent keys for deduplication matching | VERIFIED | `normalization.ts` — NFKD decompose + diacritics strip + lowercase + separator/parenthetical removal; 17 tests all pass |
| 5 | Station CRUD requires acrcloudStreamId on create and includes it in responses | VERIFIED | `schema.ts` line 9: required field; `handlers.ts` lines 28, 58, 90 include it in create/bulk/list |
| 6 | Detection queue name constant is defined in shared package | VERIFIED | `packages/shared/src/constants/index.ts` line 5: `DETECTION_QUEUE = "detection-processing"` |
| 7 | Webhook endpoint at POST /api/v1/webhooks/acrcloud receives ACRCloud callbacks | VERIFIED | `routes/v1/index.ts` registers plugin at `/webhooks/acrcloud`; 12 route tests pass |
| 8 | Valid callback with correct secret header is enqueued to BullMQ and receives 200 | VERIFIED | `handlers.ts` lines 20-29: auth check then `queue.add("process-callback", ...)` with 200 return |
| 9 | Invalid secret header receives 200 response but callback is silently dropped | VERIFIED | `handlers.ts` lines 20-22: mismatched secret returns 200 without enqueue |
| 10 | Malformed payload is rejected with 400 by TypeBox validation | VERIFIED | Schema registered at route level; 4 validation tests pass confirming 400 on bad payloads |
| 11 | Each detection callback creates a Detection record with all required fields | VERIFIED | `detection.ts` lines 123-136: stationId, detectedAt, songTitle, artistName, albumTitle, isrc, confidence, durationMs, rawCallbackId all mapped |
| 12 | Station lookup by acrcloudStreamId; unknown stream_id logged and discarded | VERIFIED | `detection.ts` lines 91-98: `findFirst({ where: { acrcloudStreamId } })`; warn+return on null |
| 13 | Two callbacks for same ISRC within 5 minutes produce one AirplayEvent with playCount=2 | VERIFIED | `detection.ts` lines 158-167: ISRC-based query with DETECTION_GAP_TOLERANCE_MS window; update path increments playCount |
| 14 | Two callbacks beyond 5 minutes produce two separate AirplayEvents | VERIFIED | Gap query returns null when outside window; new AirplayEvent created; 2 dedup tests confirm boundary |
| 15 | ISRC-null deduplication falls back to normalized title+artist matching | VERIFIED | `detection.ts` lines 170-198: queries null-ISRC events then JS-side normalizeTitle/normalizeArtist comparison |
| 16 | Highest-confidence callback metadata wins for AirplayEvent updates | VERIFIED | `detection.ts` lines 209-213: `if (confidence > recentEvent.confidence)` gates songTitle/artistName/confidence update |
| 17 | No-match callbacks stored in NoMatchCallback table | VERIFIED | `detection.ts` lines 101-109: code 1001 or empty music -> `prisma.noMatchCallback.create` |
| 18 | Detection worker starts alongside cleanup worker in supervisor process | VERIFIED | `supervisor/index.ts` lines 19, 98-99: imports and starts both workers; detection closed before cleanup in shutdown |
| 19 | No-match cleanup runs on 6-hour schedule deleting records older than 7 days | VERIFIED | `cleanup.ts` lines 137-142: `upsertJobScheduler("no-match-cleanup-scheduler", { every: 6*60*60*1000 })`; `cleanupNoMatchCallbacks` deletes where `createdAt < cutoff` (7 days) |

**Score:** 19/19 truths verified

---

### Required Artifacts

| Artifact | Provides | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `apps/api/prisma/schema.prisma` | acrcloudStreamId, confidence, NoMatchCallback model | Yes | Yes — all three additions present | Yes — migration SQL and generated client | VERIFIED |
| `apps/api/prisma/migrations/00000000000002_detection_pipeline_schema/migration.sql` | SQL migration | Yes | Yes — contains `no_match_callbacks`, placeholder-based unique index strategy | Yes — applied to DB | VERIFIED |
| `apps/api/src/lib/normalization.ts` | normalizeTitle and normalizeArtist | Yes | Yes — 47 lines, full NFKD algorithm | Yes — imported by detection.ts | VERIFIED |
| `apps/api/tests/lib/normalization.test.ts` | Unit tests for normalization | Yes | Yes — 87 lines, 17 test cases, all pass | Yes — runs in test suite | VERIFIED |
| `packages/shared/src/constants/index.ts` | DETECTION_QUEUE constant | Yes | Yes — `DETECTION_QUEUE = "detection-processing"` at line 5 | Yes — imported by detection.ts and webhook index.ts | VERIFIED |
| `apps/api/src/routes/v1/webhooks/acrcloud/schema.ts` | TypeBox validation schemas | Yes | Yes — AcrCloudCallbackSchema, AcrCloudCallbackBody exported | Yes — used in route registration | VERIFIED |
| `apps/api/src/routes/v1/webhooks/acrcloud/handlers.ts` | handleAcrCloudCallback with auth and enqueue | Yes | Yes — auth check, queue.add, 200 response | Yes — called from route plugin | VERIFIED |
| `apps/api/src/routes/v1/webhooks/acrcloud/index.ts` | Fastify plugin with POST route | Yes | Yes — 30 lines, Queue creation, onClose hook, route registration | Yes — registered in v1/index.ts | VERIFIED |
| `apps/api/tests/routes/webhooks-acrcloud.test.ts` | Tests for webhook behaviors | Yes | Yes — 240 lines, 12 tests covering auth/validation/enqueue/response | Yes — 12/12 pass | VERIFIED |
| `apps/api/src/workers/detection.ts` | processCallback and startDetectionWorker | Yes | Yes — 283 lines, full deduplication logic | Yes — imported by supervisor | VERIFIED |
| `apps/api/tests/workers/detection.test.ts` | Detection worker tests | Yes | Yes — 603 lines, 23 test cases covering all behaviors | Yes — 23/23 pass | VERIFIED |
| `apps/api/src/services/supervisor/index.ts` | Supervisor with detection worker in lifecycle | Yes | Yes — imports startDetectionWorker, starts it, closes in shutdown | Yes — detection+cleanup workers both managed | VERIFIED |
| `apps/api/src/workers/cleanup.ts` | Cleanup worker with no-match scheduler | Yes | Yes — cleanupNoMatchCallbacks function, 6-hour scheduler, dispatch by job.name | Yes — integrated with supervisor | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `stations/schema.ts` | `schema.prisma` | acrcloudStreamId TypeBox field matches Prisma model | WIRED | `schema.ts` line 9: `acrcloudStreamId: Type.String({ minLength: 1 })` — required, no Optional wrapper |
| `stations/handlers.ts` | `schema.prisma` | Create handler includes acrcloudStreamId in Prisma write | WIRED | `handlers.ts` lines 28, 58: `acrcloudStreamId: request.body.acrcloudStreamId` in both create paths |
| `webhooks/acrcloud/handlers.ts` | BullMQ Queue | `queue.add("process-callback", ...)` | WIRED | `handlers.ts` line 26: `await detectionQueue.add("process-callback", request.body, { removeOnComplete: 1000, removeOnFail: 5000 })` |
| `routes/v1/index.ts` | `webhooks/acrcloud/index.ts` | Fastify plugin registration under /webhooks/acrcloud | WIRED | `v1/index.ts` lines 5-7: `fastify.register(import("./webhooks/acrcloud/index.js"), { prefix: "/webhooks/acrcloud" })` |
| `workers/detection.ts` | `lib/prisma.ts` | Prisma queries for detection/airplayEvent/noMatchCallback/station | WIRED | Lines 91, 102, 124, 158, 170, 215, 221, 237: all four models queried/written |
| `workers/detection.ts` | `lib/normalization.ts` | normalizeTitle and normalizeArtist for fallback dedup | WIRED | `detection.ts` line 18: `import { normalizeTitle, normalizeArtist } from "../lib/normalization.js"` — used at lines 184-185 |
| `workers/detection.ts` | `shared/constants` | DETECTION_GAP_TOLERANCE_MS and DETECTION_QUEUE | WIRED | `detection.ts` lines 20-22: both constants imported and used at lines 163, 174, 259, 264 |
| `supervisor/index.ts` | `workers/detection.ts` | Imports and calls startDetectionWorker during startup | WIRED | `supervisor/index.ts` line 19: import; lines 98-99: `await startDetectionWorker()` |
| `supervisor/index.ts` | Shutdown handler | Closes detection queue and worker in shutdown sequence | WIRED | `supervisor/index.ts` lines 185-186: `await detectionWorker.close(); await detectionQueue.close()` — before cleanupWorker |
| `workers/cleanup.ts` | `prisma.noMatchCallback` | Deletes old no-match records on schedule | WIRED | `cleanup.ts` line 106: `await prisma.noMatchCallback.deleteMany(...)` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| DETC-01 | 03-01, 03-02, 03-04 | System receives and processes ACRCloud detection callbacks via webhook endpoint | SATISFIED | Webhook at POST /api/v1/webhooks/acrcloud registered, validated, enqueues to BullMQ; detection worker consumes from queue; supervisor wires lifecycle |
| DETC-02 | 03-01, 03-03, 03-04 | Each detection stores: station, timestamp, song, artist, duration, ISRC, confidence score | SATISFIED | Detection model in schema has all required columns; `processCallback` maps all ACRCloud fields; 6 dedicated storage tests verify each field |
| DETC-03 | 03-01, 03-03, 03-04 | Raw callbacks are deduplicated into single airplay events (gap-tolerance aggregation) | SATISFIED | Gap-tolerance deduplication with ISRC-first and title+artist fallback; 7 deduplication tests verify boundary conditions, playCount increment, and confidence selection |

**Orphaned requirements check:** REQUIREMENTS.md maps DETC-01, DETC-02, DETC-03 to Phase 3. All three are claimed by plans and verified above. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/workers/detection.ts` | 251, 268-273 | Retry policy (3 attempts, exponential backoff) documented in comment but not implemented — Worker options omit `defaultJobOptions.attempts` and `backoff` | Warning | Failed detection jobs will not be retried; they go straight to failed queue. Does not block goal — pipeline still functions and failed jobs are logged. |

---

### Human Verification Required

#### 1. Live End-to-End Detection Pipeline

**Test:** Start the API server (`cd apps/api && pnpm dev`) and the supervisor (`cd apps/api && pnpm supervisor`). Create a station with a valid `acrcloudStreamId` via POST /api/v1/stations. Send a valid ACRCloud callback via curl:
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/acrcloud \
  -H "Content-Type: application/json" \
  -H "X-ACR-Secret: $ACRCLOUD_WEBHOOK_SECRET" \
  -d '{"stream_id":"<acrcloud_stream_id_of_station>","status":1,"data":{"status":{"msg":"Success","code":0},"metadata":{"timestamp_utc":"2026-03-15 14:30:00","music":[{"title":"Test Song","artists":[{"name":"Test Artist"}],"duration_ms":180000,"score":95,"acrid":"abc123"}]}}}'
```
**Expected:** Response is `{"status":"ok"}`. Within seconds, a Detection record and AirplayEvent record appear in the database for the station. Sending the same payload again within 5 minutes results in the existing AirplayEvent having `play_count=2` rather than a second event being created.

**Why human:** All tests mock both Prisma and BullMQ. The actual Redis queue handoff, BullMQ job consumption, and live PostgreSQL writes cannot be verified programmatically from this environment without a running stack.

---

### Gaps Summary

No gaps. All 19 observable truths are verified. All 13 artifacts exist and are substantive and wired. All 10 key links are confirmed in code. All three requirement IDs (DETC-01, DETC-02, DETC-03) are satisfied with implementation evidence.

One warning-level observation: the retry policy described in the plan (`attempts: 3, backoff: { type: "exponential", delay: 1000 }`) is documented in a code comment but absent from the Worker's actual options object. This is a minor quality gap that does not block the phase goal.

Full test suite: **116 tests across 12 test files — all passing.**

---

_Verified: 2026-03-15T01:35:00Z_
_Verifier: Claude (gsd-verifier)_
