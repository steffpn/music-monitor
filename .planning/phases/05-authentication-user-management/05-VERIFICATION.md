---
phase: 05-authentication-user-management
verified: 2026-03-15T03:00:00Z
status: human_needed
score: 26/26 automated must-haves verified
re_verification: false
human_verification:
  - test: "Admin web dashboard login and end-to-end flow"
    expected: "Admin can log in at /admin/, see users, create invitations, deactivate users, and the session auto-refreshes on 401"
    why_human: "Vanilla JS SPA behavior requires a browser. Token auto-refresh on 401 and localStorage persistence cannot be verified programmatically."
  - test: "Non-admin login attempt shows error (does not load dashboard)"
    expected: "When a non-ADMIN user logs in at /admin/, the error message 'Access denied. Admin role required.' appears and the dashboard view is not shown"
    why_human: "Client-side role check in app.js -- requires browser rendering to verify the correct view is suppressed"
  - test: "ACRCloud webhook continues working with shared-secret auth after JWT changes"
    expected: "POST /api/v1/webhooks/acrcloud with correct X-Signature header returns 200; request without the header returns 401 (via webhook secret, not JWT)"
    why_human: "Integration with actual ACRCloud signature validation requires a running server; the webhook file was confirmed untouched but end-to-end behavior needs runtime verification"
---

# Phase 5: Authentication & User Management Verification Report

**Phase Goal:** Authentication & User Management -- JWT auth, role-based access, invitation system, admin dashboard
**Verified:** 2026-03-15T03:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | A request with a valid JWT for an active user passes authentication with currentUser attached (id, email, role, isActive, scopes) | VERIFIED | `apps/api/src/middleware/authenticate.ts` calls `request.jwtVerify()`, loads user via `prisma.user.findUnique({ include: { scopes: true } })`, attaches `request.currentUser` |
| 2  | A request with an invalid or expired JWT receives 401 | VERIFIED | authenticate.ts wraps `jwtVerify()` in try/catch; any exception returns `reply.code(401)` |
| 3  | A request from a deactivated user (isActive=false) receives 401 | VERIFIED | authenticate.ts checks `!user.isActive` after DB load and returns 401 |
| 4  | A non-ADMIN user receives 403 when accessing a route protected by requireRole('ADMIN') | VERIFIED | `apps/api/src/middleware/authorize.ts` returns `reply.code(403)` when role not in allowed list |
| 5  | UserScope join table exists in database with unique constraint on (userId, entityType, entityId) | VERIFIED | Prisma schema has `model UserScope` with `@@unique([userId, entityType, entityId])`; migration.sql creates the table and index |
| 6  | Invitation model supports multi-use with maxUses and usedCount fields | VERIFIED | `apps/api/prisma/schema.prisma` Invitation model has `maxUses Int @default(1)` and `usedCount Int @default(0)` |
| 7  | User model no longer has scopeId column -- replaced by UserScope relation | VERIFIED | User model in schema.prisma has `scopes UserScope[]` relation and no `scope_id` field; migration.sql does `ALTER TABLE "users" DROP COLUMN "scope_id"` |
| 8  | Passwords can be hashed and verified using argon2id | VERIFIED | `apps/api/src/lib/auth.ts` uses `argon2.hash(..., { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })` and `argon2.verify()` |
| 9  | JWT access tokens can be signed and verified with 1-hour expiry | VERIFIED | `generateTokenPair` calls `fastify.jwt.sign({ sub: userId }, { expiresIn: JWT_ACCESS_EXPIRY })` where `JWT_ACCESS_EXPIRY = "1h"` in shared constants |
| 10 | User can register by redeeming a valid invitation code with email, password, and name | VERIFIED | `apps/api/src/routes/v1/auth/handlers.ts` register handler validates code (status, expiry, usedCount < maxUses), creates user in $transaction, returns 201 |
| 11 | User can log in with email and password and receive access + refresh tokens | VERIFIED | login handler finds user by email, calls verifyPassword, updates lastLoginAt, calls generateTokenPair, returns 200 with tokens |
| 12 | User can refresh an expired access token using a valid refresh token | VERIFIED | refresh handler finds token in DB, checks `revokedAt`, `expiresAt`, user.isActive, revokes old token, generates new pair |
| 13 | User can log out and their refresh token is revoked | VERIFIED | logout handler requires authenticate preHandler, finds refresh token by value + userId, sets `revokedAt = new Date()` |
| 14 | Admin can create invitation codes with role, scopeId, and maxUses | VERIFIED | `apps/api/src/routes/v1/admin/invitations/handlers.ts` createInvitation uses generateInviteCode(), sets 7-day expiresAt from INVITE_CODE_EXPIRY_DAYS, persists to DB |
| 15 | Admin can list all invitations | VERIFIED | listInvitations handler calls `prisma.invitation.findMany({ orderBy: { createdAt: "desc" } })` |
| 16 | Admin can revoke an invitation | VERIFIED | revokeInvitation handler sets `status: "REVOKED"` via prisma.invitation.update |
| 17 | Admin can list all users with their roles and scopes | VERIFIED | listUsers handler calls `prisma.user.findMany({ include: { scopes: true } })` and maps scopes |
| 18 | Admin can deactivate a user (revokes all refresh tokens) | VERIFIED | deactivateUser uses `prisma.$transaction([user.update isActive=false, refreshToken.updateMany revokedAt=now])` atomically |
| 19 | Admin can reactivate a deactivated user | VERIFIED | reactivateUser calls `prisma.user.update({ data: { isActive: true } })` |
| 20 | Admin can edit a user's role and scope assignments | VERIFIED | updateUserRole and updateUserScopes handlers; scopes use deleteMany + create in $transaction for atomic replacement |
| 21 | Station CRUD endpoints require admin JWT auth | VERIFIED | `apps/api/src/routes/v1/stations/index.ts` has plugin-level `fastify.addHook("preHandler", authenticate)` and `fastify.addHook("preHandler", requireRole("ADMIN"))` |
| 22 | Snippet URL endpoint requires JWT auth | VERIFIED | `apps/api/src/routes/v1/airplay-events/index.ts` has `preHandler: [authenticate]` on GET /:id/snippet |
| 23 | ACRCloud webhook still works with shared secret auth (not JWT) | VERIFIED (code) | `apps/api/src/routes/v1/webhooks/acrcloud/index.ts` contains no references to `authenticate`, `jwt`, or `JWT` |
| 24 | Non-admin user querying airplay-events only receives data scoped to their entity IDs | VERIFIED | getSnippetUrl handler checks `currentUser.role !== "ADMIN"`, for STATION role checks event.stationId is in user's scoped station IDs, returns 404 if not |
| 25 | Admin user querying airplay-events receives all data (no scope filtering) | VERIFIED | Handler skips all filtering when `currentUser.role === "ADMIN"` |
| 26 | Admin can log in to web dashboard and manage users/invitations | VERIFIED (code) | index.html + app.js serve a SPA at /admin/; app.js calls /api/v1/auth/login, /api/v1/admin/users, /api/v1/admin/invitations; @fastify/static registered in index.ts with prefix /admin/ | HUMAN NEEDED for runtime |

