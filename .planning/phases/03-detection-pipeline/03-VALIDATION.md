---
phase: 3
slug: detection-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm test` |
| **Full suite command** | `cd apps/api && pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test`
- **After every plan wave:** Run `cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | DETC-01 | unit | `cd apps/api && pnpm vitest run tests/routes/webhooks-acrcloud.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | DETC-01 | unit | `cd apps/api && pnpm vitest run tests/routes/webhooks-acrcloud.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | DETC-02 | unit | `cd apps/api && pnpm vitest run tests/workers/detection.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | DETC-02 | unit | `cd apps/api && pnpm vitest run tests/workers/detection.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | DETC-03 | unit | `cd apps/api && pnpm vitest run tests/workers/detection.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | DETC-03 | unit | `cd apps/api && pnpm vitest run tests/workers/detection.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 1 | DETC-03 | unit | `cd apps/api && pnpm vitest run tests/lib/normalization.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/routes/webhooks-acrcloud.test.ts` — stubs for DETC-01 webhook route tests
- [ ] `apps/api/tests/workers/detection.test.ts` — stubs for DETC-02, DETC-03 processing + deduplication
- [ ] `apps/api/tests/lib/normalization.test.ts` — stubs for title/artist normalization functions

*Existing infrastructure covers framework needs (Vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ACRCloud webhook integration | DETC-01 | Requires real ACRCloud callback | Send test callback via curl to `/api/v1/webhooks/acrcloud` with valid secret |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
