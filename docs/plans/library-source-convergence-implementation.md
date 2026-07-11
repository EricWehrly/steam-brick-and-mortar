# Library Source Convergence — Implementation

**Depends on**: [`library-source-convergence-plan.md`](./library-source-convergence-plan.md) — read
that first for the *why* and the resolved design decisions (Forks A/B, open questions). This doc is
the *how*: an ordered, committable breakdown. It restates just enough of each decision to be
actionable; the design plan remains the source of truth if the two ever disagree.

**Status**: ✅ Implemented (2026-07-11) — all six stories landed. Actual execution order deviated
from the sequencing below (Story 2 first, since it turned out independent of the type rename;
Stories 1/3/4/5 landed together as one commit since they're all coupled around the same
persistence/dispatch pipeline; Story 6 folded into that same pass). One design refinement emerged
during implementation and is **not** reflected in the task lists below: `LibraryGame` ended up
keeping a `name` field after all, and the `seedEntityNames`/`AppDetailsCache`-write-back mechanism
Story 2 describes below was built, then deleted — see "Implementation refinement" under Fork B in
the design plan for the full reasoning. Tasks below are left as originally written for the
historical record of what was planned; they don't reflect that later correction.
**Priority**: Medium-High.

## Ground rules for this breakdown

- Each story below is independently committable per root `CLAUDE.md` TDD guidance ("incremental
  commits: each working phase is its own commit") — land and test one before starting the next.
- `yarn tsc` and `yarn test` clean after every story, not just at the end.
- Module layout is **not** pre-decided beyond what's below — the design plan resolved that unease
  is not a blocker, only split files where the split is meaningful. Treat the paths named here as
  a working proposal; change them mid-implementation if a better shape becomes obvious, no need to
  circle back to the design plan for that.

---

## Story 1 — Unified `Library` types + persistence, no behavior change yet

Goal: the new shape exists and can round-trip through storage, without anything reading from it
yet. Lowest-risk story — pure addition, old path still runs `handleGameStart`.

**Tasks**

1. `LibrarySource.ts` → `Library.ts`. Replace the `LibrarySource` discriminated union with the
   unified shape from the design plan's "Proposed shape" section:
   `Library` (`owner` / `games` / `provenance`), `LibraryOwner`, `LibraryGame` (ownership fields
   only — appid, playtimeForever, last_played — see Story 2 for why entity fields aren't here),
   `LibraryProvenance` (`channel`, `capturedAt`), `LibraryChannel`. Keep
   `validateLibraryExportPayload` and `ImportedGame`/`LibraryExportPayload` in the same file — the
   design plan resolved the "types file growing a method" unease as not worth splitting over.
2. `LibrarySourceStore.ts` → `LibraryStore.ts`: `persistLibrary` / `loadPersistedLibrary` /
   `clearPersistedLibrary`. One validation routine (a `Library` either has a non-empty `games`
   array and a `provenance.channel` or it's rejected) — no `parsed.type === ...` branching, since
   there's no `type` to branch on anymore.
3. Migration/reset (design plan Q8, resolved): **reset, not migrate.** `loadPersistedLibrary`
   simply returns `null` for anything that doesn't parse as the new shape — an old
   `sbam_library_source` blob (either `LibrarySource` variant) fails validation and is treated as
   absent, same as no persisted data. No explicit migration code. *(Optional, non-blocking: if a
   spike to migrate the old shape turns out cheap, it can be added without changing this story's
   shape — see the design plan's Q8 note on validating the happy path first.)*
4. Update every current `LibrarySource`/`LibrarySourceStore` import to the new names. Nothing
   downstream changes behavior yet — this story is a type/persistence rename plus reset semantics.

**Tests**: unit tests for `validateLibraryExportPayload` (already exist, adjust to new shape),
new/adjusted `LibraryStore` persistence round-trip tests (valid `Library` persists and reloads;
old-shape or malformed JSON in `localStorage` reloads as `null`, not a throw).

---

## Story 2 — Ownership/entity split (Fork B2): the load-bearing story

Goal: extend the entity join that **already exists for the online path**
(`SteamApiClient.getUserGames()` → ownership, `GamesLoader.buildEnhancedGame()` → join against
`AppDetailsCache`) to the imported/bookmarklet channels, which currently bypass it. This is what
the design plan calls "the altitude that makes the whole plan coherent" — do it as its own story,
not folded into the collapse in Story 4, because it's the one with real risk (cold-cache display).

**Tasks**

1. In `SteamIntegration.applyImportedLibrary` (`client/src/steam-integration/SteamIntegration.ts:300`),
   stop calling `deriveArtworkFromAppId(g.appid)` directly to build a fully-populated `SteamGame`.
   Instead:
   - Seed `AppDetailsCache` with the imported names (`{ appid, name }` at minimum) for any appid
     not already present — this is the "cold cache" mitigation the design plan calls out: without
     it, a bookmarklet import's names would be lost the first time the entity cache doesn't already
     have that appid.
   - Route the ownership list (`appid`, `playtime_forever`) through the same enrichment call
     `GamesLoader` uses (`buildEnhancedGame`, currently private to `GamesLoader.ts:246` — likely
     needs to become exported/shared rather than reimplemented) to produce the same
     categories/genres/artwork imported games currently lack.
2. Persist only the ownership shape (`LibraryGame[]`: appid + playtimeForever) via `LibraryStore`,
   not the enriched `SteamGame[]` — enrichment is a read-time join, not something carried through
   persistence. This is the concrete form of "the join happens by running ownership data through
   the same enrichment `GamesLoader` already provides... not by carrying entity fields through to
   the persisted `Library`" from the design plan's Fork B resolution.
3. Confirm `SteamApiClient.getUserGames()`'s existing output (already ownership-shaped) needs no
   change — this story is about bringing the other two channels up to its level, not altering it.

**Tests**: an imported/bookmarklet library with a cold `AppDetailsCache` still shows correct names
immediately (seeded) and gains categories/genres once enrichment resolves — mirror whatever test
coverage exists for the online path's enrichment today. Regression check: imported game count and
playtime are unaffected by the routing change.

---

## Story 3 — Fork A: re-fetch gating on reload

Goal: `owner.steamId` presence, gated by the existing `autoLoadProfile` setting, is what triggers a
background re-fetch on load — not channel.

**Tasks**

1. On startup, after a persisted `Library` is loaded and rendered (see Story 4), check: if
   `library.owner.steamId` is present **and** `AppSettings.get('autoLoadProfile')` is true, emit
   `SteamLoadLibraryEvent` in the background exactly as the current `online`-source auto-load does
   today (`SteamIntegration.ts:228-234`), letting it replace the rendered library when it lands.
   No change to `handleLoadLibrary`'s replace-in-place behavior (`LibraryReloadRequest` before
   applying).
2. A library with no `owner.steamId` (a pure bookmarklet/file import today) simply has nothing to
   refresh — no special-case branch needed, the `if` above only fires when the field exists.

**Tests**: persisted library with `steamId` + `autoLoadProfile: true` triggers a `LoadLibrary`
emit after initial render; same library with `autoLoadProfile: false` does not; persisted library
without `steamId` never emits regardless of the setting.

---

## Story 4 — Collapse `handleGameStart`'s cascade

Goal: the 4-branch cascade in `SteamIntegration.handleGameStart` (`SteamIntegration.ts:219-262`) —
imported / online+autoLoad / legacy cache scan / demo fallback — becomes: load persisted `Library`
→ apply it through one path → else demo. This is the payoff story; it only works cleanly once
Stories 1–3 exist underneath it.

**Tasks**

1. Replace the `source?.type === 'imported'` / `source?.type === 'online'` branches with one:
   `const library = loadPersistedLibrary(); if (library) { applyLibrary(library) }` — a single
   `applyLibrary` that does what `applyImportedLibrary` does today (set user data, store + emit,
   batch-emit games) regardless of channel, since nothing downstream should branch on it per the
   design plan's core rule.
2. Delete the "legacy cache scan" branch (`SteamIntegration.ts:240-250`, the
   `this.steamClient.getCachedUsers()` fallback) entirely. It existed to bridge pre-`LibrarySource`
   cached profiles forward; Story 1's reset-not-migrate decision means there's no equivalent bridge
   need for pre-`Library` data either — same justification, same removal.
3. `loadDemoGames()` fallback stays as the final else, unchanged in spirit. Per the design plan's
   Q5 resolution, whether demo becomes a `LibraryChannel` member or stays "the absence of a
   `Library`, handled before assembly" is an implementation call — **default to leaving it as an
   explicit fallback outside the channel set** (simplest to read, matches current code shape)
   unless unifying it into one more assembler turns out to shrink the code, per the plan's "pick
   whichever yields the cleanest code" instruction.
4. Wire `applyLibrary`'s error path the same way the current catch blocks do (`isAnonymous()` check
   → fall back to demo) so the "panel stays hidden on load failure" regression fix from the earlier
   review doesn't regress.

**Tests**: existing `steam-integration.test.ts` / `import-library.test.ts` /
`demo-load-ordering.test.ts` suites should mostly still pass conceptually but need updating for the
single-path shape — this is the story most likely to touch the most existing test files. Delete
tests that only existed to cover the legacy-cache-scan branch.

---

## Story 5 — `isAnonymous()` under the unified shape

Goal: redefine per the design plan's Q6 resolution — "no owner identity / showing the demo store":
an owner with neither a `steamId` nor a real imported list is anonymous; any non-demo `Library` is
not.

**Tasks**

1. `isAnonymous()` currently reads `DataManager.getInstance().get<string>('steam.userInput')`
   (`SteamIntegration.ts:141-143`). Blast radius check done: `steam.userInput` is set/read/deleted
   only within `SteamIntegration.ts` itself (three call sites, all in this class) — safe to change
   its source of truth without touching other files.
2. Decide (small, local call, not worth a design-plan round-trip): either (a) keep the
   `DataManager` key as the mechanism but derive it from `library.owner` at the two write sites
   (`loadGamesForUser` success, `applyLibrary` success, `handleClearCache`), or (b) drop the
   `DataManager` key entirely and have `isAnonymous()` read directly off whatever in-memory
   `Library`/owner state `GameLibraryManager` already holds. Prefer (b) if `GameLibraryManager`
   already exposes something equivalent — one less piece of duplicated state — otherwise (a) is a
   smaller diff.

**Tests**: `isAnonymous()` unit coverage for: no persisted library (true), demo loaded (true),
online library with steamId (false), imported library with a display name but no steamId (false),
imported library with neither steamId nor display name (per current comment at
`SteamIntegration.ts:334-336`, still counted as *not* anonymous — "real user data either way").
Confirm this still matches Q6's confirmed definition before locking the test in.

---

## Story 6 — Cleanup pass

Goal: remove everything the convergence made obsolete. Net line count should drop, matching the
success metric from the earlier code-review round.

**Tasks**

1. Delete `deriveArtworkFromAppId`'s direct-call site in the old `applyImportedLibrary` shape if
   Story 2 fully replaced it (confirm no other caller needs the old triplicated pattern back).
2. Remove now-dead `LibrarySource`/`ImportChannel`/asymmetric-persistence references across
   `client/src/steam-integration/index.ts` and any remaining imports.
3. Sweep test mocks/fixtures for `LibrarySource`-shaped test data and update to `Library`.
4. Re-run the full test suite once, not per-file, to catch cross-file breakage the per-story test
   runs might have missed.

---

## Cross-cutting: the cache-clear-domain-unification plan

Per the design plan's resolution: **this refactor owns the domain taxonomy**
(`user/identity`, `game-entity`, `pixel`), and `cache-clear-domain-unification-plan.md` is
downstream. Once Story 2 (the entity split) lands, that plan needs a follow-up pass to replace its
placeholder `identity | games | metadata | pixels` set with the real domains this refactor produces.
Not part of this sequencing — tracked as a reminder here so it isn't lost.

---

## Non-goals (inherited from the design plan)

- Local-install source, `PixelDataCache`/texture pipeline changes, actual multi-library merge,
  `AppDetailsCache` pruning — all explicitly out of scope, see the design plan's own Non-goals.

---

**Status**: 🔮 Ready to start — Story 1 has no dependencies and can begin immediately.

---
A1 P1 O2
