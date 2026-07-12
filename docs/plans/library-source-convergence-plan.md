# Library Source Convergence Plan

## Goal

One unified, TypeScript-described shape for "a loaded library" that is **identical regardless of
how it was obtained** — online fetch, bookmarklet capture, file import, or (future) reading a
local Steam install. The channel/medium a library came through becomes **decorative provenance
metadata** for diagnostics, never an execution discriminant. Loading a new source **replaces**
the current library (no merge). While the boundaries are being redrawn anyway, fold in the
long-standing user-data-vs-game-data cache entanglement.

## Why now

The manual-import feature was dovetailed into the loading pipeline earlier than its shape had been
worked out, and reviewing it surfaced that the seam it landed on is the real problem, not the
feature:

- **The `|` in `LibrarySource` is the defect.** A discriminated union (`{type:'online',...} |
  {type:'imported',...}`) forces exactly one provenance per library and drives execution by
  switching on `type` (`SteamIntegration.handleGameStart`). Adding "sign in after a bookmarklet
  import" doesn't fit a union cleanly.
- **Asymmetric persistence.** The `online` variant persists a *pointer* (`userInput`, re-fetched
  on reload); the `imported` variant persists the *actual games*. `LibrarySourceStore`'s load
  validation is correspondingly asymmetric and string-literal-matched per branch
  (`LibrarySourceStore.ts:26-27`) — the kind of hand-rolled per-variant checking that TypeScript
  should be making unnecessary.
- **The channels are the same data captured differently.** The online path is
  pointer → resolve → fetch → cache game data. The bookmarklet "skips ahead" and lands equivalent
  game data directly. They differ in *capture*, not in *what they produce*. The current design
  treats that incidental difference as a structural one.

## Settled decisions (from discussion — treat as fixed unless a later section flags a conflict)

1. **No hierarchy among sources.** No "online beats imported." Sources are peers.
2. **No merge.** Each load produces the latest full library and **replaces** what was there.
   "Mix and match sources" resolves to "**change** source," which covers the real use cases
   (bookmarklet now, sign in later → the sign-in fetch replaces).
3. **Unified shape, described in TypeScript.** A library resolves to the *same* type no matter the
   channel. The compiler describes that shape; we don't re-validate per-variant by hand.
4. **Provenance is decorative.** Channel/medium is retained and attached for *future diagnosis of
   issues*, not consulted for execution decisions.
5. **Fold in the cache entanglement.** Separate user data (identity + ownership) from game data
   (shared per-appid entities) as part of this — see [[user-games-cache-entanglement]].

## Current caches (full inventory, to bound "what we're separating")

| Cache | Backing | Keyed by | Scope | Holds |
|---|---|---|---|---|
| Identity resolution | `CacheManager` (localStorage `steam_api_`) | `resolve_<vanity>` | per-user | vanity → steamid |
| User games | `CacheManager` (same) | `games_<steamid>` | per-user | **full `SteamUser`: owned games w/ playtime AND bundled entity fields** ← entanglement lives here |
| App details | `AppDetailsCache` (IndexedDB) | `appid` | **shared** | categories/genres/artwork/name per game |
| Pixel/texture | `PixelDataCache` (IndexedDB) | image URL | shared | decoded RGBA texture data ("over there", out of scope) |
| App settings | `AppSettings` (localStorage) | setting key | app | user prefs (separate concern) |
| Library source | `LibrarySourceStore` (localStorage `sbam_library_source`) | single key | app | routing state — what to boot |
| *(orphaned)* `cache_state` blob | localStorage | — | — | dead per [[appid-keyed-cache-split]] |

The entanglement is specifically **User games** above: `games_<steamid>` stores whole `SteamGame`
objects (name, artwork, categories…) *inline with* ownership facts (which appids, playtime),
duplicating what `AppDetailsCache` already holds per-appid and shared.

## Proposed shape

Illustrative — names and exact fields are for discussion, not final:

```typescript
/** The resolved, in-hand library. Same shape no matter how it was obtained. */
export interface Library {
    readonly owner: LibraryOwner
    readonly games: readonly LibraryGame[]
    readonly provenance: LibraryProvenance
}

/** Who the library belongs to. `steamId` absent ⇒ not re-fetchable (see "Re-fetch" below). */
export interface LibraryOwner {
    readonly steamId?: string
    readonly displayName?: string
}

export interface LibraryGame {
    readonly appid: number
    readonly name: string
    readonly playtimeForever: number
    // name is the one entity field kept here — see "Implementation refinement" under Fork B
    // below for why. artwork/categories/genres are never here; those are resolved from
    // AppDetailsCache per-appid at assembly time instead.
}

/** Decorative only. Never switched on for execution. */
export interface LibraryProvenance {
    readonly channel: LibraryChannel
    /** When THIS data is from (SteamUser already carries retrieved_at in this spirit). */
    readonly capturedAt: string
}

export type LibraryChannel = 'online' | 'bookmarklet' | 'file' // future: | 'local-install'
```

