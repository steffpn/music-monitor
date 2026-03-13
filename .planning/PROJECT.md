# myFuckingMusic

## What This Is

A music monitoring platform that uses ACRCloud to continuously identify songs playing on 200+ Romanian radio stations and TV channels. A backend infrastructure records and analyzes audio streams 24/7, while an iOS app provides artists, labels, and radio stations with real-time and historical data on song airplay — including 5-second playable audio snippets from the exact moment of detection.

## Core Value

Artists and labels can see exactly where, when, and how often their music is being played across Romanian radio and TV — with audio proof.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Backend monitors 200+ Romanian radio/TV streams 24/7 via ACRCloud
- [ ] Song detection even when audio is in background (behind speech, jingles, etc.)
- [ ] 5-second audio snippets captured and stored at moment of detection
- [ ] iOS app with invite-only authentication
- [ ] Artist role: sees own songs' airplay data across all stations
- [ ] Label role: sees all artists under the label
- [ ] Station role: sees what competitor stations are playing
- [ ] Admin role: manages stations, streams, users, and invitations
- [ ] Live feed of detections in real-time
- [ ] Dashboard with aggregated stats (daily/weekly/monthly plays, top stations)
- [ ] Playable 5-second streaming snippets in-app
- [ ] Store ISRC codes, airplay duration, exact timestamps per detection
- [ ] Periodic digest notifications (daily/weekly summaries)
- [ ] Export data as CSV and PDF reports
- [ ] Stations manually added by admin (stream URLs)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Monetization/subscriptions — product needs to be fully defined first before monetization layer
- Apple Sign In / Google / Email+Password auth — v1 is invite-only, auth providers come later
- Push notifications for individual detections — digest model chosen for v1
- Android app — iOS first
- Automatic stream discovery/scraping — stations added manually by admin
- International coverage — Romania only for v1

## Context

- ACRCloud integration is a known quantity — team has account and API experience
- ACRCloud's Broadcast Monitoring service provides the core detection engine
- Backend records audio streams continuously, sends fingerprints to ACRCloud, receives detection results
- Audio snippets are cut from the recorded stream at the moment of detection (not from ACRCloud)
- Target market: Romanian music industry (artists, labels, radio stations)
- Scale expectations: 200+ concurrent streams, potentially millions of detections per month
- Architecture: monitoring backend (24/7) + API server + iOS client
- The system must be designed for scale from day one — this is not a prototype

## Constraints

- **Platform**: iOS only for v1 — Swift/SwiftUI
- **API Integration**: ACRCloud Broadcast Monitoring — already have account and API knowledge
- **Geography**: Romanian radio/TV stations only for v1
- **Auth**: Invite-only for v1 — no self-registration
- **Scale**: Must handle 200+ concurrent streams and high detection volume from day one
- **Audio Storage**: Must store 5-second snippets efficiently — significant storage requirements at scale
- **Legal**: Audio snippet storage and playback must comply with copyright considerations (5-second fair use snippets)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ACRCloud for detection | Team has experience, proven technology for broadcast monitoring | — Pending |
| Backend-driven monitoring | 24/7 reliability, not dependent on user devices | — Pending |
| We store audio snippets | ACRCloud doesn't provide playback samples, we cut from our recorded stream | — Pending |
| Invite-only auth for v1 | Controlled rollout, no self-registration complexity | — Pending |
| No monetization in v1 | Need to fully define product before adding payment layer | — Pending |
| Digest notifications over push | Less intrusive, more useful aggregated data | — Pending |
| iOS only for v1 | Focus resources, target audience predominantly iOS | — Pending |

---
*Last updated: 2026-03-14 after initialization*
