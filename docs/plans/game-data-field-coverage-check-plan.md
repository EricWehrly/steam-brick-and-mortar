# Plan: Game Data Field Coverage Check

**Status**: Not started - deferred, low priority, cheap to pick up later.

## Goal

Detect when a game-data field the UI depends on (rating, categories, description, ...) comes back
empty/default for the *entire* loaded library - a signal the field is wired to nothing, not that
the data is legitimately absent. Motivating case: the game-box rating bug where every box showed
"Unrated" because `userscore` silently defaulted instead of being omitted (see PR #161's review
thread, which removed the narrow single-field version this plan generalizes).

## Approach

A generic scan over `SteamGameData[]`: for each field on a sample record, check whether *any* game
in the batch has a real (non-default/defined) value; warn once per field with 0% coverage.

## Before acting on results: test across real variants

A 0% result isn't automatically a bug - it could be a genuinely-empty field for this account's
library, or one this build doesn't populate yet. Run the scan across desktop vs. web and cached vs.
fresh-load before wiring any per-field remediation, and use whichever combination surfaces the most
real gaps to prioritize from.

## Effort

Small - the scan itself is straightforward. The real cost is the manual test pass above, which is
what actually decides whether this becomes a permanent guard or a one-time audit.

## Related

- `client/src/steam-integration/SteamIntegration.ts` - where the removed narrow version lived, and
  where a generic version would plug back in.