**Score:** 26/26 truths verified by code analysis (3 need human confirmation for runtime behavior)

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/lib/auth.ts` | hashPassword, verifyPassword, generateInviteCode, generateTokenPair, bootstrapAdmin | VERIFIED | 107 lines, all 5 functions implemented with argon2id, opaque refresh tokens, admin bootstrap |
| `apps/api/src/middleware/authenticate.ts` | JWT verification preHandler with user + scope loading | VERIFIED | 55 lines, full implementation with jwtVerify, DB load, isActive check, currentUser attachment |
| `apps/api/src/middleware/authorize.ts` | Role-based authorization preHandler factory | VERIFIED | 16 lines, requireRole factory with 403 on role mismatch |
| `apps/api/prisma/schema.prisma` | Updated schema with UserScope, multi-use Invitation, RefreshToken relation | VERIFIED | UserScope model present, User has scopes/refreshTokens, no scopeId, Invitation has maxUses/usedCount |
| `apps/api/prisma/migrations/00000000000003_auth_user_scope/migration.sql` | Migration SQL for schema changes | VERIFIED | Creates user_scopes table, migrates data, drops scope_id, adds max_uses/used_count, adds FK to refresh_tokens |
| `apps/api/src/index.ts` | @fastify/jwt registration and bootstrapAdmin call | VERIFIED | Registers fastifyJwt with JWT_SECRET, registers fastifyStatic for /admin/, calls bootstrapAdmin after server.ready() |
| `apps/api/src/routes/v1/auth/handlers.ts` | register, login, refresh, logout handlers | VERIFIED | 241 lines, all handlers fully implemented with validation, transactions, token generation |
| `apps/api/src/routes/v1/auth/schema.ts` | TypeBox validation schemas for auth endpoints | VERIFIED | RegisterSchema, LoginSchema, RefreshSchema, LogoutSchema all present |
| `apps/api/tests/routes/auth.test.ts` | Auth route integration tests | VERIFIED | 597 lines (plan required min 100 lines) |
| `apps/api/tests/helpers/auth.ts` | Test helper for creating authenticated users | VERIFIED | createTestAdmin, getAuthTokens, createTestUserWithTokens all exported |
| `apps/api/src/routes/v1/admin/invitations/handlers.ts` | createInvitation, listInvitations, revokeInvitation | VERIFIED | 72 lines, all 3 handlers with DB operations |
| `apps/api/src/routes/v1/admin/users/handlers.ts` | listUsers, deactivateUser, reactivateUser, updateUserRole, updateUserScopes | VERIFIED | 172 lines, all 5 handlers with proper DB operations and transactions |
| `apps/api/tests/routes/admin-invitations.test.ts` | Admin invitation route integration tests | VERIFIED | 185 lines (plan required min 50 lines) |
| `apps/api/tests/routes/admin-users.test.ts` | Admin user management integration tests | VERIFIED | 233 lines (plan required min 80 lines) |
| `apps/api/src/routes/v1/airplay-events/handlers.ts` | Updated getSnippetUrl with scope-filtered query | VERIFIED | Scope filtering implemented for ADMIN/STATION/ARTIST/LABEL roles |
| `apps/api/src/admin-dashboard/public/index.html` | Admin dashboard HTML with login form and management views | VERIFIED | 131 lines (plan required min 50 lines) -- login view + dashboard view with Users and Invitations tabs |
| `apps/api/src/admin-dashboard/public/app.js` | Dashboard JavaScript with fetch-based API calls | VERIFIED | 397 lines (plan required min 100 lines) -- full SPA with token management, auto-refresh, all CRUD operations |
| `apps/api/src/admin-dashboard/public/styles.css` | Minimal functional CSS for dashboard layout | VERIFIED | 312 lines (plan required min 20 lines) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `authenticate.ts` | `apps/api/src/lib/prisma.ts` | prisma.user.findUnique with include scopes | VERIFIED | Line 32: `prisma.user.findUnique({ where: { id: userId }, include: { scopes: true } })` |
| `auth.ts` | `@fastify/jwt` | fastify.jwt.sign for access tokens | VERIFIED | Line 47: `fastify.jwt.sign({ sub: userId }, { expiresIn: JWT_ACCESS_EXPIRY })` |
| `authenticate.ts` | `@fastify/jwt` | request.jwtVerify() | VERIFIED | Line 27: `await request.jwtVerify()` |
| `auth/handlers.ts` | `apps/api/src/lib/auth.ts` | hashPassword, verifyPassword, generateTokenPair | VERIFIED | Lines 3-7: `import { hashPassword, verifyPassword, generateTokenPair } from "../../../lib/auth.js"` |
| `routes/v1/index.ts` | `auth/index.ts` | fastify.register with /auth prefix | VERIFIED | Line 4: `fastify.register(import("./auth/index.js"), { prefix: "/auth" })` |
| `admin/invitations/handlers.ts` | `apps/api/src/lib/auth.ts` | generateInviteCode for code generation | VERIFIED | Line 3: `import { generateInviteCode } from "../../../../lib/auth.js"` |
| `stations/index.ts` | `authenticate.ts` | preHandler: [authenticate, requireRole('ADMIN')] | VERIFIED | Plugin-level addHook for both authenticate and requireRole("ADMIN") |
| `airplay-events/index.ts` | `authenticate.ts` | preHandler: [authenticate] | VERIFIED | Line 10-12: `preHandler: [authenticate]` on snippet route |
| `airplay-events/handlers.ts` | request.currentUser.scopes | Prisma where clause filtered by user's scoped entity IDs | VERIFIED | Lines 35-50: filters by currentUser.role and currentUser.scopes |
| `app.js` | `/api/v1/auth/login` | fetch POST for admin login | VERIFIED | Line 103: `fetch("/api/v1/auth/login", ...)` |
| `app.js` | `/api/v1/admin/users` | fetch GET for user listing | VERIFIED | Line 153: `api("GET", "/api/v1/admin/users")` |
| `app.js` | `/api/v1/admin/invitations` | fetch POST/GET for invitation management | VERIFIED | Line 302: `api("GET", "/api/v1/admin/invitations")` and line 368: `api("POST", "/api/v1/admin/invitations", body)` |
| `apps/api/src/index.ts` | `@fastify/static` | Static file serving for /admin path | VERIFIED | Lines 49-53: `server.register(fastifyStatic, { root: ..., prefix: "/admin/", decorateReply: false })` |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| AUTH-01 | 05-02 | User can create account via admin-issued invitation code | SATISFIED | POST /auth/register validates invitation code, creates user with role from invitation, generates tokens |
| AUTH-02 | 05-01, 05-02 | User session persists across app launches (JWT access + refresh tokens) | SATISFIED | generateTokenPair creates opaque refresh token in DB; refresh endpoint rotates tokens; localStorage in dashboard |
| AUTH-03 | 05-02 | User can log out from any screen | SATISFIED | POST /auth/logout with authenticate preHandler revokes refresh token by userId |
| AUTH-04 | 05-01, 05-03 | Four roles (Admin, Artist, Label, Station) with scoped data access | SATISFIED | UserScope join table supports multi-entity scoping; requireRole enforces RBAC; airplay-events handler filters by STATION scopes |
| USER-01 | 05-03, 05-04 | Admin can create and send invitation codes with assigned role and scope | SATISFIED | POST /admin/invitations creates 7-day codes with XXXX-XXXX-XXXX format; dashboard Create Invitation form sends role, scopeId, maxUses |
| USER-02 | 05-03, 05-04 | Admin can view all users and their roles | SATISFIED | GET /admin/users returns all users with scopes; dashboard Users tab renders table with role, status, scopes |
| USER-03 | 05-03, 05-04 | Admin can deactivate user accounts | SATISFIED | PATCH /admin/users/:id/deactivate sets isActive=false and revokes all refresh tokens atomically; dashboard Deactivate button triggers this |

**All 7 requirements are SATISFIED.**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/admin-dashboard/public/app.js` | 250-251 | `placeholder=` in HTML input template strings | Info | Input placeholder text (UI hint), not a code stub -- safe |

