# Roadmap: myFuckingMusic

## Overview

This roadmap takes myFuckingMusic from zero to a production broadcast monitoring platform. The backend pipeline comes first (stream recording, detection processing, audio snippets) because all user-facing features depend on having real detection data flowing. Auth and user management follow, then the iOS app brings everything together into a complete user experience. Enhancement features (live feed, export, notifications, station intelligence) layer on top of the working core.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Foundation** - Dev environment, database schema with TimescaleDB, project scaffolding (completed 2026-03-14)
- [ ] **Phase 2: Stream Recording Infrastructure** - FFmpeg process supervisor recording 200+ streams 24/7
- [ ] **Phase 3: Detection Pipeline** - ACRCloud webhook receiver, detection storage, deduplication
- [ ] **Phase 4: Audio Snippet System** - 5-second snippet capture, R2 storage, presigned URL serving
- [ ] **Phase 5: Authentication & User Management** - Invite-only auth, JWT sessions, RBAC, admin user ops
- [ ] **Phase 6: Core iOS App & Dashboard** - iOS app with auth flow, dashboard, detection browsing, search, playback
- [ ] **Phase 7: Live Feed** - Real-time detection stream via WebSocket/SSE with role-based filtering
- [ ] **Phase 8: Export & Reporting** - CSV data export and branded PDF report generation
- [ ] **Phase 9: Notifications & Station Intelligence** - Digest push notifications and competitor station views

## Phase Details

### Phase 1: Project Foundation
**Goal**: Development environment and database schema are ready for all subsequent phases to build on
**Depends on**: Nothing (first phase)
**Requirements**: DETC-05
**Success Criteria** (what must be TRUE):
  1. Monorepo structure exists with backend and iOS project scaffolding, and the project builds cleanly
  2. PostgreSQL with TimescaleDB extension runs locally (Docker Compose), and detection data is stored in time-partitioned hypertables
  3. Database migrations run successfully with Prisma, including raw SQL for TimescaleDB-specific features (hypertables, continuous aggregates)
  4. Shared TypeScript types exist for detection events, stations, and user roles
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Monorepo scaffolding, Docker Compose, shared TypeScript types
- [x] 01-02-PLAN.md -- Prisma v1 schema, TimescaleDB migrations, Fastify server
- [x] 01-03-PLAN.md -- iOS Xcode project with MVVM structure and data models

### Phase 2: Stream Recording Infrastructure
**Goal**: The system reliably records audio from 200+ radio/TV streams around the clock with automatic failure recovery
**Depends on**: Phase 1
**Requirements**: INFR-01, INFR-02, INFR-05
**Success Criteria** (what must be TRUE):
  1. Admin can add a station with a stream URL and the system begins recording audio from it within seconds
  2. Each stream records into a rolling ring buffer that retains at least 3 minutes of audio at all times
  3. When a stream dies or hangs, the watchdog detects the failure and automatically restarts it within 60 seconds
  4. Admin can view stream health status (up/down, last heartbeat, restart count) for all monitored stations
  5. System sustains 200+ concurrent FFmpeg recording processes without degradation
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Station CRUD REST API with Redis pub/sub event publishing
- [ ] 02-02-PLAN.md -- FFmpeg process supervisor with watchdog, backoff, and staggered startup
- [ ] 02-03-PLAN.md -- BullMQ segment cleanup worker, Docker infrastructure, end-to-end verification

