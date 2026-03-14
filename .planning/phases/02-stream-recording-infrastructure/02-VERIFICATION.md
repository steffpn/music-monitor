---
phase: 02-stream-recording-infrastructure
verified: 2026-03-15T00:00:00Z
status: human_needed
score: 14/15 must-haves verified
re_verification: false
human_verification:
  - test: "Run all Phase 2 tests: pnpm --filter api test"
    expected: "All 63 tests pass across 9 test files"
    why_human: "Tests require live Redis and Postgres connections not available in verification context"
  - test: "Start the full stack with docker compose up -d, then pnpm --filter api dev, then cd apps/api && pnpm supervisor. Create a test station via curl and verify segment files appear in data/streams/{id}/"
    expected: "201 response with ACTIVE status, then segment-NNN.ts files appearing within 15-20 seconds"
    why_human: "End-to-end recording flow requires FFmpeg, running Redis, and live stream URL — cannot verify with grep"
  - test: "Kill the FFmpeg process for a station mid-recording (kill <pid>), wait 10-20 seconds"
    expected: "Supervisor restarts stream with backoff delay; station status returns to ACTIVE; restartCount increments"
    why_human: "Process crash recovery requires runtime observation"
  - test: "Simulate a stream stall (block outbound traffic to stream URL for 35+ seconds)"
    expected: "Watchdog detects stale segments and triggers restart within 40 seconds"
    why_human: "Watchdog behavior requires live FFmpeg and filesystem observation over time"
---

# Phase 2: Stream Recording Infrastructure Verification Report

**Phase Goal:** The system reliably records audio from 200+ radio/TV streams around the clock with automatic failure recovery
**Verified:** 2026-03-15
**Status:** human_needed (all automated checks passed, runtime behaviors need human verification)
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Admin can create a station via POST /api/v1/stations and the system publishes a station:added event | VERIFIED | `handlers.ts:38` calls `publishStationEvent(CHANNELS.STATION_ADDED, event)` after `prisma.station.create`; route registered at `index.ts:35` via `server.register` |
| 2  | Admin can create multiple stations via POST /api/v1/stations/bulk | VERIFIED | `handlers.ts:47-76` implements `createStationsBulk` with `prisma.$transaction`; route registered in `stations/index.ts:34` |
| 3  | Admin can update a station via PATCH /api/v1/stations/:id which publishes station:updated event | VERIFIED | `handlers.ts:120-146` calls `prisma.station.update` then `publishStationEvent(CHANNELS.STATION_UPDATED, event)` |
| 4  | Admin can soft-delete a station via DELETE /api/v1/stations/:id which publishes station:removed event | VERIFIED | `handlers.ts:152-176` sets `status: "INACTIVE"` then `publishStationEvent(CHANNELS.STATION_REMOVED, event)` |
| 5  | Admin can list all stations with health status via GET /api/v1/stations | VERIFIED | `handlers.ts:81-96` uses `prisma.station.findMany` selecting `status`, `lastHeartbeat`, `restartCount` |
| 6  | Supervisor spawns an FFmpeg process for a station and it produces segment files in data/streams/{station-id}/ | VERIFIED (code) / HUMAN NEEDED (runtime) | `ffmpeg.ts:36-83` creates directory and spawns FFmpeg with `-f segment -segment_time 10 -segment_wrap 20`; actual file production needs runtime check |
| 7  | When an FFmpeg process crashes, the supervisor restarts it with exponential backoff | VERIFIED (code) | `stream-manager.ts:143-218` implements `handleStreamFailure` with `10000 * 2^(restartCount-1)` formula; backoff tests exist |
| 8  | After 5 consecutive failures, the station is marked as ERROR and no more restarts are attempted | VERIFIED | `stream-manager.ts:157-178` checks `restartCount >= MAX_RESTARTS (5)`, updates DB `status: "ERROR"`, returns without scheduling timer |
| 9  | When a segment directory has no new file modifications for 30 seconds, the watchdog restarts the stream | VERIFIED (code) / HUMAN NEEDED (runtime) | `watchdog.ts:154-161` checks `age > staleThresholdMs (30_000)` and calls `streamManager.restartStream` |
| 10 | On startup, supervisor loads all ACTIVE stations from DB and starts them in batches of 10 with 2-second delays | VERIFIED | `index.ts:61-85` queries `{ where: { status: "ACTIVE" } }`, loops in `STARTUP_BATCH_SIZE = 10` batches with `STARTUP_BATCH_DELAY_MS = 2_000` |
| 11 | Supervisor subscribes to Redis pub/sub and reacts to station:added, station:removed, station:updated events | VERIFIED | `index.ts:97-134` calls `subscriber.subscribe(...)` and dispatches `station:added`→`startStream`, `station:removed`→`stopStream`, `station:updated`→stop+restart |
| 12 | BullMQ cleanup worker deletes segment files older than 3 minutes from all station directories | VERIFIED | `cleanup.ts:59` checks `Date.now() - stat.mtimeMs > MAX_AGE_MS (3 * 60 * 1000)` and calls `fs.unlink` |
| 13 | Cleanup worker runs on a 30-second schedule via BullMQ job scheduler | VERIFIED | `cleanup.ts:112-115` calls `queue.upsertJobScheduler("cleanup-scheduler", { every: 30_000 }, ...)` |
| 14 | Orphaned directories from deleted stations are cleaned up | VERIFIED | `cleanup.ts:75-87` removes empty directories when station is not ACTIVE in DB |
| 15 | Docker Compose includes FFmpeg in the API/supervisor container and mounts data/streams as a volume | VERIFIED | `apps/api/Dockerfile:5` installs `ffmpeg` via apt; `docker-compose.yml:42,63` mounts `./data/streams:/app/data/streams` on both api and supervisor services |

