# Phase 1: Project Foundation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Development environment and database schema are ready for all subsequent phases to build on. Monorepo structure with backend and iOS scaffolding, PostgreSQL with TimescaleDB running locally, migrations with Prisma, and shared TypeScript types for the full v1 data model.

</domain>

<decisions>
## Implementation Decisions

### Monorepo structure
- Turborepo for build orchestration and task caching
- pnpm as package manager
- `apps/api` for backend server, `apps/ios` for Xcode project
- `packages/shared` for TypeScript types and constants (detection events, stations, user roles, enums, status codes)

### Backend framework
- Fastify as HTTP framework (high throughput for webhook receivers and detection pipelines)
- REST API with versioned routes under `/api/v1/`
- Prisma as ORM with raw SQL support for TimescaleDB-specific features (hypertables, continuous aggregates)
- BullMQ (Redis-backed) for async job processing (snippet extraction, detection pipelines)

### Database schema design
- Full v1 schema created in Phase 1 — all tables for all 9 phases (stations, detections, users, roles, snippets, invitations)
- TimescaleDB hypertables partitioned by time with 1-day chunks for detection data
- Continuous aggregates defined upfront for daily/weekly/monthly play counts per station, artist, song
- snake_case naming convention for all tables and columns (PostgreSQL convention, no quoting needed)

### iOS project setup
- MVVM architecture pattern with SwiftUI
- Minimum deployment target: iOS 17 (access to @Observable macro, modern SwiftUI APIs)
- Swift Package Manager for dependency management
- Custom API client built on URLSession with async/await (no Alamofire dependency)

### Claude's Discretion
- Docker Compose configuration details
- Exact Prisma schema field types and relations
- Turborepo pipeline configuration
- iOS project folder structure within MVVM pattern
- Redis configuration for BullMQ
- Continuous aggregate refresh policies

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns all subsequent phases follow

### Integration Points
- Database schema serves as the contract for all backend phases (2-9)
- Shared TypeScript types define the API contract between backend and iOS app
- Docker Compose provides the local development environment for all developers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-project-foundation*
*Context gathered: 2026-03-14*
