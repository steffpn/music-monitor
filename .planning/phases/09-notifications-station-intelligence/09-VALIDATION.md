---
phase: 9
slug: notifications-station-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.0.0 |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && pnpm test -- --grep "digest\|notification\|competitor"` |
| **Full suite command** | `cd apps/api && pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm test -- --grep "digest\|notification\|competitor" -x`
- **After every plan wave:** Run `cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 0 | NOTF-01 | unit | `cd apps/api && pnpm test -- tests/workers/digest.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 0 | NOTF-02 | unit | `cd apps/api && pnpm test -- tests/workers/digest.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 0 | NOTF-03 | integration | `cd apps/api && pnpm test -- tests/routes/notifications.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 0 | STIN-01 | integration | `cd apps/api && pnpm test -- tests/routes/competitors.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-05 | 01 | 0 | STIN-02 | integration | `cd apps/api && pnpm test -- tests/routes/competitors.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/workers/digest.test.ts` — stubs for NOTF-01, NOTF-02 (digest computation logic)
- [ ] `tests/routes/notifications.test.ts` — stubs for NOTF-03 (preferences endpoints + device token registration)
- [ ] `tests/routes/competitors.test.ts` — stubs for STIN-01, STIN-02 (competitor CRUD + aggregation)
- [ ] `cd apps/api && pnpm add apns2` — new dependency install

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push notification received on device | NOTF-01, NOTF-02 | Requires physical iOS device + Apple Push Notification Service | 1. Configure .p8 key 2. Run digest worker 3. Verify notification appears on device |
| iOS notification permission prompt | NOTF-03 | Requires iOS simulator/device interaction | 1. Launch app 2. Verify permission dialog appears 3. Grant/deny and verify behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
