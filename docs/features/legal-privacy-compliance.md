# Feature: Legal / Privacy Compliance

**Act**: 3
**Status**: Not Started
**Priority**: High

## Goal

Establish full legal and privacy compliance for public release — privacy policy, user consent flows, data handling, and Steam/content attribution.

## Context

Public release requires compliance with GDPR, CCPA, Steam API terms, and content licensing. Users' Steam library data is personal data. The app also surfaces third-party content (game artwork, metadata) with attribution requirements. This is largely implementation of the compliance checklist produced by the Steam API Compliance research feature.

## Acceptance Criteria

- Comprehensive privacy policy published (covers Steam API data, AWS, SteamGridDB)
- User consent flow implemented for Steam API data access
- Data deletion and account management options available
- GDPR/CCPA data retention and deletion policies implemented
- Steam branding and attribution implemented per API terms
- Required legal disclaimers and notices present
- DMCA takedown procedure documented
- Content licensing documentation complete

## Stories / Tasks

- **9.1.1.1** Draft privacy policy — all data sources, retention, third-party integrations
- **9.1.1.2** User consent management — consent flow UI, granular options, data deletion
- **9.1.1.3** Data handling compliance — retention policies, user data export, audit logging
- **9.1.2.1** Steam branding and attribution — required branding, proper attribution, legal disclaimers
- **9.1.2.2** Content licensing compliance — game artwork licensing, DMCA procedure, `THIRD_PARTY_LICENSES.md` complete

## Notes / Open Questions

- Block on Steam API Compliance research feature — don't draft the privacy policy until the compliance checklist is done.
- GDPR applies if any EU users are anticipated; CCPA applies for California. Assume both.
