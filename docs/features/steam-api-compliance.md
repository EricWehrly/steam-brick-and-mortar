# Feature: Steam API Compliance

**Act**: 3
**Status**: Not Started
**Priority**: High

## Goal

Research and document all Steam API compliance requirements before public release, and produce a checklist ready for implementation.

## Context

Before opening to the public, Steam API usage must comply with Valve's terms of service. This covers privacy policy requirements, user data handling, attribution/branding rules, and any display restrictions on game metadata and artwork. This is research-first — most implementation lands in the Legal / Privacy Compliance feature.

## Acceptance Criteria

- All Steam API ToS requirements documented
- Privacy policy requirements specific to Steam API identified
- Attribution and branding requirements catalogued
- User data handling and storage policy requirements understood
- `docs/steam-api-compliance.md` produced with complete compliance checklist
- Checklist reviewed and signed off before Act 3 implementation begins

## Stories / Tasks

- **5.6.1.1** Research Steam API terms — web search, document every applicable requirement
- **5.6.1.2** Create compliance checklist — required items, privacy policy template with Steam-specific language, user consent flow plan, required disclaimers/attributions

## Notes / Open Questions

- Steam artwork and metadata has specific display rules (e.g. must link back to Steam store). Nail these down before building any public-facing sharing features.
- SteamGridDB has separate terms — those need a parallel check.