Key properties vs. today:
- No `type` discriminant to switch on. One shape, one validation routine, one persistence path.
- `owner`/`games`/`provenance` are always present and always the same shape; the asymmetry is gone.
- Adding a future channel (`'local-install'`) is one union member on `LibraryChannel` plus one
  assembler that produces a `Library` — **no new branch in the consuming code**, because nothing
  downstream branches on channel.

## Convergence model — how each channel lands the same shape

Every channel's job is reduced to "produce a `Library`." Nothing downstream cares which did:

| Channel | Produces the `Library` by |
|---|---|
| online | resolve vanity → steamid, fetch owned games + playtime, assemble |
| bookmarklet | parse the postMessage payload (already validated) into owned games + playtime, assemble |
| file | parse the picked JSON (same validator) into owned games + playtime, assemble |
| demo/anonymous | the fixture list, assembled with an empty owner *(open question: is 'demo' a channel?)* |
| *(future)* local-install | read local Steam files, assemble |

`SteamIntegration.handleGameStart` collapses from its 4-branch cascade to: load the persisted
`Library` (if any) → hand it to the same apply path everything else uses → else demo. The
"legacy cache scan" migration branch and the imported/online split both dissolve into this.

## The one real fork: re-fetch on reload, and where entity data lives

Two genuine decisions the "no merge / decorative provenance" rules don't settle by themselves.
Both are called out here rather than guessed at.

### Fork A — what triggers a fresh fetch on reload

Today `online` re-emits `LoadLibrary` on reload (re-fetch); `imported` uses persisted data as-is.
If channel is decorative, it **cannot** be what decides this. Proposed replacement rule:

> Re-fetchability is a property of **having a `steamId`**, not of the channel. On load: show the
> persisted `Library` immediately (fast, works for every channel), and *if `owner.steamId` is
> present*, kick off a background re-fetch that replaces it when it lands (stale-while-revalidate,
> which `CacheManager.getStale` already gestures at).