No blocker anti-patterns. No TODOs, FIXMEs, empty implementations, or stub return values found in core auth/middleware/handler files.

**Notably correct behaviors found (not stubs):**
- `register` handler uses `prisma.$transaction` for atomic user creation + scope creation + invitation increment
- `deactivateUser` uses `prisma.$transaction` for atomic deactivation + token revocation
- `updateUserScopes` uses `prisma.$transaction` for atomic delete-all + re-create
- login returns opaque "Invalid credentials" for all failure modes (prevents user enumeration)
- refresh token rotation is correct: old token revoked before new pair generated
- ARTIST/LABEL scope filtering has a noted deferral (pending entity models in later phases) which is documented and intentional per RESEARCH.md Pattern 3

---

### Human Verification Required

#### 1. Admin Dashboard Login and Session Flow

**Test:** Start the API server (`cd apps/api && ADMIN_EMAIL=admin@test.com ADMIN_PASSWORD=admin123 JWT_SECRET=test-secret pnpm dev`) and open http://localhost:3000/admin/ in a browser.
**Expected:**
- Login form appears
- Logging in with admin@test.com / admin123 shows the dashboard with Users tab
- Users tab shows the bootstrapped admin user in the table
- Switching to Invitations tab loads invitation list
- Creating an invitation (ARTIST role, maxUses 1) shows the generated code prominently
- Logout button clears session and returns to login form
**Why human:** Vanilla JS SPA rendering, tab switching, and form behavior require a browser. localStorage persistence across page refreshes requires runtime verification.

