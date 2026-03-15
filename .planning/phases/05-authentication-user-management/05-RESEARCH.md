# Phase 5: Authentication & User Management - Research

**Researched:** 2026-03-15
**Domain:** JWT authentication, password hashing, RBAC, admin dashboard
**Confidence:** HIGH

## Summary

Phase 5 adds invite-only authentication with JWT sessions, role-based access control via a UserScope join table, and a basic admin web dashboard. The existing codebase already has User, Invitation, and RefreshToken Prisma models in the database (created in Phase 1 migration), along with UserRole/InvitationStatus enums and shared TypeScript types. The core work involves: (1) a Prisma schema migration to add UserScope table, modify Invitation for multi-use, and remove the scopeId column from User, (2) auth service layer with argon2 hashing and @fastify/jwt token management, (3) Fastify preHandler middleware for JWT verification and scope loading, (4) auth API routes (register, login, refresh, logout), (5) admin API routes (invitations CRUD, user management), (6) protecting all existing endpoints, and (7) a basic admin web dashboard.

The stack is straightforward: @fastify/jwt for token signing/verification (Fastify 5 compatible since v9+), argon2 for password hashing (OWASP-recommended argon2id), crypto.randomBytes for invitation code generation, and @fastify/static to serve a simple admin dashboard. The existing Fastify plugin route pattern (index.ts + schema.ts + handlers.ts) and TypeBox validation should be followed for all new routes.

**Primary recommendation:** Use @fastify/jwt v10 with HS256 signing, argon2 for password hashing, a Fastify preHandler hook for auth middleware that attaches user + scopes to the request object, and a vanilla HTML + minimal JS admin dashboard served via @fastify/static.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Multi-use invitation codes with admin-set redemption limit (e.g., "10 uses for this label's artists")
- 7-day expiry on all invitation codes (fixed, not admin-configurable per invite)
- User provides email + password + name when redeeming an invitation code
- Role and scope inherited from the invitation -- user doesn't choose their role
- Admin copies invitation code from API response and shares manually -- no automated email delivery
- Invitation tracks: code, role, scopeId, maxUses, usedCount, expiresAt, createdById, status
- JWT access token: 1-hour expiry
- Refresh token: 30-day expiry, stored in RefreshToken table with revokedAt field
- Unlimited concurrent device sessions -- each device gets its own refresh token
- Logout revokes only the current device's refresh token (other devices stay logged in)
- Refresh endpoint: accepts expired access token + valid refresh token, returns new access + refresh token pair
- Token rotation: new refresh token issued on each refresh, old one revoked (prevents reuse)
- Separate UserScope join table instead of single scopeId on User -- allows multi-entity access for all roles
- UserScope maps user to entity type + entity ID (e.g., user 5 -> artist 12, user 5 -> artist 15)
- All roles support multi-entity scoping: Artist (multiple artist records), Label (multiple labels), Station (multiple stations)
- Admin role: no scope entries, sees everything
- Scope enforcement via Fastify preHandler middleware: decodes JWT, loads user + scopes from DB, attaches to request object
- Route handlers filter Prisma queries by user's scoped entity IDs
- All existing endpoints get JWT auth protection except webhooks (ACRCloud webhook keeps shared secret auth)
- Snippet URL endpoint (GET /airplay-events/:id/snippet) gets JWT auth
- Station CRUD endpoints get JWT auth with admin-only access
- First admin bootstrapped from ADMIN_EMAIL + ADMIN_PASSWORD environment variables on first startup (if no users exist in DB)
- Admin can list all users with role and scope info
- Admin can deactivate a user -- immediately revokes all their refresh tokens; access token works until expiry (up to 1 hour) but can't be refreshed
- Admin can reactivate a deactivated user -- sets isActive back to true, user can log in again with existing credentials
- Admin can edit a user's role and scope assignments after creation
- Basic admin web dashboard included in this phase for user management and invitation generation
- Dashboard serves from same backend (Fastify serves static files or uses a lightweight frontend framework)
- Protected by same JWT auth -- admin role required
- Functional, not polished -- dashboard UI refinement can happen later

