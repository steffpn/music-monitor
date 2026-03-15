---
phase: 05-authentication-user-management
plan: 02
subsystem: auth
tags: [jwt, fastify, typebox, invitation-codes, token-rotation, integration-tests]

# Dependency graph
requires:
  - phase: 05-authentication-user-management
    plan: 01
    provides: Auth service (hashPassword, verifyPassword, generateTokenPair), authenticate/authorize middleware, Prisma User/Invitation/RefreshToken/UserScope models
provides:
  - POST /auth/register endpoint with invitation code redemption
  - POST /auth/login endpoint with email/password authentication
  - POST /auth/refresh endpoint with token rotation
  - POST /auth/logout endpoint with token revocation
  - TypeBox validation schemas for all four auth endpoints
  - Test helper (createTestAdmin, getAuthTokens, createTestUserWithTokens)
affects: [05-03, 05-04, 06-ios-authentication]

# Tech tracking
tech-stack:
  added: []
  patterns: [TypeBox body schema + Fastify plugin route pattern for auth, prisma.$transaction for atomic multi-model writes, opaque refresh token rotation]

key-files:
  created:
    - apps/api/src/routes/v1/auth/handlers.ts
    - apps/api/src/routes/v1/auth/schema.ts
    - apps/api/src/routes/v1/auth/index.ts
    - apps/api/tests/routes/auth.test.ts
    - apps/api/tests/helpers/auth.ts
  modified:
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "Invitation code validation checks status, expiry, and usedCount < maxUses before allowing registration"
  - "Opaque error messages for login failures (always 'Invalid credentials') to prevent user enumeration"
  - "Refresh token rotation: old token revoked atomically before new pair generated"
  - "Logout handler accepts generic FastifyRequest (body cast) to avoid Fastify preHandler+schema type conflict"

patterns-established:
  - "Auth routes follow standard Fastify plugin pattern: index.ts + schema.ts + handlers.ts"
  - "Public routes (register, login, refresh) have no preHandler; protected routes use [authenticate] preHandler"
  - "Test helper provides createTestAdmin/getAuthTokens/createTestUserWithTokens for cross-test reuse"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 5 Plan 2: Auth Routes Summary

**Four auth API endpoints (register with invitation code, login, refresh token rotation, logout) with 18 integration tests and reusable test helper**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T01:17:22Z
- **Completed:** 2026-03-15T01:22:29Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Complete auth API surface: register, login, refresh, and logout endpoints
- Invitation code redemption with status/expiry/maxUses validation, UserScope creation from invitation scopeId
- Token rotation on refresh (old token revoked, new pair generated)
- Reusable test helper for creating authenticated users in other test suites
- 18 integration tests covering all success and failure paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth routes (register, login, refresh, logout) and test helper**
   - `23f7c8d` (test - TDD RED: 18 failing tests)
   - `4536e20` (feat - TDD GREEN: implementation passing all tests)
   - `49912f6` (fix - logout handler type for Fastify preHandler compatibility)

## Files Created/Modified
- `apps/api/src/routes/v1/auth/schema.ts` - TypeBox validation schemas (RegisterSchema, LoginSchema, RefreshSchema, LogoutSchema)
- `apps/api/src/routes/v1/auth/handlers.ts` - Route handlers for register, login, refresh, logout
- `apps/api/src/routes/v1/auth/index.ts` - Fastify plugin registering all four POST routes
- `apps/api/src/routes/v1/index.ts` - Added auth route registration with /auth prefix
- `apps/api/tests/routes/auth.test.ts` - 18 integration tests for all auth endpoints
- `apps/api/tests/helpers/auth.ts` - Test helper with createTestAdmin, getAuthTokens, createTestUserWithTokens

## Decisions Made
- Invitation code validation checks status=PENDING, expiry, and usedCount < maxUses -- rejects with 400 for any failure
- Login returns opaque "Invalid credentials" for all failure modes (wrong password, missing user, deactivated) -- prevents user enumeration
- Refresh token rotation is atomic: old token revoked before new pair generated via generateTokenPair
- Logout handler uses generic FastifyRequest with body cast rather than typed generic -- avoids TS2345 when preHandler + schema combined

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed logout handler TypeScript type for Fastify preHandler compatibility**
- **Found during:** Task 1 (build verification)
- **Issue:** Fastify TS2345 error when combining preHandler array with schema body on route definition -- handler's `FastifyRequest<{ Body: LogoutBody }>` type conflicts with Fastify's inferred route generics
- **Fix:** Changed logout handler to accept generic `FastifyRequest` and cast `request.body as LogoutBody` internally
- **Files modified:** apps/api/src/routes/v1/auth/handlers.ts
- **Verification:** Build shows no auth route errors, all 18 tests pass
- **Committed in:** 49912f6

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary for type safety. No scope creep.

## Issues Encountered
- Pre-existing API build failures (ioredis version mismatch, Prisma client outside rootDir) remain unchanged from Plan 01. Not caused by this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth API surface complete for iOS app consumption (Phase 6)
- Test helper ready for Plan 03 admin endpoint tests and endpoint protection tests
- All four endpoints tested and working for Plan 04 admin dashboard integration

## Self-Check: PASSED

All 5 created files and 1 modified file verified present. All 3 commits verified in git log.

---
*Phase: 05-authentication-user-management*
*Completed: 2026-03-15*