**Score:** 14/15 truths fully verified in code (1 requires human runtime confirmation for end-to-end behavior)

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/lib/pubsub.ts` | Redis pub/sub channel definitions and publish helpers | VERIFIED | 32 lines; exports `CHANNELS`, `StationEvent`, `publishStationEvent`; calls `redis.publish` |
| `apps/api/src/routes/v1/stations/schema.ts` | TypeBox schemas for station CRUD validation | VERIFIED | 50 lines; exports `StationCreateSchema`, `StationBulkCreateSchema`, `StationUpdateSchema`, `StationResponseSchema`, `StationParamsSchema` |
| `apps/api/src/routes/v1/stations/handlers.ts` | Route handler functions for station CRUD | VERIFIED | 176 lines; exports all 6 handlers with full Prisma + pub/sub implementation |
| `apps/api/src/routes/v1/stations/index.ts` | Fastify plugin registering all station routes | VERIFIED | 78 lines; registers POST /`, POST /bulk, GET /, GET /:id, PATCH /:id, DELETE /:id |
| `apps/api/src/routes/v1/index.ts` | Top-level v1 route plugin | VERIFIED | 7 lines; registers stations plugin under `/stations` prefix |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/services/supervisor/ffmpeg.ts` | FFmpeg command builder and process spawner | VERIFIED | 84 lines; exports `DATA_DIR` and `spawnFFmpeg`; uses all required FFmpeg args including `-reconnect`, `-c copy`, `-f segment`, `-segment_wrap 20` |
| `apps/api/src/services/supervisor/stream-manager.ts` | StreamManager class tracking FFmpeg processes | VERIFIED | 264 lines; exports `StreamManager` and `StreamProcess`; implements exponential backoff and circuit breaker |
| `apps/api/src/services/supervisor/watchdog.ts` | Watchdog health check loop | VERIFIED | 181 lines; exports `Watchdog` and `getLatestSegmentMtime`; checks mtime and file size |
| `apps/api/src/services/supervisor/index.ts` | Supervisor entry point | VERIFIED | 202 lines; exports `startSupervisor`; implements staggered startup, pub/sub subscription, reconciliation on reconnect, graceful shutdown |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/workers/cleanup.ts` | BullMQ cleanup worker | VERIFIED | 135 lines; exports `startCleanupWorker` and `cleanupSegments`; uses BullMQ v5 `upsertJobScheduler` API |
| `apps/api/tests/workers/cleanup.test.ts` | Unit tests for cleanup worker | VERIFIED | 289 lines; tests stale file deletion, fresh file preservation, orphan cleanup, error handling |
| `docker-compose.yml` | Updated Docker Compose with FFmpeg and data volume | VERIFIED | 76 lines; api and supervisor services with `apps/api/Dockerfile` (contains FFmpeg), `./data/streams:/app/data/streams` volume, and `ulimits.nofile: 65536` |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stations/handlers.ts` | `lib/pubsub.ts` | `publishStationEvent` after each CRUD mutation | WIRED | Lines 38, 72, 143, 173 call `publishStationEvent` with `CHANNELS.STATION_ADDED/UPDATED/REMOVED` |
| `apps/api/src/index.ts` | `routes/v1/index.ts` | `server.register` with prefix `/api/v1` | WIRED | `index.ts:35`: `server.register(import("./routes/v1/index.js"), { prefix: "/api/v1" })` |
| `stations/handlers.ts` | `lib/prisma.ts` | `prisma.station` CRUD operations | WIRED | Lines 23, 53, 82, 105, 125, 133, 156, 164 use `prisma.station.create/findMany/findUnique/update` |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stream-manager.ts` | `ffmpeg.ts` | `spawnFFmpeg` call in `startStream` | WIRED | Lines 11 (import), 66, 194 call `spawnFFmpeg(stationId, streamUrl)` |
| `watchdog.ts` | `stream-manager.ts` | `restartStream` when stale segment detected | WIRED | Lines 146, 160 call `this.streamManager.restartStream(stream.stationId)` |
| `supervisor/index.ts` | `lib/pubsub.ts` | Redis subscriber reacting to station events | WIRED | Line 104: `subscriber.on("message", ...)` dispatches to `startStream`/`stopStream` |
| `stream-manager.ts` | `lib/prisma.ts` | Station status and heartbeat updates | WIRED | Lines 86, 231 call `prisma.station.update` for ACTIVE/ERROR status and restartCount |