### Claude's Discretion
- Password hashing algorithm (bcrypt, argon2, etc.)
- JWT signing algorithm and secret management
- Invitation code format and generation strategy
- Admin dashboard frontend framework choice (React, vanilla, etc.)
- UserScope table schema details (migration strategy for replacing scopeId)
- Token refresh endpoint path and request/response format
- Rate limiting on auth endpoints
- Error message wording for auth failures
- Exact preHandler middleware implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope (admin web dashboard included per user decision)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can create account via admin-issued invitation code | Invitation redemption flow with argon2 hashing, code validation, user creation in transaction |
| AUTH-02 | User session persists across app launches (JWT access + refresh tokens) | @fastify/jwt v10 for signing/verification, RefreshToken table with rotation |
| AUTH-03 | User can log out from any screen | Logout endpoint revokes current device's refresh token via revokedAt field |
| AUTH-04 | Four roles (Admin, Artist, Label, Station) with scoped data access | UserScope join table, preHandler middleware, Prisma query filtering |
| USER-01 | Admin can create and send invitation codes with assigned role and scope | Admin invitation CRUD endpoints, crypto.randomBytes code generation |
| USER-02 | Admin can view all users and their roles | Admin user listing endpoint with scope info via UserScope join |
| USER-03 | Admin can deactivate user accounts | Deactivation endpoint: set isActive=false, revoke all refresh tokens |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/jwt | ^10.0.0 | JWT sign/verify/decode | Official Fastify JWT plugin, uses fast-jwt internally, Fastify 5 compatible (>=v9) |
| argon2 | ^0.44.0 | Password hashing (argon2id) | OWASP 2025 #1 recommendation, memory-hard, GPU/ASIC resistant |
| @fastify/cookie | ^10.0.1 | Cookie support for refresh tokens (optional) | Official Fastify plugin, Fastify 5 compatible |
| @fastify/static | ^9.0.0 | Serve admin dashboard static files | Official Fastify plugin for static file serving |
| @fastify/rate-limit | ^10.x | Rate limit auth endpoints | Official Fastify plugin, Fastify 5 compatible (>=v10) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:crypto | built-in | Invitation code generation | crypto.randomBytes for secure random codes |
| @sinclair/typebox | ^0.34.48 | Request/response validation schemas | Already in project -- use for all new route schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| argon2 | bcrypt | bcrypt is simpler to install (no native deps), but argon2id is more resistant to GPU attacks. argon2 has had occasional build issues on some platforms, but is stable on Node >=18 |
| @fastify/jwt | jsonwebtoken (manual) | @fastify/jwt provides request.jwtVerify() and reply.jwtSign() decorators that integrate cleanly with Fastify hooks. Manual JWT adds boilerplate |
| Vanilla HTML dashboard | React SPA | React adds build complexity, bundle size, and a separate dev server. A functional-not-polished admin dashboard is better served by vanilla HTML + fetch API calls |

**Installation:**
```bash
cd apps/api && pnpm add @fastify/jwt@^10.0.0 argon2@^0.44.0 @fastify/cookie@^10.0.1 @fastify/static@^9.0.0 @fastify/rate-limit@^10.0.0
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  lib/
    auth.ts                    # Auth service: hash, verify, generateToken, generateInviteCode
  middleware/
    authenticate.ts            # preHandler: JWT verify + load user + scopes
    authorize.ts               # preHandler factory: role-based access check
  routes/v1/
    auth/
      index.ts                 # Register, login, refresh, logout routes
      schema.ts                # TypeBox schemas for auth endpoints
      handlers.ts              # Auth route handlers
    admin/
      invitations/
        index.ts               # Invitation CRUD routes (admin only)
        schema.ts
        handlers.ts
      users/
        index.ts               # User management routes (admin only)
        schema.ts
        handlers.ts
    stations/                  # Existing -- add auth middleware
    airplay-events/            # Existing -- add auth middleware
    webhooks/acrcloud/         # Existing -- keep shared secret auth (NO JWT)
  admin-dashboard/
    public/                    # Static HTML/CSS/JS files
      index.html
      app.js
      styles.css
apps/api/prisma/
  migrations/
    00000000000003_auth_user_scope/migration.sql  # New migration
```

### Pattern 1: Fastify preHandler Authentication Middleware
**What:** A reusable preHandler hook that verifies the JWT, loads the user from DB, loads their UserScope entries, and attaches everything to the request object.
**When to use:** Every protected route.
**Example:**
```typescript
// Source: @fastify/jwt docs + project Fastify patterns
import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

// Extend FastifyRequest with user info
declare module "fastify" {
  interface FastifyRequest {
    currentUser: {
      id: number;
      email: string;
      role: string;
      isActive: boolean;
      scopes: Array<{ entityType: string; entityId: number }>;
    };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Verify JWT and decode payload
    await request.jwtVerify();

    const payload = request.user as { sub: number };

    // Load user + scopes from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { scopes: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: "Account deactivated" });
    }

    request.currentUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      scopes: user.scopes.map((s) => ({
        entityType: s.entityType,
        entityId: s.entityId,
      })),
    };
  } catch (err) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
```