### Phase 3: Detection Pipeline
**Goal**: ACRCloud detection results flow into the system, are deduplicated into meaningful airplay events, and stored with full metadata
**Depends on**: Phase 2
**Requirements**: DETC-01, DETC-02, DETC-03
**Success Criteria** (what must be TRUE):
  1. System receives ACRCloud detection callbacks via webhook and acknowledges them immediately (no timeouts)
  2. Each detection record contains: station, timestamp, song title, artist, duration, ISRC, and confidence score
  3. Multiple callbacks for the same song on the same station within a short window are aggregated into a single airplay event (play counts are accurate, not inflated 18-36x)
  4. Raw detection callbacks and aggregated airplay events are stored as separate data, preserving both granular and summarized views
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Audio Snippet System
**Goal**: The system captures a 5-second audio clip from the recorded stream at the exact moment of each detection and makes it available for playback
**Depends on**: Phase 2, Phase 3
**Requirements**: INFR-03, INFR-04
**Success Criteria** (what must be TRUE):
  1. When a detection occurs, the system extracts a 5-second audio clip from the ring buffer at the detection timestamp
  2. Snippets are encoded as AAC 128kbps and uploaded to Cloudflare R2
  3. Each detection record links to its corresponding snippet via a presigned URL that can be used for playback
  4. Snippet extraction runs asynchronously (via job queue) without blocking detection processing
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Authentication & User Management
**Goal**: Users can access their accounts via invitation and see only data scoped to their role
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, USER-01, USER-02, USER-03
**Success Criteria** (what must be TRUE):
  1. Admin can generate invitation codes with a specific role (Artist, Label, Station) and scope (which artist/label/stations)
  2. User can redeem an invitation code to create their account and log in
  3. User session persists across app restarts (JWT access + refresh token flow works correctly)
  4. User can log out from any screen in the app
  5. Each role sees only data within its scope (Artist sees own songs, Label sees its artists, Station sees competitor data, Admin sees everything)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Core iOS App & Dashboard
**Goal**: Users can browse their airplay data, view analytics, search detections, and play audio proof snippets -- all through the iOS app
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DETC-04, PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. User sees a dashboard with aggregated play counts broken down by day, week, and month
  2. User sees which stations play their music most, with trend data over time
  3. User can search detections by song title, artist name, or ISRC and filter by date range and station
  4. User can tap any detection to hear the 5-second audio snippet inline without leaving the current view
  5. User can browse historical detections by date range and page through results
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Live Feed
**Goal**: Users see detections appearing in real time as songs are identified across stations
**Depends on**: Phase 6
**Requirements**: LIVE-01, LIVE-02
**Success Criteria** (what must be TRUE):
  1. User sees new detections appear in a live feed within seconds of identification (no manual refresh needed)
  2. Live feed shows only detections relevant to the user's role and scope (Artist sees own songs, Label sees its artists' songs, etc.)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Export & Reporting
**Goal**: Users can extract their airplay data for use outside the app
**Depends on**: Phase 6
**Requirements**: EXPT-01, EXPT-02
**Success Criteria** (what must be TRUE):
  1. User can export their current filtered detection view as a downloadable CSV file
  2. User can generate a branded PDF airplay report for a selected date range
  3. Exported data respects role-based access (users only export data they can see)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Notifications & Station Intelligence
**Goal**: Users receive periodic airplay summaries and station-role users can monitor competitor programming
**Depends on**: Phase 6
**Requirements**: NOTF-01, NOTF-02, NOTF-03, STIN-01, STIN-02
**Success Criteria** (what must be TRUE):
  1. User receives a daily push notification summarizing their airplay stats for the day
  2. User receives a weekly push notification summarizing their airplay stats for the week
  3. User can configure their notification preferences (daily only, weekly only, both, or off)
  4. Station-role user can view what songs competitor stations are playing
  5. Station-role user can see top songs on competitor stations ranked by play count
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation | 3/3 | Complete   | 2026-03-14 |
| 2. Stream Recording Infrastructure | 2/3 | In Progress|  |
| 3. Detection Pipeline | 0/TBD | Not started | - |
| 4. Audio Snippet System | 0/TBD | Not started | - |
| 5. Authentication & User Management | 0/TBD | Not started | - |
| 6. Core iOS App & Dashboard | 0/TBD | Not started | - |
| 7. Live Feed | 0/TBD | Not started | - |
| 8. Export & Reporting | 0/TBD | Not started | - |
| 9. Notifications & Station Intelligence | 0/TBD | Not started | - |
