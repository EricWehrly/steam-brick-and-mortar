# Branch: openclaw/feat-demo-store

## Purpose
Support a strong **anonymous first-visit store** experience for dev/testing/showcase,
without requiring a signed-in Steam user.

Primary uses:
- CI and local visual verification
- UX polish for first-run flow
- Stable sandbox for signage/layout experiments

## Current Behavior (vs 6.2.x)

### Anonymous fixture flow
- Uses `client/src/steam/fixtures/demo-games.ts` (F2P-curated set).
- Loads via `SteamIntegration.loadDemoGames()` when no cached user path is active.
- Keeps artwork metadata in fixture data (production contract), rather than mutating model shape for tests.

### Sort/signage semantics
- Recency signage is **data-driven**, not mode-key driven:
  - if no game has `rtime_last_played > 0`, recently-played/time-bucket signs do not render.
- Avoids introducing extra global DataManager mode keys for this behavior.

### Shelf/time-bucket sign placement
- Time-bucket signs are shelf-mounted and aligned to shelf facing.
- Mount uses shelf-top anchored Y and shelf rotation for sign orientation.

### Worker/lifecycle cleanup in this branch
- ManagedWorker migration landed for texture/worker utilities.
- PixelDataCache lifecycle and docs cleaned up (including storage trade-off note restoration).

## Near-term Work (small, branch-safe)
1. Keep PR #40 comments fully addressed and non-stale.
2. Add focused regression tests for any visual placement bug fixed here.
3. Continue anonymous-store polish without broad architecture refactors.
4. Keep docs synchronized with branch reality (no stale "demo" assumptions).

## Naming note
"demo-store" branch name remains for continuity, but feature intent is now primarily
**anonymous store** behavior and polish.
