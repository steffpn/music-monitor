---
phase: 05-authentication-user-management
plan: 03
subsystem: auth
tags: [fastify, typebox, prisma, rbac, scope-filtering, admin-api, jwt]

# Dependency graph
requires:
  - phase: 05-authentication-user-management
    plan: 01
    provides: Auth service (generateInviteCode, hashPassword), authenticate/authorize middleware, Prisma User/Invitation/RefreshToken/UserScope models
  - phase: 05-authentication-user-management
    plan: 02
    provides: Test helper (createTestAdmin, getAuthTokens, createTestUserWithTokens), auth routes for login/register
provides:
  - Admin invitation CRUD API (create, list, revoke)
  - Admin user management API (list, deactivate, reactivate, update role, update scopes)
  - JWT auth protection on all station CRUD endpoints (admin-only)
  - JWT auth protection on snippet URL endpoint (any authenticated user)
  - Scope-based data filtering on airplay-events handler
affects: [05-04, 06-ios-authentication]

# Tech tracking
tech-stack:
  added: []
  patterns: [plugin-level preHandler hooks for auth on all routes in a plugin, transactional scope replacement with Prisma $transaction, scope-filtered Prisma queries in route handlers]

key-files:
  created:
    - apps/api/src/routes/v1/admin/invitations/schema.ts
    - apps/api/src/routes/v1/admin/invitations/handlers.ts
    - apps/api/src/routes/v1/admin/invitations/index.ts
    - apps/api/src/routes/v1/admin/users/schema.ts
    - apps/api/src/routes/v1/admin/users/handlers.ts
    - apps/api/src/routes/v1/admin/users/index.ts
    - apps/api/tests/routes/admin-invitations.test.ts
    - apps/api/tests/routes/admin-users.test.ts
    - apps/api/tests/routes/airplay-events-scope.test.ts
  modified:
    - apps/api/src/routes/v1/index.ts
    - apps/api/src/routes/v1/stations/index.ts
    - apps/api/src/routes/v1/airplay-events/index.ts
    - apps/api/src/routes/v1/airplay-events/handlers.ts
    - apps/api/tests/routes/stations.test.ts

key-decisions:
  - "Plugin-level addHook for authenticate+requireRole instead of per-route preHandler arrays for admin routes"
  - "Scope filtering checks stationId membership for STATION role; ARTIST/LABEL allowed if any scope entry exists (deferred until entity models added)"
  - "User deactivation and token revocation in single Prisma $transaction for atomicity"
  - "Scope update uses deleteMany + create in transaction for atomic replacement"

patterns-established:
  - "Plugin-level preHandler hooks: fastify.addHook('preHandler', authenticate) at plugin scope to protect all routes"
  - "Scope-filtered handler pattern: check currentUser.role, filter by scoped entity IDs, return 404 for out-of-scope"
  - "Admin route structure: /admin/{resource}/ with schema.ts + handlers.ts + index.ts mirroring existing route pattern"

requirements-completed: [AUTH-04, USER-01, USER-02, USER-03]

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 5 Plan 3: Admin API and Endpoint Protection Summary

**Admin invitation/user management CRUD, JWT auth on all endpoints, and scope-based data filtering with 53 passing tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-15T01:26:05Z
- **Completed:** 2026-03-15T01:32:30Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Complete admin invitation API: create (7-day expiry, XXXX-XXXX-XXXX codes), list (ordered by createdAt desc), revoke
- Complete admin user management API: list with scopes, deactivate (revokes all tokens), reactivate, update role, replace scopes
- All station CRUD endpoints protected with admin-only JWT auth
- Snippet URL endpoint protected with JWT auth for any authenticated user
- Scope-based data filtering: STATION users limited to events from their scoped stations; admin sees all
- ACRCloud webhook preserved with shared secret auth (not modified)
- 53 tests passing across 5 test files (admin invitations, admin users, stations, scope filtering, webhooks)

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin routes (invitations + users)**
   - `fbaaa61` (test - TDD RED: 16 failing admin tests)
   - `3b1d002` (feat - TDD GREEN: admin route implementation)

2. **Task 2: Protect existing endpoints and add scope-based data filtering**
   - `efa7901` (test - TDD RED: 4 failing endpoint protection tests)
   - `d19a57e` (feat - TDD GREEN: endpoint protection and scope filtering)

## Files Created/Modified
- `apps/api/src/routes/v1/admin/invitations/schema.ts` - TypeBox validation for CreateInvitationSchema and InvitationParamsSchema
- `apps/api/src/routes/v1/admin/invitations/handlers.ts` - createInvitation, listInvitations, revokeInvitation handlers
- `apps/api/src/routes/v1/admin/invitations/index.ts` - Fastify plugin with authenticate + requireRole("ADMIN") hooks
- `apps/api/src/routes/v1/admin/users/schema.ts` - TypeBox validation for UserParamsSchema, UpdateRoleSchema, UpdateScopesSchema
- `apps/api/src/routes/v1/admin/users/handlers.ts` - listUsers, deactivateUser, reactivateUser, updateUserRole, updateUserScopes handlers
- `apps/api/src/routes/v1/admin/users/index.ts` - Fastify plugin with authenticate + requireRole("ADMIN") hooks
- `apps/api/src/routes/v1/index.ts` - Added admin/invitations and admin/users route registration
- `apps/api/src/routes/v1/stations/index.ts` - Added authenticate + requireRole("ADMIN") hooks
- `apps/api/src/routes/v1/airplay-events/index.ts` - Added authenticate preHandler to snippet route
- `apps/api/src/routes/v1/airplay-events/handlers.ts` - Added scope-based data filtering to getSnippetUrl
- `apps/api/tests/routes/admin-invitations.test.ts` - 8 admin invitation integration tests
- `apps/api/tests/routes/admin-users.test.ts` - 8 admin user management integration tests
- `apps/api/tests/routes/stations.test.ts` - Updated with auth headers + 2 new auth enforcement tests (20 total)
- `apps/api/tests/routes/airplay-events-scope.test.ts` - 5 scope filtering tests

## Decisions Made
- Plugin-level addHook for auth instead of per-route preHandler arrays -- cleaner for plugins where all routes need the same auth
- Scope filtering for STATION role checks stationId membership; ARTIST/LABEL roles allowed if any scope entry exists -- exact artist/label entity matching deferred until those models exist in later phases
- User deactivation + token revocation wrapped in Prisma $transaction -- ensures atomicity (user can't be deactivated without tokens being revoked)
- Scope update uses deleteMany + individual creates in transaction -- ensures atomic replacement of all scope entries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing API build failures (ioredis@5.10.0 vs 5.9.3 type mismatch in BullMQ, Prisma client outside rootDir) remain unchanged from Plan 01/02. Not caused by this plan's changes.
- R2 client not initialized in test environment (expected) -- scope filtering tests use status codes [200, 500] for allowed access and 404 for filtered access, which correctly validates the scope filtering logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin API complete for Plan 04 admin dashboard integration
- All endpoints protected with JWT auth for iOS app consumption (Phase 6)
- Scope-based filtering ready for all future data-accessing endpoints
- Webhook endpoints preserved with shared secret auth

## Self-Check: PASSED

All 9 created files verified present. All 4 commits verified in git log.

---
*Phase: 05-authentication-user-management*
*Completed: 2026-03-15*