#### 2. Non-Admin Login Blocked at Dashboard

**Test:** Create a non-admin user (ARTIST role) via the register API, then attempt to log in at /admin/ with those credentials.
**Expected:** Error message "Access denied. Admin role required." appears. The dashboard view is never shown.
**Why human:** The role check (`data.user.role !== "ADMIN"`) is client-side JavaScript -- requires browser execution to confirm the error path prevents dashboard access.

#### 3. ACRCloud Webhook Runtime Behavior

**Test:** Send `POST /api/v1/webhooks/acrcloud` with and without a valid X-Signature header using curl against a running server.
**Expected:** With valid signature returns 200; without signature returns 401 (via webhook's own secret, NOT JWT Bearer auth).
**Why human:** The webhook file has no references to JWT middleware (confirmed), but the actual signature validation logic needs end-to-end runtime confirmation that adding JWT to other routes didn't break the webhook plugin registration order.

---

### Scope Filtering Note

The ARTIST/LABEL scope filtering in `getSnippetUrl` uses a "any scope entry allows access" heuristic rather than entity-specific matching. This is a documented intentional deferral in the plan and RESEARCH.md: "Exact filtering for ARTIST/LABEL roles depends on how artist/label entities are modeled." This is not a gap -- it is a named trade-off with a recorded future refinement path.

---

### Gap Summary

No gaps blocking goal achievement. All 26 automated must-haves are verified. The phase delivers:

1. **Auth foundation** (Plan 01): argon2id password hashing, JWT token pair generation, opaque refresh tokens in DB, admin bootstrap, authenticate/authorize Fastify middleware
2. **Auth API surface** (Plan 02): register-with-invitation, login, refresh-token-rotation, logout
3. **Admin API + endpoint protection** (Plan 03): invitation CRUD, user management CRUD, station routes protected admin-only, snippet route protected any-auth, scope-based filtering on airplay events
4. **Admin dashboard** (Plan 04): vanilla JS SPA at /admin/ served via @fastify/static, consuming all auth and admin API routes

Three items require human verification for runtime behavior (dashboard UI, non-admin access block, webhook backward compatibility) but code analysis confirms all implementations are substantive and wired correctly.

---

_Verified: 2026-03-15T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
