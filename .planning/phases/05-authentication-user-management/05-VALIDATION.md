---
phase: 5
slug: authentication-user-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | apps/api/vitest.config.ts |
| **Quick run command** | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts tests/middleware/authenticate.test.ts tests/routes/admin-invitations.test.ts tests/routes/admin-users.test.ts` |
| **Full suite command** | `cd apps/api && pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && pnpm vitest run tests/routes/auth.test.ts tests/middleware/authenticate.test.ts tests/routes/admin-invitations.test.ts tests/routes/admin-users.test.ts`
- **After every plan wave:** Run `cd apps/api && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | AUTH-01 | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "register"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | AUTH-02 | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "refresh"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | AUTH-03 | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "logout"` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | AUTH-04 | integration | `cd apps/api && pnpm vitest run tests/middleware/authenticate.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | USER-01 | integration | `cd apps/api && pnpm vitest run tests/routes/admin-invitations.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | USER-02 | integration | `cd apps/api && pnpm vitest run tests/routes/admin-users.test.ts -t "list"` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | USER-03 | integration | `cd apps/api && pnpm vitest run tests/routes/admin-users.test.ts -t "deactivate"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/routes/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-03 (register, login, refresh, logout)
- [ ] `tests/middleware/authenticate.test.ts` — stubs for AUTH-04 (preHandler middleware, role check, scope loading)
- [ ] `tests/routes/admin-invitations.test.ts` — stubs for USER-01 (invitation CRUD)
- [ ] `tests/routes/admin-users.test.ts` — stubs for USER-02, USER-03 (user listing, deactivation, reactivation)
- [ ] `tests/lib/auth.test.ts` — covers password hashing, token generation, invite code generation (unit)
- [ ] Test helper: function to create test user + tokens for authenticated route testing
- [ ] `argon2` added to `pnpm.onlyBuiltDependencies` in root package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin dashboard renders correctly | USER-01, USER-02 | Browser UI rendering | Open /admin in browser, verify invitation form and user list display |
| JWT persists across app restart | AUTH-02 | iOS app lifecycle | Kill and relaunch iOS app, verify user stays logged in |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