### Plan 03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `workers/cleanup.ts` | `lib/redis.ts` | `createRedisConnection` for BullMQ | WIRED | Lines 13 (import), 108, 125 use `createRedisConnection()` for queue and worker connections |
| `supervisor/index.ts` | `workers/cleanup.ts` | `startCleanupWorker` called in supervisor | WIRED | Lines 18 (import), 93-94 call `await startCleanupWorker()` and wire shutdown into graceful shutdown |
| `docker-compose.yml` | `data/streams` | Docker volume mount for segment persistence | WIRED | Lines 42, 63: `./data/streams:/app/data/streams` on both api and supervisor services |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFR-01 | Plan 02 | Backend monitors 200+ Romanian radio/TV streams 24/7 via FFmpeg process supervisor | SATISFIED | `StreamManager` + `Watchdog` + staggered startup for 200+ streams; `spawnFFmpeg` with `-reconnect` args for 24/7 reliability; `handleStreamFailure` with exponential backoff |
| INFR-02 | Plan 01 | Admin can add, edit, and remove stations with stream URLs | SATISFIED | Full CRUD at `/api/v1/stations`: create, bulk create, list, get, update (PATCH), soft-delete (DELETE sets INACTIVE) |
| INFR-05 | Plans 02 + 03 | Stream health monitoring with per-stream watchdog and automatic restart on failure | SATISFIED | `Watchdog` class checks segment freshness every 10s and triggers restart on >30s stale; exponential backoff (10s/20s/40s/80s/160s); circuit breaker at 5 failures; `BullMQ` cleanup worker as safety net |

All 3 required requirement IDs (INFR-01, INFR-02, INFR-05) are claimed by plans and have implementation evidence.

Note: INFR-05 is claimed by both Plan 02 (watchdog, backoff recovery) and Plan 03 (BullMQ cleanup, Docker infrastructure). This is correct — both plans contribute distinct aspects of stream health monitoring and failure recovery.

---

## Anti-Patterns Found

No anti-patterns detected across all 10 implementation files. Scanned for:
- TODO/FIXME/PLACEHOLDER comments — none found
- Empty implementations (`return null`, `return {}`, `return []`) — none found
- Stub handlers (only `e.preventDefault()`, `console.log`) — none found
- Unresponded fetch calls — none found