### Pattern 2: Role-Based Authorization Factory
**What:** A factory function that returns a preHandler checking the user's role.
**When to use:** Routes that require specific roles (e.g., admin-only).
**Example:**
```typescript
// Source: Fastify preHandler pattern
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.currentUser.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}

// Usage in route registration:
fastify.get("/admin/users", {
  preHandler: [authenticate, requireRole("ADMIN")],
}, listUsersHandler);
```

### Pattern 3: Scope-Filtered Prisma Queries
**What:** Route handlers filter DB queries using the user's scoped entity IDs.
**When to use:** Any data endpoint where users should only see data within their scope.
**Example:**
```typescript
// Source: project CONTEXT.md decision
export async function listAirplayEvents(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { currentUser } = request;

  // Admin sees everything
  let where: Record<string, unknown> = {};

  if (currentUser.role !== "ADMIN") {
    // Get station IDs from user's scopes
    // For ARTIST role, scopes reference artist entities -- need to map to station data
    // For STATION role, scopes directly reference station IDs
    const stationScopes = currentUser.scopes
      .filter((s) => s.entityType === "STATION")
      .map((s) => s.entityId);

    if (stationScopes.length > 0) {
      where = { stationId: { in: stationScopes } };
    }
    // Artist/Label scopes filter by artist/label entity (implementation varies by endpoint)
  }

  const events = await prisma.airplayEvent.findMany({ where });
  return reply.send(events);
}
```

### Pattern 4: Admin Bootstrap on First Startup
**What:** On server start, check if any users exist. If not, create an admin from env vars.
**When to use:** First deployment only.
**Example:**
```typescript
// Source: CONTEXT.md decision
import argon2 from "argon2";

export async function bootstrapAdmin(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("No ADMIN_EMAIL/ADMIN_PASSWORD set and no users exist. Skipping admin bootstrap.");
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 1,
  });

  await prisma.user.create({
    data: { email, passwordHash, name: "Admin", role: "ADMIN", isActive: true },
  });

  console.log(`Admin user created: ${email}`);
}
```

### Anti-Patterns to Avoid
- **Storing JWT secret in code:** Use environment variable `JWT_SECRET`. Never commit secrets.
- **Not checking isActive during token verification:** A deactivated user's access token remains valid up to 1 hour. The preHandler MUST check isActive on every request by loading the user from DB.
- **Putting scope logic in middleware:** The middleware loads scopes; the route handler applies them to queries. Don't try to build a universal scope filter in middleware -- different endpoints need different filtering logic (artist by artistName, station by stationId, etc.).
- **Using request.user directly:** @fastify/jwt sets request.user to the decoded JWT payload. Build a richer currentUser object from DB data rather than trusting JWT claims for role/scope (which could be stale).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Manual crypto operations | @fastify/jwt v10 | Handles algorithm selection, expiry validation, Fastify integration, request decoration |
| Password hashing | Custom salt + SHA-256 | argon2 (argon2id) | Memory-hard, tunable, OWASP #1 pick, handles salt internally |
| Secure random codes | Math.random + string concat | crypto.randomBytes(16).toString("hex") | Cryptographically secure, 128-bit entropy, OS-level RNG |
| Rate limiting | Custom request counter | @fastify/rate-limit | Handles window management, Redis backend, IP tracking, response headers |
| Static file serving | Custom file read + response | @fastify/static | Handles MIME types, caching, range requests, security |

**Key insight:** Authentication is a security-critical domain where subtle bugs (timing attacks, weak randomness, improper token validation) create exploitable vulnerabilities. Every component should use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Shared Constants Mismatch with User Decisions
**What goes wrong:** The existing `packages/shared/src/constants/index.ts` has `JWT_ACCESS_EXPIRY = "15m"` and `JWT_REFRESH_EXPIRY = "7d"`. The CONTEXT.md decisions specify 1-hour access tokens and 30-day refresh tokens.
**Why it happens:** Constants were defined in Phase 1 before authentication design was finalized.
**How to avoid:** Update the shared constants to match the decisions: `JWT_ACCESS_EXPIRY = "1h"` and `JWT_REFRESH_EXPIRY = "30d"`.
**Warning signs:** Tests pass but tokens expire earlier than expected by the iOS app.

