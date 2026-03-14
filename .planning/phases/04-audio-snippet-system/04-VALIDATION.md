---
phase: 4
slug: audio-snippet-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/api && pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | INFR-03a | unit | `cd apps/api && pnpm vitest run tests/lib/segment-resolver.test.ts -t "resolves segments"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | INFR-04a | unit (mock SDK) | `cd apps/api && pnpm vitest run tests/lib/r2.test.ts -t "upload"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | INFR-04b | unit (mock SDK) | `cd apps/api && pnpm vitest run tests/lib/r2.test.ts -t "presign"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 0 | INFR-03b | unit (mock spawn) | `cd apps/api && pnpm vitest run tests/workers/snippet.test.ts -t "extracts snippet"` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 0 | INFR-03c | unit | `cd apps/api && pnpm vitest run tests/workers/snippet.test.ts -t "kill switch"` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 0 | INFR-03d | unit | `cd apps/api && pnpm vitest run tests/workers/snippet.test.ts -t "missing segments"` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 0 | INFR-04e | unit | `cd apps/api && pnpm vitest run tests/workers/snippet.test.ts -t "updates snippetUrl"` | ❌ W0 | ⬜ pending |
| 04-01-08 | 01 | 0 | INFR-03e | unit | `cd apps/api && pnpm vitest run tests/workers/detection.test.ts -t "snippet"` | ❌ W0 | ⬜ pending |
| 04-01-09 | 01 | 0 | INFR-04c | unit | `cd apps/api && pnpm vitest run tests/routes/airplay-events.test.ts -t "snippet URL"` | ❌ W0 | ⬜ pending |
| 04-01-10 | 01 | 0 | INFR-04d | unit | `cd apps/api && pnpm vitest run tests/routes/airplay-events.test.ts -t "no snippet"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/segment-resolver.test.ts` — stubs for INFR-03a (segment timestamp resolution)
- [ ] `tests/lib/r2.test.ts` — stubs for INFR-04a, INFR-04b (R2 upload + presign)
- [ ] `tests/workers/snippet.test.ts` — stubs for INFR-03b, INFR-03c, INFR-03d, INFR-04e (snippet worker)
- [ ] `tests/routes/airplay-events.test.ts` — stubs for INFR-04c, INFR-04d (snippet endpoint)
- [ ] Update `tests/workers/detection.test.ts` — stubs for INFR-03e (snippet job enqueue)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end snippet playback | INFR-03, INFR-04 | Requires live radio stream + FFmpeg + R2 | 1. Start stream recording 2. Wait for detection 3. Verify snippet URL returns playable audio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