---

## Git Commit Verification

All 6 commits documented in SUMMARY files verified in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `d13b0c5` | 02-01 | test(02-01): add failing tests for station CRUD and pub/sub helpers |
| `acd5825` | 02-01 | feat(02-01): implement station CRUD API with Redis pub/sub events |
| `855006b` | 02-02 | feat(02-02): implement FFmpeg spawner and StreamManager with exponential backoff |
| `4926198` | 02-02 | feat(02-02): implement watchdog, staggered startup, and supervisor entry point |
| `220b5ff` | 02-03 | test(02-03): add failing tests for BullMQ cleanup worker |
| `1d8a1a1` | 02-03 | feat(02-03): BullMQ cleanup worker and Docker infrastructure |

---

## Human Verification Required

### 1. Full Test Suite Pass

**Test:** `pnpm --filter api test` from project root
**Expected:** All 63 tests pass across 9 test files (stations.test.ts, pubsub.test.ts, stream-manager.test.ts, backoff.test.ts, watchdog.test.ts, startup.test.ts, cleanup.test.ts + 2 others)
**Why human:** Tests require live Redis and Postgres connections; cannot run in static verification context

### 2. End-to-End Stream Recording

**Test:**
1. `docker compose up -d` (starts TimescaleDB + Redis)
2. `pnpm --filter api dev` (start API server on port 3000)
3. `cd apps/api && pnpm supervisor` (start supervisor in second terminal)
4. Create station: `curl -X POST http://localhost:3000/api/v1/stations -H 'Content-Type: application/json' -d '{"name":"Test Radio","streamUrl":"https://live.srr.ro:8443/romania_actualitati","stationType":"radio"}'`
5. Wait 20 seconds, then: `ls -la data/streams/1/`
6. Check health: `curl http://localhost:3000/api/v1/stations`

**Expected:** 201 response with `status: "ACTIVE"`, segment files `segment-NNN.ts` appearing in `data/streams/1/`, station health shows `lastHeartbeat` is recent and `restartCount` is 0
**Why human:** Requires FFmpeg binary, live network access to stream URL, and filesystem observation over time

### 3. Failure Recovery (Exponential Backoff)

**Test:** With a station recording, kill its FFmpeg process: `kill <ffmpeg_pid>`. Observe supervisor output over next 10-20 seconds.
**Expected:** Supervisor logs "Stream failure detected" then "Scheduling stream restart with backoff" with delay=10000ms; stream resumes; `restartCount` increments to 1
**Why human:** Process crash recovery requires runtime observation of child process lifecycle

### 4. Watchdog Stale Detection

**Test:** With a station recording, block outbound TCP to the stream URL (e.g., with a firewall rule) for 35+ seconds. Observe watchdog logs.
**Expected:** Within 40 seconds (next watchdog poll + stale threshold), watchdog logs "Stream stale, restarting" and attempts to restart FFmpeg
**Why human:** Watchdog behavior requires observing filesystem mtime changes and network conditions over time

---

## Summary

Phase 2 implementation is complete and substantive. All 15 observable truths have full implementation evidence in the codebase. All 3 required requirement IDs (INFR-01, INFR-02, INFR-05) are satisfied with concrete code. All 10 key links between components are wired. No anti-patterns or stubs detected.

The phase achieves its goal: the system is architecturally capable of reliably recording audio from 200+ streams with automatic failure recovery. The infrastructure includes:

- **Control plane:** Station CRUD REST API with Redis pub/sub coordination (Plan 01)
- **Recording engine:** FFmpeg supervisor with exponential backoff (10s/20s/40s/80s/160s), circuit breaker at 5 failures, and watchdog segment freshness checks (Plan 02)
- **Operational safety:** BullMQ cleanup worker on 30-second schedule, Docker infrastructure with FFmpeg and data volume, reconciliation on Redis reconnect (Plan 03)

Automated static verification is conclusive. Four runtime behaviors require human confirmation: test suite execution, end-to-end segment production, failure recovery, and watchdog stale detection.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
