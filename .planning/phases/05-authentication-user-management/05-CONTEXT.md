# Phase 5: Authentication & User Management - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Invite-only authentication with JWT sessions, role-based access control, and admin user operations. Admin can generate multi-use invitation codes, users redeem codes to create accounts, JWT access+refresh tokens manage sessions, and a Fastify preHandler middleware enforces role-based data scoping across all protected endpoints. Includes a basic admin web dashboard for user and invitation management. iOS auth UI is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Invitation flow
- Multi-use invitation codes with admin-set redemption limit (e.g., "10 uses for this label's artists")
- 7-day expiry on all invitation codes (fixed, not admin-configurable per invite)
- User provides email + password + name when redeeming an invitation code
- Role and scope inherited from the invitation — user doesn't choose their role
- Admin copies invitation code from API response and shares manually (email, WhatsApp, etc.) — no automated email delivery
- Invitation tracks: code, role, scopeId, maxUses, usedCount, expiresAt, createdById, status

### Session & token handling
- JWT access token: 1-hour expiry
- Refresh token: 30-day expiry, stored in RefreshToken table with revokedAt field
- Unlimited concurrent device sessions — each device gets its own refresh token
- Logout revokes only the current device's refresh token (other devices stay logged in)
- Refresh endpoint: accepts expired access token + valid refresh token, returns new access + refresh token pair
- Token rotation: new refresh token issued on each refresh, old one revoked (prevents reuse)

### Role-based data scoping
- Separate UserScope join table instead of single scopeId on User — allows multi-entity access for all roles
- UserScope maps user to entity type + entity ID (e.g., user 5 -> artist 12, user 5 -> artist 15)
- All roles support multi-entity scoping: Artist (multiple artist records), Label (multiple labels), Station (multiple stations)
- Admin role: no scope entries, sees everything
- Scope enforcement via Fastify preHandler middleware: decodes JWT, loads user + scopes from DB, attaches to request object
- Route handlers filter Prisma queries by user's scoped entity IDs
- All existing endpoints get JWT auth protection except webhooks (ACRCloud webhook keeps shared secret auth)
- Snippet URL endpoint (GET /airplay-events/:id/snippet) gets JWT auth (existing TODO)
- Station CRUD endpoints get JWT auth with admin-only access

### Admin user operations
- First admin bootstrapped from ADMIN_EMAIL + ADMIN_PASSWORD environment variables on first startup (if no users exist in DB)
- Admin can list all users with role and scope info
- Admin can deactivate a user — immediately revokes all their refresh tokens; access token works until expiry (up to 1 hour) but can't be refreshed
- Admin can reactivate a deactivated user — sets isActive back to true, user can log in again with existing credentials
- Admin can edit a user's role and scope assignments after creation
- Basic admin web dashboard included in this phase for user management and invitation generation

### Admin web dashboard
- Basic web UI for admin operations: user listing, invitation creation, user deactivation/reactivation, scope editing
- Serves from the same backend (Fastify serves static files or uses a lightweight frontend framework)
- Protected by same JWT auth — admin role required
- Functional, not polished — dashboard UI refinement can happen later

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

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- **User model** (schema.prisma): Has email, passwordHash, name, role, scopeId, isActive, lastLoginAt — needs scopeId replaced by UserScope relation
- **Invitation model** (schema.prisma): Has code, role, scopeId, status, createdById, redeemedById, expiresAt — needs maxUses/usedCount fields added, redeemedById changed to support multi-use
- **RefreshToken model** (schema.prisma): Has userId, token, expiresAt, revokedAt — ready for use
- **UserRole enum** (packages/shared/enums/roles.ts): ADMIN, ARTIST, LABEL, STATION — ready
- **User/Invitation TypeScript types** (packages/shared/types/): UserCreate, UserPublic, InvitationCreate interfaces — need updating for new scope model
- **Fastify route plugin pattern**: routes/v1/{resource}/ with index.ts + schema.ts + handlers.ts
- **TypeBox validation**: Schema validation on request bodies (used in station routes)

### Established Patterns
- REST API with versioned routes under /api/v1/
- TypeBox for Fastify route validation with compile-time type inference
- Pino structured logging
- Vitest for testing with Docker-based integration tests
- Graceful shutdown handling (SIGTERM/SIGINT)

### Integration Points
- Snippet endpoint has `// TODO: Phase 5 -- add JWT auth middleware` placeholder
- Station CRUD routes need auth middleware added (admin-only)
- Webhook route keeps existing shared secret auth (no JWT)
- iOS app (Phase 6) will consume auth endpoints: login, register, refresh, logout
- Admin dashboard served from backend or as separate app in monorepo

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (admin web dashboard included per user decision)

</deferred>

---

*Phase: 05-authentication-user-management*
*Context gathered: 2026-03-15*