This is elegant: a bookmarklet that captured a steamId becomes re-fetchable exactly like online —
the "dovetail" the manual-import feature was reaching for falls out for free. An imported list
with no steamId simply has nothing to refresh. **This honors decision #4** (channel not consulted)
while preserving online's freshness. Flagged because it's a behavior change for the imported path
(a bookmarklet-with-steamId would now refresh on reload, which it doesn't today) and needs a yes.

**Resolved: yes.** `owner.steamId` presence is a precondition for the background re-fetch; the
existing `autoLoadProfile` setting (`AppSettings` - already gates the online-source auto-load path
today) is the second gate. Re-fetch fires only when both are true, not on steamId presence alone.

**Follow-up this unlocks**: the bookmarklet should try to capture a steamId, not just a display
name, so more imported libraries become re-fetchable. Checked `export-library.js`:
`readDisplayNameFromUrl()` only matches `/id/<vanity>/` and returns `null` for numeric
`/profiles/<steamid>/` URLs - the id is sitting right there in `location.pathname`, unread. That
half is a trivial regex addition. Whether a steamid is *also* recoverable from the OwnedGames
hydration payload on a vanity-URL profile (so vanity captures get it too) isn't confirmed - needs
a quick check against `docs/research/steam-profile-ssr-hydration-research.md` before promising it.
Small, self-contained follow-up; doesn't block this plan.

### Fork B — does the persisted `Library` hold full game entities, or ownership only?

- **Option B1 — full resolved entities in the persisted library.** Simple, self-contained, works
  offline. But it re-bundles entity data with ownership (the very entanglement we're removing),
  duplicates `AppDetailsCache` into a per-library blob, and a bookmarklet library would be
  under-populated (appid + name + playtime only) vs an online one anyway.
- **Option B2 — ownership facts only (appid + playtime + last_played + owner); entity data
  (name/artwork/categories/genres) always resolved from `AppDetailsCache` per-appid at assembly
  time.** This *is* [[user-games-cache-entanglement]]'s fix. Cleanly separates the two domains.
  Bonus: imported games would flow through the same enrichment as online and finally gain
  categories/genres (today they have none). Cost: more work; imported names must be seeded into
  `AppDetailsCache` so a bookmarklet's names aren't lost against a cold entity cache; display now
  depends on the entity cache being populated (already true for online).

**Recommendation: B2.** It's the altitude that makes the whole plan coherent — it's what lets
"user data" and "game data" be genuinely separate caches, and it turns "fold in the entanglement
debt" from a side quest into the load-bearing wall.

**Resolved: B2.** And it's a smaller lever than first framed above - the codebase already separates
these two concerns for the online path: `SteamApiClient.getUserGames()` resolves ownership+
playtime only (the raw API response), and `GamesLoader.buildEnhancedGame()` is the join step that
layers in `AppDetailsCache` entity data. B2 doesn't invent this split, it extends the split online
already has to the other channels, which today bypass it (`applyImportedLibrary` calls
`deriveArtworkFromAppId` directly instead of going through entity-cache enrichment). This isn't
"the single biggest scope lever," it's "make three channels consistent with the one that already
does this right."

**Implementation approach** (per discussion): two TypeScript types, one for ownership
(`LibraryGame` - appid/playtime/last_played) and one for entity data (name/artwork/categories/
genres - `AppDetailsData`'s job already), with persistence only ever writing the ownership shape.
The "join" happens by running ownership data through the same enrichment `GamesLoader` already
provides for online, not by carrying entity fields through to the persisted `Library`. Resolving to
fully-hydrated objects for consumers (scene/UI code) stays cheap either way - the join is a read-
time lookup keyed by appid, not a structural fork in how data flows.

**Implementation refinement: `name` moved back onto `LibraryGame`.** The first pass kept
`LibraryGame` strictly ownership-only per the sketch above, which meant an imported game's name
(known at capture time) had nowhere to live once persisted — reloading with a cold `AppDetailsCache`
showed a blank name. The fix built for that was a `seedEntityNames` write-back: stash a name-only,
mostly-fabricated `AppDetailsData` entry (guessed `type`/`is_free`/empty artwork) into
`AppDetailsCache` at import time so a later read could recover it. On review this was rejected -
fabricating placeholder entries into a cache meant to hold real Steam data is worse than the problem
it solves. `name` is not the same kind of entity data that motivated B2 in the first place: the
entanglement bug ([[user-games-cache-entanglement]]) was about categories/genres/artwork, which have
real staleness and multi-user-clearing-independence stakes; a game's name is practically immutable,
already known for free at capture time on every channel, and safe to duplicate. `LibraryGame` now
carries `name` alongside `appid`/`playtimeForever`/`lastPlayed`; `AppDetailsCache` can still resolve
a better/canonical name at assembly time (unchanged), but the persisted name is always a safe floor.
No write-back path exists; `seedEntityNames` was deleted entirely.

**Resolved: no exclusion/pruning logic for `AppDetailsCache`.** Whether it's scoped to "games this
app's users actually own (+ F2P)" or just keeps everything it's ever resolved is a non-decision -
it already fetches unconditionally regardless of who's asking, multi-profile use on one machine
means overlap across libraries is the common case anyway, and adding exclusion logic is pure extra
code for a problem that doesn't exist yet. Revisit only if cache size becomes a measured problem,
not preemptively.

## Entanglement: the resulting cache domains

- **User/identity domain** (per-user): steamid, displayName, and the owned-appid list with
  playtime/last_played. `resolve_*` folds in here conceptually.
- **Game entity domain** (shared, per-appid, unscoped/unpruned per above): `AppDetailsCache` as it
  already exists — name, artwork, categories, genres.
- **Pixel domain**: `PixelDataCache`, untouched here.

A resolved `Library` = join(user's owned list, entity data). This also gives the
[[cache-clear-domain-unification]] plan real domains to name instead of the placeholder
`identity | games | metadata | pixels`. **Resolved: this plan owns the taxonomy; the cache-clear
plan consumes it.** Once this refactor's shape is settled, update
`cache-clear-domain-unification-plan.md` to adopt these domains. They land in sequence — this one
first.

## Persistence

`LibrarySourceStore` → a `LibraryStore` persisting one `Library` shape. One validation routine
(reuse the `validateLibraryExportPayload` discipline), no per-variant asymmetry. The string-literal
`parsed.type === ...` checks disappear because there's no `type` to check.

## Target module layout (sketch)

- `LibrarySource.ts` — currently "types + a validation function," and it acquired that function
  mid-stream (it started as a pure types file). As part of this, reconsider whether the unified
  `Library` types, the wire-payload validator, and the channel assemblers want to be one module or
  a small folder. **Open**: the user has flagged unease about a types file growing methods.

## Sequencing

1. ✅ **Commit the current reviewed work** (feature + event collapse + review fixes) — done.
2. ✅ **Make `SteamIntegration` a singleton** — done. Resolved the `ManualLibraryImportGateway`
   listener-leak finding from the recent review as a side effect, and moved `maxGames` out of
   `SteamIntegration` into `AppSettings.getDefaultSettings()` (same dev/prod-default pattern as
   `enableStickers`/`enableBlockingTracker`) along the way.
3. **This refactor** — next. Broken into stories in
   [`library-source-convergence-implementation.md`](./library-source-convergence-implementation.md).

## Open questions / assumptions / ambiguities

**All resolved** (below) as of this pass — nothing gates implementation start.

1. ~~Fork A~~ — yes, gated on `owner.steamId` presence + the existing `autoLoadProfile` setting.
   Follow-up tracked: bookmarklet steamid capture (see Fork A section).
2. ~~Fork B~~ — B2, confirmed. Smaller lever than originally framed (extends an existing
   ownership/entity split, doesn't invent one).
3. ~~Entanglement fold-in scope~~ — resolved by #2: B2 requires the split, so it happens in this
   refactor, not deferred.
4. ~~AppDetailsCache pruning~~ — resolved: no exclusion logic, keep it unscoped (see Fork B section).
5. ~~**Is `demo`/anonymous a channel?**~~ — Resolved (implementation's choice). Conceptually,
   demo/anonymous is *the ownerless library we render in the absence of knowing which library to
   render* — no owner is at the helm. Whether that's modeled as a `'demo'` channel or as the
   absence of a `Library` handled before assembly is left to implementation: **pick whichever
   yields the cleanest, easiest-to-follow-and-maintain code.** Not a blocker either way.
6. ~~**`isAnonymous()` definition**~~ — Confirmed. "No owner identity / showing the demo store": an
   owner with neither a steamId nor a real imported list is anonymous; any non-demo `Library` is
   not. Matches current caller intent.
7. ~~**Provenance granularity**~~ — Resolved: `{ channel, capturedAt }` plus the vanity input we
   already retain. *Which file* is explicitly not worth keeping ("the moment that bytestream
   closes, it's a stranger"). The current candidate set is sufficient for diagnosis; revisit only
   if a real diagnostic gap appears.
8. ~~**Migration vs. reset**~~ — Resolved: reset is acceptable (install base is effectively just
   the developer). Optionally **spike/swag** a migration path as a low-stakes exercise in data
   migration — validate the happy path first (load real data via a Firefox/Chrome profile), and
   only commit to hand-rolling migration if the spike proves cheap. Not a prerequisite; the plan
   proceeds on reset by default.
9. ~~**Module layout**~~ — Resolved: unease dismissed. A types file gaining a related validator/
   assembler "makes sense." Only split into a folder if the split is *meaningful* — never break
   files out arbitrarily.
10. ~~**Reconciliation with [[cache-clear-domain-unification]]**~~ — Resolved: **this plan owns the
    domain taxonomy**; the cache-clear plan consumes it. This plan is the more mature of the two,
    and folding in the entanglement (Fork B/B2) is what produces the real domains
    (`user/identity`, `game-entity`, `pixel`) that the cache-clear plan currently names with
    placeholders. **Action: once this refactor's shape is settled/landed, update
    `cache-clear-domain-unification-plan.md` to adopt these domains** rather than its own guesses.
    They land in sequence (this first), not together.

**Tracked follow-up, non-blocking:**
- Bookmarklet steamid capture (see Fork A section) — small, self-contained, can land before,
  during, or after this refactor without changing its shape.

## Non-goals

- Building the local-install source. This only shapes the convergence so that source drops in
  later as one assembler + one `LibraryChannel` member.
- Any change to `PixelDataCache` or the texture pipeline (`texture-cache-refactor-plan.md`).
- Actual merge/reconciliation of two libraries — explicitly rejected (decision #2).
- Pruning/scoping `AppDetailsCache` by ownership — explicitly rejected (see Fork B section).
- The `SteamIntegration` singleton migration itself (prerequisite, tracked separately, now done).

## Related debt / docs

- [`library-source-convergence-implementation.md`](./library-source-convergence-implementation.md)
  — the story/task breakdown for building this
- [[user-games-cache-entanglement]] — the entanglement this executes
- [[appid-keyed-cache-split]] — adjacent storage-format debt (the orphaned `cache_state` blob)
- [[steam-integration-loading-strategy-split]] — the loading-pipeline split this largely subsumes
- [[cache-clear-domain-unification]] — must be reconciled; likely consumes this plan's taxonomy
- `docs/archive/manual-library-export-feasibility.md` — the feature that surfaced all of this

---

**Status**: ✅ Implemented (2026-07-11). Full suite green (1098 tests); verified live in-browser for
demo load, import → immediate render, and import → reload → name-survival. Bookmarklet steamid
capture (`afde55cb`) and remaining-field capture (`cb9f6dbd` - `rtime_last_played`,
`playtime_disconnected`, plus wire-layer-only appid metadata, see
[[library-game-appid-metadata-duplication]]) both landed as follow-ups. Remaining non-blocking
follow-up: updating `cache-clear-domain-unification-plan.md` to consume this plan's taxonomy
(partially done - see that plan's own status).
**Priority**: Medium-High (it's the seam the manual-import feature is currently wedged into)

---
A1 P1
