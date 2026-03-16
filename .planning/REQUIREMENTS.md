# Requirements: myFuckingMusic

**Defined:** 2026-03-14
**Core Value:** Artists and labels can see exactly where, when, and how often their music is being played across Romanian radio and TV — with audio proof.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [x] **INFR-01**: Backend monitors 200+ Romanian radio/TV streams 24/7 via FFmpeg process supervisor
- [x] **INFR-02**: Admin can add, edit, and remove stations with stream URLs
- [x] **INFR-03**: System captures 5-second audio snippets from recorded stream at moment of detection
- [x] **INFR-04**: Snippets stored in cloud storage (Cloudflare R2) with AAC 128kbps encoding
- [x] **INFR-05**: Stream health monitoring with per-stream watchdog and automatic restart on failure

### Detection

- [x] **DETC-01**: System receives and processes ACRCloud detection callbacks via webhook endpoint
- [x] **DETC-02**: Each detection stores: station, timestamp, song, artist, duration, ISRC, confidence score
- [x] **DETC-03**: Raw callbacks are deduplicated into single airplay events (gap-tolerance aggregation)
- [x] **DETC-04**: User can query historical detections by date range
- [x] **DETC-05**: Detection data is time-partitioned (TimescaleDB) for query performance at scale

### Authentication

- [x] **AUTH-01**: User can create account via admin-issued invitation code
- [x] **AUTH-02**: User session persists across app launches (JWT access + refresh tokens)
- [x] **AUTH-03**: User can log out from any screen
- [x] **AUTH-04**: Four roles (Admin, Artist, Label, Station) with scoped data access

### User Management

- [x] **USER-01**: Admin can create and send invitation codes with assigned role and scope
- [x] **USER-02**: Admin can view all users and their roles
- [x] **USER-03**: Admin can deactivate user accounts

### Dashboard & Analytics

- [x] **DASH-01**: User sees aggregated play counts (daily/weekly/monthly) on dashboard
- [x] **DASH-02**: User sees top stations playing their music
- [x] **DASH-03**: User sees station-level breakdown with trend data over time
- [x] **DASH-04**: User can search by song title, artist name, or ISRC
- [x] **DASH-05**: User can filter results by date range and station

### Live Feed

- [x] **LIVE-01**: User sees real-time detection feed via WebSocket/SSE
- [x] **LIVE-02**: Live feed filters by user's role and scope

### Playback

- [x] **PLAY-01**: User can tap a detection to play the 5-second audio snippet in-app
- [x] **PLAY-02**: Snippet plays without leaving the current view (inline player)

### Export & Reporting

- [ ] **EXPT-01**: User can export filtered detection data as CSV
- [ ] **EXPT-02**: User can generate branded PDF airplay report for a date range

### Notifications

- [ ] **NOTF-01**: User receives daily digest push notification with summary stats
- [ ] **NOTF-02**: User receives weekly digest push notification with summary stats
- [ ] **NOTF-03**: User can configure notification preferences (daily/weekly/off)

### Station Intelligence

- [ ] **STIN-01**: Station-role user can view what competitor stations are playing
- [ ] **STIN-02**: Station-role user can see top songs on competitor stations

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Platform Expansion

- **PLAT-01**: Android app for Android users
- **PLAT-02**: Responsive web dashboard (serves non-iOS users)
- **PLAT-03**: Public API for third-party integrations

### Business

- **BUSI-01**: Subscription tiers and payment processing
- **BUSI-02**: International expansion beyond Romania

### Integrations

- **INTG-01**: CMO integration (UCMR-ADA, CREDIDAM) for direct royalty reporting
- **INTG-02**: Self-registration with email/password (replace invite-only)

### Analytics

- **ANLT-01**: AI/ML trend predictions (requires 6+ months of data)
- **ANLT-02**: Advanced filtering by station type, city, format
- **ANLT-03**: Team collaboration features for labels with multiple members

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Per-detection push notifications | Notification fatigue — popular artists get 50+ detections/day |
| Full song playback | Copyright violation — no legitimate platform offers this |
| Automatic stream discovery/scraping | Unreliable URLs, ghost stations, data pollution |
| Real-time charts/rankings | Editorial product, not monitoring feature — invites methodology disputes |
| Apple Sign In / Google / OAuth | v1 is invite-only; auth providers add complexity without value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 2: Stream Recording Infrastructure | Complete |
| INFR-02 | Phase 2: Stream Recording Infrastructure | Complete |
| INFR-03 | Phase 4: Audio Snippet System | Complete |
| INFR-04 | Phase 4: Audio Snippet System | Complete |
| INFR-05 | Phase 2: Stream Recording Infrastructure | Complete |
| DETC-01 | Phase 3: Detection Pipeline | Complete |
| DETC-02 | Phase 3: Detection Pipeline | Complete |
| DETC-03 | Phase 3: Detection Pipeline | Complete |
| DETC-04 | Phase 6: Core iOS App & Dashboard | Complete |
| DETC-05 | Phase 1: Project Foundation | Complete |
| AUTH-01 | Phase 5: Authentication & User Management | Complete |
| AUTH-02 | Phase 5: Authentication & User Management | Complete |
| AUTH-03 | Phase 5: Authentication & User Management | Complete |
| AUTH-04 | Phase 5: Authentication & User Management | Complete |
| USER-01 | Phase 5: Authentication & User Management | Complete |
| USER-02 | Phase 5: Authentication & User Management | Complete |
| USER-03 | Phase 5: Authentication & User Management | Complete |
| DASH-01 | Phase 6: Core iOS App & Dashboard | Complete |
| DASH-02 | Phase 6: Core iOS App & Dashboard | Complete |
| DASH-03 | Phase 6: Core iOS App & Dashboard | Complete |
| DASH-04 | Phase 6: Core iOS App & Dashboard | Complete |
| DASH-05 | Phase 6: Core iOS App & Dashboard | Complete |
| LIVE-01 | Phase 7: Live Feed | Complete |
| LIVE-02 | Phase 7: Live Feed | Complete |
| PLAY-01 | Phase 6: Core iOS App & Dashboard | Complete |
| PLAY-02 | Phase 6: Core iOS App & Dashboard | Complete |
| EXPT-01 | Phase 8: Export & Reporting | Pending |
| EXPT-02 | Phase 8: Export & Reporting | Pending |
| NOTF-01 | Phase 9: Notifications & Station Intelligence | Pending |
| NOTF-02 | Phase 9: Notifications & Station Intelligence | Pending |
| NOTF-03 | Phase 9: Notifications & Station Intelligence | Pending |
| STIN-01 | Phase 9: Notifications & Station Intelligence | Pending |
| STIN-02 | Phase 9: Notifications & Station Intelligence | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after roadmap creation*
