# Feature: First Load Experience

**Act**: 2 (Gate 1 — must be correct before soliciting feedback)
**Status**: Partially Implemented (anonymous store exists; definition of "correct" not yet pinned)
**Priority**: High

## Goal

A first-time visitor — someone with no Steam ID entered, no cached data — lands in a coherent, inviting experience that demonstrates what the app is and motivates them to connect their library. This needs to be "correct" before we start sharing with friends.

## Context

The anonymous demo store was built during Act 1: when no Steam user is loaded, the app populates with free-to-play games (e.g. TF2) so the store isn't empty. This was the foundation. But "first load experience" is broader than just having some games on the shelves — it encompasses:

- **What the store looks like on first arrival** — lighting, layout, signage, initial camera position
- **How the app performs on first load** — network hits, cache state, time-to-interactive
- **How a new user is guided** — where do they look? What do they do first? Is it obvious how to connect their library?
- **What happens after they connect** — the transition from demo store to their store

We don't have a concrete definition of what "correct" looks like yet. That needs a check-in pass. But the related work already in flight (metrics instrumentation, caching, network rate limiting) all feed into this — so we have something to work towards even before the definition is locked.

## Acceptance Criteria

- Anonymous store loads without errors and presents a visually coherent store
- Time-to-interactive for anonymous mode is measured and acceptable (ties into Key Metrics)
- Network behavior on first anonymous load is within acceptable bounds (no surprise CDN hits)
- A first-time user understands how to connect their Steam library without external instructions
- Transition from anonymous → connected library is smooth (no jarring layout reset)
- Definition of "correct" pinned before Gate 1 sign-off

## Stories / Tasks

- **Check-in pass**: load the anonymous store fresh; document what's working, what's broken, what's missing UX-wise
- **First-visit UX**: ensure the initial camera position, lighting, and signage communicate the concept clearly
- **Steam ID onboarding**: evaluate whether the current Steam profile input is discoverable for a new user; iterate if not
- **Anonymous → connected transition**: what happens to the store when a Steam ID is entered mid-session?
- **Performance baseline**: measure anonymous first-load time-to-interactive; tie into Key Metrics instrumentation

## Notes / Open Questions

- The anonymous store uses F2P games (currently TF2 appid 440 and similar) — is this the right fixture set for a first impression? Consider curating it slightly.
- "Correct" is a product question as much as a technical one. Pin it before Gate 1, not during.
- Ties into static hosting (Gate 1): the first-load experience can only be validated from a real public URL, not localhost.
- Related: `docs/acts/act3-ready-for-everyone.md` has the offline/bookmarklet export-format research item — the anonymous store fixture format should eventually align with whatever static export shape we land on.