### Pitfall 2: Invitation Model Change Breaking Existing Schema
**What goes wrong:** The current Invitation model has `redeemedById` as a unique 1:1 relation (single use). Changing to multi-use requires dropping the unique constraint and the 1:1 relation.
**Why it happens:** Phase 1 schema assumed single-use invitations.
**How to avoid:** Migration must: (1) remove the `redeemed_by_id` unique constraint, (2) drop the `redeemed_by_id` column (replace with InvitationRedemption join table or just remove -- tracking is via User's invitation reference), (3) add `max_uses` and `used_count` columns, (4) update Prisma schema relations.
**Warning signs:** Prisma migrate fails or generates unexpected SQL.

### Pitfall 3: Forgetting to Protect the Webhook Endpoint Differently
**What goes wrong:** Adding global auth middleware breaks the ACRCloud webhook, which uses shared secret authentication (not JWT).
**Why it happens:** Global onRequest hooks apply to all routes.
**How to avoid:** Do NOT use a global auth hook. Apply the authenticate preHandler per-route or per-plugin scope. Webhook routes must remain exempt. Register auth as a Fastify plugin with encapsulation, only in the non-webhook route tree.
**Warning signs:** Webhook callbacks start returning 401.

### Pitfall 4: Token Refresh with Expired Access Token
**What goes wrong:** The refresh endpoint rejects requests because the access token is expired (which is the whole point of refreshing).
**Why it happens:** @fastify/jwt's request.jwtVerify() throws on expired tokens by default.
**How to avoid:** The refresh endpoint should either (a) use fastify.jwt.decode() instead of verify for the access token (just to extract the sub claim), or (b) skip access token validation entirely and rely on the refresh token alone for identity. The refresh token (stored in DB) is the security boundary, not the expired access token.
**Warning signs:** Users get logged out and can't refresh after 1 hour.

### Pitfall 5: argon2 Native Build Failures
**What goes wrong:** `argon2` npm package requires native compilation (uses node-gyp or prebuildify). Build may fail on some systems.
**Why it happens:** argon2 has C bindings that need to be compiled.
**How to avoid:** Ensure build tools are available (macOS: Xcode CLI tools, Linux: build-essential). The `pnpm.onlyBuiltDependencies` whitelist in root package.json needs `argon2` added. Alternative: use `@node-rs/argon2` (Rust-based, prebuilt binaries) if native build is problematic.
**Warning signs:** pnpm install fails with node-gyp errors.

### Pitfall 6: UserScope Migration with Existing Data
**What goes wrong:** Dropping the `scope_id` column from users table loses any data stored there.
**Why it happens:** Phase 5 replaces scopeId with UserScope join table.
**How to avoid:** Since no users exist yet in production (auth is being built now), this is safe. But the migration should still be defensive: migrate any existing scopeId values to the new UserScope table before dropping the column, in case dev data exists.
**Warning signs:** Data loss if scopeId had values in dev/test databases.

## Code Examples

### JWT Plugin Registration
```typescript
// Source: @fastify/jwt docs, adapted for project
import fastifyJwt from "@fastify/jwt";

// In server setup (apps/api/src/index.ts or plugin)
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  sign: {
    expiresIn: "1h",  // Access token default
  },
});
```

### Token Generation (Login/Register)
```typescript
// Source: @fastify/jwt docs + project decisions
async function generateTokenPair(
  fastify: FastifyInstance,
  userId: number,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Sign access token with 1-hour expiry
  const accessToken = fastify.jwt.sign(
    { sub: userId },
    { expiresIn: "1h" },
  );

  // Generate opaque refresh token (stored in DB, not a JWT)
  const refreshTokenValue = crypto.randomBytes(32).toString("hex");

  // Store refresh token in DB with 30-day expiry
  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return { accessToken, refreshToken: refreshTokenValue };
}
```

### Invitation Code Generation
```typescript
// Source: Node.js crypto docs
import crypto from "node:crypto";

export function generateInviteCode(): string {
  // 8 bytes = 16 hex chars, readable and unique enough
  // Format: XXXX-XXXX-XXXX (12 chars without dashes)
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
```

### Registration (Invitation Redemption)
```typescript
// Source: CONTEXT.md decisions + argon2 docs
import argon2 from "argon2";

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { code, email, password, name } = request.body;

  // Find valid invitation
  const invitation = await prisma.invitation.findUnique({ where: { code } });

  if (!invitation) {
    return reply.status(400).send({ error: "Invalid invitation code" });
  }

  if (invitation.status !== "PENDING") {
    return reply.status(400).send({ error: "Invitation is no longer valid" });
  }

  if (invitation.expiresAt < new Date()) {
    return reply.status(400).send({ error: "Invitation has expired" });
  }

  if (invitation.usedCount >= invitation.maxUses) {
    return reply.status(400).send({ error: "Invitation has reached its usage limit" });
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.status(409).send({ error: "Email already registered" });
  }

  // Hash password with argon2id
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // Create user + increment invitation usedCount + create scope entries in transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: invitation.role,
        isActive: true,
      },
    });

    // Create scope entry from invitation
    if (invitation.scopeId) {
      await tx.userScope.create({
        data: {
          userId: newUser.id,
          entityType: invitation.role, // ARTIST, LABEL, or STATION
          entityId: invitation.scopeId,
        },
      });
    }

    // Increment invitation usage
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        usedCount: { increment: 1 },
        status: invitation.usedCount + 1 >= invitation.maxUses ? "REDEEMED" : "PENDING",
      },
    });

    return newUser;
  });

  // Generate tokens
  const tokens = await generateTokenPair(request.server, user.id);

  return reply.status(201).send({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ...tokens,
  });
}
```

### Admin Dashboard (Vanilla HTML approach)
```html
<!-- Source: project decision - functional, not polished -->
<!DOCTYPE html>
<html>
<head>
  <title>myFuckingMusic Admin</title>
  <style>
    /* Minimal functional styles */
    body { font-family: system-ui; max-width: 1200px; margin: 0 auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    .btn { padding: 8px 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="app">
    <div id="login-view"><!-- Login form --></div>
    <div id="dashboard-view" style="display:none">
      <nav>
        <button onclick="showUsers()">Users</button>
        <button onclick="showInvitations()">Invitations</button>
        <button onclick="logout()">Logout</button>
      </nav>
      <div id="content"></div>
    </div>
  </div>
  <script src="/admin/app.js"></script>
</body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsonwebtoken | fast-jwt (via @fastify/jwt) | @fastify/jwt v7+ | Faster, maintained, better security defaults |
| bcrypt | argon2id | OWASP 2024 update | Memory-hard, resists GPU/ASIC attacks |
| Single scopeId on User | UserScope join table | This phase | Enables multi-entity scoping for all roles |
| Single-use invitations | Multi-use with maxUses/usedCount | This phase | More practical for label admins creating artist accounts |

**Deprecated/outdated:**
- `jsonwebtoken` npm package: maintenance-only, @fastify/jwt uses fast-jwt internally
- `fastify-jwt` (unscoped): deprecated in favor of `@fastify/jwt`
- Single `scopeId` on User model: being replaced by UserScope join table in this phase

## Open Questions

1. **Refresh token: JWT or opaque string?**
   - What we know: CONTEXT.md says "stored in RefreshToken table". The RefreshToken model has a `token` field (string). JWT refresh tokens are self-contained but we check DB anyway for revocation.
   - What's unclear: Whether to use a JWT (decodable) or opaque random string for the refresh token.
   - Recommendation: Use opaque string (crypto.randomBytes). Since we always look up the refresh token in the DB anyway (to check revokedAt), there's no benefit to it being a JWT. Opaque strings are simpler and can't be decoded if leaked.

2. **Invitation scopeId for multi-entity scoping**
   - What we know: Invitation has a single `scopeId` field, but UserScope supports multiple entities per user.
   - What's unclear: Should invitation carry multiple scope IDs, or should admin add additional scopes after user creation?
   - Recommendation: Keep invitation with single scopeId (simplest). Admin can add additional scopes to the user after creation via the user management endpoints. This matches the "admin can edit a user's role and scope assignments after creation" decision.

3. **Admin dashboard: same origin or separate port?**
   - What we know: Decision says "Fastify serves static files" from same backend.
   - What's unclear: URL path for admin dashboard.
   - Recommendation: Serve at `/admin/*` path from the API server using @fastify/static. This avoids CORS complexity and keeps deployment simple.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | apps/api/vitest.config.ts |
| Quick run command | `cd apps/api && pnpm test -- --run` |
| Full suite command | `cd apps/api && pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User redeems invitation code to create account | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "register"` | No -- Wave 0 |
| AUTH-02 | JWT access + refresh token flow works | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "refresh"` | No -- Wave 0 |
| AUTH-03 | User can log out (revoke refresh token) | integration | `cd apps/api && pnpm vitest run tests/routes/auth.test.ts -t "logout"` | No -- Wave 0 |
| AUTH-04 | Role-based scoped data access | integration | `cd apps/api && pnpm vitest run tests/middleware/authenticate.test.ts` | No -- Wave 0 |
| USER-01 | Admin creates invitation codes | integration | `cd apps/api && pnpm vitest run tests/routes/admin-invitations.test.ts` | No -- Wave 0 |
| USER-02 | Admin views all users with roles | integration | `cd apps/api && pnpm vitest run tests/routes/admin-users.test.ts -t "list"` | No -- Wave 0 |
| USER-03 | Admin deactivates user accounts | integration | `cd apps/api && pnpm vitest run tests/routes/admin-users.test.ts -t "deactivate"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm vitest run tests/routes/auth.test.ts tests/middleware/authenticate.test.ts tests/routes/admin-invitations.test.ts tests/routes/admin-users.test.ts`
- **Per wave merge:** `cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/routes/auth.test.ts` -- covers AUTH-01, AUTH-02, AUTH-03 (register, login, refresh, logout)
- [ ] `tests/middleware/authenticate.test.ts` -- covers AUTH-04 (preHandler middleware, role check, scope loading)
- [ ] `tests/routes/admin-invitations.test.ts` -- covers USER-01 (invitation CRUD)
- [ ] `tests/routes/admin-users.test.ts` -- covers USER-02, USER-03 (user listing, deactivation, reactivation)
- [ ] `tests/lib/auth.test.ts` -- covers password hashing, token generation, invite code generation (unit)
- [ ] Test helper: function to create test user + tokens for authenticated route testing
- [ ] `argon2` added to `pnpm.onlyBuiltDependencies` in root package.json

## Prisma Schema Changes Required

### New: UserScope model
```prisma
model UserScope {
  id         Int    @id @default(autoincrement())
  userId     Int    @map("user_id")
  entityType String @map("entity_type")  // "ARTIST", "LABEL", "STATION"
  entityId   Int    @map("entity_id")

  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([userId])
  @@map("user_scopes")
}
```

### Modified: User model
```prisma
model User {
  // ... existing fields ...
  // REMOVE: scopeId Int? @map("scope_id")
  // ADD:
  scopes             UserScope[]
  refreshTokens      RefreshToken[]  // Add relation
  invitationsCreated Invitation[] @relation("InvitationsCreated")
  // REMOVE: invitationRedeemed Invitation? @relation("InvitationRedeemed")
}
```

### Modified: Invitation model
```prisma
model Invitation {
  // ... existing fields ...
  // REMOVE: redeemedById Int? @unique @map("redeemed_by_id")
  // REMOVE: redeemedAt DateTime?
  // ADD:
  maxUses   Int    @default(1) @map("max_uses")
  usedCount Int    @default(0) @map("used_count")
  // Keep: code, role, scopeId, status, createdById, expiresAt, createdAt
}
```

### Modified: RefreshToken model
```prisma
model RefreshToken {
  // ADD relation:
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Sources

### Primary (HIGH confidence)
- @fastify/jwt GitHub repository - plugin registration, sign/verify API, cookie support, Fastify 5 compatibility (v9+), namespace feature
- Node.js crypto.randomBytes() documentation - secure random byte generation for invitation codes
- Existing project codebase - Prisma schema, route patterns, TypeBox validation, test patterns

### Secondary (MEDIUM confidence)
- argon2 npm package (v0.44.0) - hash/verify API, argon2id options (memoryCost, timeCost, parallelism)
- @fastify/static npm (v9.0.0) - Fastify 5 compatible static file serving
- @fastify/rate-limit npm (v10.x) - Fastify 5 compatible rate limiting
- @fastify/cookie npm (v10.0.1) - Fastify 5 compatible cookie support
- OWASP password hashing recommendations - argon2id as #1 recommendation for 2025+

### Tertiary (LOW confidence)
- Admin dashboard approach (vanilla HTML) - pragmatic choice based on "functional, not polished" requirement; no authoritative source on best approach for this specific use case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @fastify/jwt and argon2 are well-documented, actively maintained, and widely used
- Architecture: HIGH - follows existing project patterns (Fastify plugin routes, TypeBox, Prisma), decisions are explicit
- Pitfalls: HIGH - identified from direct codebase analysis (constant mismatch, schema changes, webhook protection)
- Admin dashboard: MEDIUM - vanilla HTML is pragmatic but implementation details are discretionary

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain, no rapidly moving targets)
