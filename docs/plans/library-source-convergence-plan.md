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
    readonly playtimeForever: number
    // entity fields (name/artwork/categories/genres) — see the "one real fork" below for
    // whether these live here or are resolved from AppDetailsCache at assembly time
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
debt" from a side quest into the load-bearing wall. But it's the single biggest scope lever in
this plan, so it's an explicit decision, not an assumption.

## Entanglement: the resulting cache domains (if B2)

- **User/identity domain** (per-user): steamid, displayName, and the owned-appid list with
  playtime/last_played. `resolve_*` folds in here conceptually.
- **Game entity domain** (shared, per-appid): `AppDetailsCache` as it already exists — name,
  artwork, categories, genres.
- **Pixel domain**: `PixelDataCache`, untouched here.

A resolved `Library` = join(user's owned list, entity data). This also gives the
[[cache-clear-domain-unification]] plan real domains to name instead of the placeholder
`identity | games | metadata | pixels` — **the two plans must be reconciled**; this one likely
defines the taxonomy the other consumes.

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

This plan assumes the two preceding steps are already done, in this order:
1. **Commit the current reviewed work now-ish** (feature + event collapse + review fixes).
2. **Make `SteamIntegration` a singleton** (short pit-stop). This is a prerequisite: several of
   the findings from the recent review (e.g. the `ManualLibraryImportGateway` listener leak from
   repeated construction) dissolve once there's exactly one `SteamIntegration`, and the
   convergence work assumes a single owner of the loading pipeline.
3. **This refactor.**

## Open questions / assumptions / ambiguities (resolve before implementation)

1. **Fork A** (above): is background re-fetch gated on `owner.steamId` presence the agreed
   replacement for channel-driven re-fetch? Behavior change for bookmarklet-with-steamId.
2. **Fork B** (above): B1 (full entities persisted) or B2 (ownership-only + entity join)?
   Recommendation is B2; it's the biggest scope decision here.
3. **Scope of the entanglement fold-in**: do we execute the full user/game cache split in *this*
   refactor, or land the unified `Library` shape first and split the caches in an immediate
   follow-up? (B2 essentially requires the split; B1 lets it be deferred.)
4. **Is `demo`/anonymous a channel?** Making it one unifies `loadDemoGames` into the same assemble
   path (nice), but "provenance = demo" is slightly odd for a library with no real owner.
   Alternative: demo is the absence of a `Library`, handled before assembly.
5. **`isAnonymous()` definition** under the unified shape. Proposed: "no owner identity /
   showing the demo store" — an owner with neither steamId nor a real imported list is anonymous;
   any non-demo `Library` is not. Confirm this still matches every current caller's intent.
6. **Provenance granularity.** Is `{ channel, capturedAt }` enough for "future diagnosis," or do
   we also want the raw source hint (e.g. which file / which vanity input) retained? More metadata
   = more to keep honest; less = thinner diagnostics.
7. **Migration** of existing persisted `sbam_library_source` values (both old variants) into the
   new shape, vs. a one-time safe reset. The install base is presumably just the developer today,
   so a reset may be entirely acceptable — confirm.
8. **Module layout** (above): one module or a small folder; where the validator and assemblers
   live relative to the types.
9. **Reconciliation with [[cache-clear-domain-unification]]**: which plan owns the final domain
   taxonomy, and do they land together or in sequence?

## Non-goals

- Building the local-install source. This only shapes the convergence so that source drops in
  later as one assembler + one `LibraryChannel` member.
- Any change to `PixelDataCache` or the texture pipeline (`texture-cache-refactor-plan.md`).
- Actual merge/reconciliation of two libraries — explicitly rejected (decision #2).
- The `SteamIntegration` singleton migration itself (prerequisite, tracked separately).

## Related debt / docs

- [[user-games-cache-entanglement]] — the entanglement this executes (if B2)
- [[appid-keyed-cache-split]] — adjacent storage-format debt (the orphaned `cache_state` blob)
- [[steam-integration-loading-strategy-split]] — the loading-pipeline split this largely subsumes
- [[cache-clear-domain-unification]] — must be reconciled; likely consumes this plan's taxonomy
- `docs/plans/manual-library-export-feasibility.md` — the feature that surfaced all of this

---

**Status**: 🔮 Proposed — not started; blocked on the singleton pit-stop and on resolving Forks A/B
**Priority**: Medium-High (it's the seam the manual-import feature is currently wedged into)

---
A1 P1
