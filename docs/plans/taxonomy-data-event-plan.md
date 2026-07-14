# Plan: Taxonomy Data Event (separating "what games" from "what sorts")

**Status**: Signed off — decisions below, ready to move to implementation planning
**Supersedes**: the "not a new event type" stance in
[`sort-filter-data-provenance.md`](../architecture/sort-filter-data-provenance.md)'s gating
section, and the someday item "Gate sort/filter UI on data availability" in
[`act4-encore-someday-maybe.md`](../acts/act4-encore-someday-maybe.md) — this plan is that item,
pulled into active work.
**Related**: [Desktop Local Data Pipeline Plan](desktop-local-data-pipeline-plan.md) — the
concrete data source (local collections/tags) that motivated separating these two concerns

## The reframing this plan is built on

Two questions that have been getting answered by the same mechanism, and shouldn't be:

- **"What games are available?"** — ownership. Appid, name, playtime, last-played. Sourced from
  the ownership payload (web) or the local candidate set (desktop, per the pipeline plan above).
- **"What sorts/filters are available for those games?"** — taxonomy. Genres, categories,
  community tags, user collections. Sourced from `appdetails`/SteamSpy (both channels) or local
  files (desktop-only: tags, user collections).

Today these are conflated: the only "new data" events that exist
(`LibraryManifestReady`/`GamesBatchReady`/`GameDataReady`, all in `client/src/types/InteractionEvents.ts`)
mark ownership data arriving, and the sort/filter UI has no signal at all for "taxonomy data
changed" — because until `LocalSteamDataWriter`, taxonomy data always arrived bundled with (or
very shortly after) the same batch that carried ownership data. That's no longer true: the
desktop local-scan writes tag/developer/publisher data into `AppDetailsCache` on a completely
separate timeline from however the game list itself gets populated. Reusing an ownership event
as the taxonomy signal — which is what `sort-filter-data-provenance.md` currently proposes —
doesn't cover that case. This plan proposes an actual second event instead.

## Current state (confirmed by code, not assumed)

- `client/src/ui/LayoutControlPanel.ts:43-48` (`SORT_OPTIONS`) and `:34-41` (`GROUP_OPTIONS`) are
  **fixed, compile-time arrays** — not computed from loaded game data at all.
- There's already a **dead gating stub**: `DataManager` flag `steam.hasRecencyData`, read at
  `LayoutControlPanel.ts:69,193,228` to conditionally hide "By Recency"/"By Last Played" — but
  **nothing in the codebase ever writes this flag**. It always defaults `true`, so the gate never
  actually fires, and even if it did, it's only checked once at panel construction, not
  re-evaluated on any event. This is the exact mechanism this plan is building, half-started and
  abandoned. This plan replaces it rather than finishing it standalone — a single general
  mechanism, not one narrow flag plus a new general one (see "Survey before you extend" in the
  project's `CLAUDE.md`).
- Confirmed defaults, both real: real logged-in users get `GroupMode.ByRecency` +
  `SortMode.ByLastPlayed` (`GameSorter.ts:101-113`); the anonymous/demo store gets
  `GroupMode.ByGenre` + `SortMode.ByPlaytime` (`GameSorter.ts:104-106`) — though the playtime sort
  is a no-op there in practice, since `GamesLoader.getDemoGames()` always sets
  `playtime_forever: 0` for demo entries. Grouping by genre is the meaningful part of that default.
- No event resembling "taxonomy dimensions changed" exists anywhere in `InteractionEvents.ts`.

## New event: `TaxonomyDataReady`

Name confirmed — no longer a placeholder.

**Payload: none, or as close to none as the event type system allows.** Per this codebase's
event-driven rules and per the explicit design intent here — listeners re-derive "what's
available" by scanning the data they can already reach (`AppDetailsCache`, the current game
list), not by trusting whatever the event happened to carry. The event is a doorbell, not a
delivery. If a payload is unavoidable for typing reasons, `{ readonly source: 'network' |
'local-scan' }` is the most it should carry — never a games/tags array.

**Emission points** (every place that writes taxonomy-shaped data into `AppDetailsCache`):
1. `GamesLoader.ts:188`, right after `this.appDetailsCache.setMany(fetchedAppDetails)` inside
   `fetchAndEmitUncached` — the existing network/Lambda path.
2. `LocalSteamDataWriter.writeLocalAppMetadata`, right after its own `cache.setMany()` call — the
   new desktop local-scan path.
3. Whatever writes the (not-yet-built, see task 13 in the pipeline plan) user-collections data —
   same pattern, same event.

**Listener**: `LayoutControlPanel.ts` — replace the dead `steam.hasRecencyData` read with a real
handler that, on `TaxonomyDataReady` (and on initial `GameDataReady`, so the panel isn't empty
before any taxonomy data has landed at all), re-derives the available `SORT_OPTIONS`/
`GROUP_OPTIONS` by scanning current data:

- Iterate the currently-known game/appdetails set once (a single dedup/aggregate pass, not a
  per-option re-scan) and record which fields have *any* non-empty presence: `genres`,
  `categories`, `steamspy_tags`, and (new) user-collection membership.
- Build the option list from what's actually present, instead of a fixed array — this is the
  `sort-filter-data-provenance.md` gate finally implemented, generalized to more than one row.
- Re-run this derivation every time `TaxonomyDataReady` fires, not just once at construction —
  closes the other half of why `steam.hasRecencyData` never worked even when it was read.

## Default sort selection: presence-driven, not channel-driven

This is the part worth being deliberate about, because it's also the part most at risk of
becoming an `isTauri()`/"is desktop" special case — which this codebase's "capability-based
handler selection" principle (default handlers work everywhere; feature-rich handlers
self-register when the *capability* is present) argues against, and which isn't even what was
asked for: "sort by \[user collections\] **if they're present**, and fall back to last-played if
not" is already phrased as data-presence-driven, not platform-driven. Concretely:

```
if user-collection data present for this library:
    default group/sort = ByUserCollection
else:
    default = today's existing behavior, unchanged:
      real user  -> ByRecency / ByLastPlayed
      anonymous  -> ByGenre / ByPlaytime
```

Because user-collection data is (today) only ever produced by the desktop local-scan path, this
naturally reduces to "desktop gets collection-sorted by default, web doesn't" **without any
platform check anywhere in the logic** — the capability gate does that work implicitly. This is
also why the web flow is expected to keep working exactly as it does today: nothing about its
data changes, so nothing about its default-sort derivation changes either. Worth confirming this
reasoning against the actual implementation once it's written, not just asserting it holds.

### Preference order, codified once (decision)

Rather than re-deriving "which dimension wins" ad hoc each time `TaxonomyDataReady` fires, the
handler consults a single ordered list, first match wins:

```
1. ByUserCollection   (if user-collection coverage crosses its threshold — see below)
2. ByRecency / ByLastPlayed   (real user, no qualifying collection data)
3. ByGenre / ByPlaytime       (anonymous/demo — unchanged fallback)
```

This is a static, ordered list, not a per-event recomputation of "what should win" — the only
thing that changes per-event is *which* entries in the list currently qualify, evaluated top to
bottom. Adding a future dimension (e.g. tag-coverage-based default) means inserting it at the
right rank in this list, not re-litigating the whole decision.

**Where this matters for testing, not runtime**: per the reframing that prompted this plan, this
selection realistically only matters once, at initial store load — a user isn't expected to
re-trigger it mid-session in a way that should visibly re-sort their view out from under them.
So the implementation risk isn't runtime correctness under repeated event storms, it's "does the
right default get chosen the first time, before the user has looked at anything." Unit/integration
coverage should assert, for each rank in the list: taxonomy data arrives (event fires), the
data scanned contains what's expected for that rank to qualify, and the resulting default matches
that rank — not a higher or lower one. If that's covered, the runtime behavior falls out for free.

## Genre/category id→name table (pipeline plan task 10, pulled forward)

**Decision**: harvest from the **pre-baked `appdetails` cache bundle**, not from live
`appdetails`/Lambda responses. Re-verified this session:
`client/public/steam-cache/app-details.json.gz` (3.4MB) exists on disk right now. Since Vite's
`publicDir` copies `client/public` verbatim into both web and desktop builds
(`client/vite.config.ts:3`, `desktop/tauri-app/tauri.conf.json:5-8` pointing `frontendDist` at the
same `client/dist`), this bundle is genuinely present and reachable today — independent of the
still-open `scripts/release.sh` `build_web()`/`build_desktop()` automation gap, which is about
*re-baking on future releases*, not about whether today's bundle exists. That bundle already contains
`{id, description}` pairs for genres/categories across whatever library it was baked from —
global, stable ids, same reasoning as before, just sourced from a static asset already on disk
instead of a network call. This means the id→name table build has **zero Lambda dependency**,
which matters given the "assume the Lambda disappears" posture below. A small static fallback
table (covering the ~30 genres / ~90 categories Steam has today) is still worth shipping as a
last-resort bootstrap for a bundle that's somehow missing or stale, but isn't the primary
mechanism.

**Flagged for later, not now**: coverage/freshness of the baked bundle's id→name pairs has only
been reasoned about, not measured against a real, large personal library. Revisit once a few
friends' libraries have gone through this pipeline — fold into a broader data-integrity audit
(bundle staleness, tag coverage, collection-parse edge cases) rather than a one-off check of this
table alone.

## Achievement data and other local ownership hints (not scoped here, but not "just a sort dimension" either)

Clarifying a prior miscommunication in this doc: achievement-cache data
(`appcache/librarycache/<appid>.json`, findings doc §5) is not primarily interesting as a future
sort dimension ("completion %"). Its actual value is as an **ownership/completeness signal** —
if a user has an achievement-cache entry for an appid, that's strong evidence they own or have
played it, independent of (and potentially catching games missed by) the `appinfo.vdf`-derived
candidate set. This is already captured correctly in
[`desktop-app.md`](../features/desktop-app.md#revisit-connect-steam-priority-ownership-signals-not-yet-scheduled)'s
"eager-but-bounded owned heuristic" as one of the four unioned signals — this note exists just to
make sure that's not lost or re-narrowed back to a display-only feature. Also worth another pass
over the findings doc once implementation starts: are there other local files/hints beyond the
four already enumerated (installed, library-registered, collection-member, achievement-cache)
that could round out ownership detection further, within the same "not too eager, no bare
`appinfo.vdf` presence" guardrail? Not chased further here — tracked as a prompt for that pass,
not a new task.

## Operating assumption: the Lambda may not be there

Per explicit instruction, this plan (and the pipeline plan it depends on) should be built and
reviewed as if the hydrator Lambda could disappear or be unreachable, and should flag anywhere
that assumption is shaky rather than assuming best-case network availability:

- **Already fine**: the headline win of this whole effort — tags via `store_tags` +
  `localization.vdf`, and now genre/category names via the baked bundle above — has zero Lambda
  dependency once built. Same for identity, playtime, and user collections (all local-file reads).
- **Flag**: `GamesLoader.isMetadataComplete()` (`client/src/steam/GamesLoader.ts:206-259`) still
  gates on `categories.length>0 || genres.length>0`. Local-scan-written cache entries leave both
  `undefined` today (`LocalSteamDataWriter`'s documented limitation), so every locally-seeded
  entry is currently judged "incomplete" and queues a network refetch attempt on every run — one
  that will silently never succeed if the Lambda is unreachable, and will retry indefinitely
  without a circuit-breaker as far as this plan has verified. Once the baked-bundle harvesting
  above lands and `LocalSteamDataWriter` starts populating `categories`/`genres`, this resolves
  itself for any appid the bundle covers — but appids missing from both the bundle and any live
  fetch (Lambda down, never-baked title) would stay "incomplete" forever with no fallback
  "good enough, stop asking" state. Worth a concrete decision during implementation: should
  `isMetadataComplete` accept "has tags, name, developer, publisher, just no genre/category" as
  good enough for local-only entries, rather than treating it as permanently incomplete?
- **Testing hook the user is already planning**: commenting out `VITE_STEAM_API_BASE_URL` in
  `client/.env.tauri` (see `client/.env.tauri.example`) is a real, already-available way to
  exercise "Lambda unreachable" locally — worth using deliberately once this lands, not just as
  an accident of a misconfigured `.env`.

## Decisions (were open questions, now resolved)

- **Event name**: `TaxonomyDataReady`, final.
- **Coverage threshold, configurable, not hardcoded.** User-collection default-sort selection
  gets a floor — "at least N% of the library sorted into a collection," not bare presence — same
  shape as the tag-coverage idea already floated in `sort-filter-data-provenance.md`. **N defaults
  to 50%, but lives as a real setting, not a constant.** Concretely: add a new key to
  `client/src/core/AppSettings.ts`'s `Setting` const map (e.g.
  `Setting.TaxonomyCoverageThreshold`), following the same pattern every other tunable there
  already uses — typed access, `localStorage` persistence, default value, event-driven change
  notification via `AppSettingsEventTypes`. This gives "save down a new value later" for free,
  it's the same mechanism the rest of `AppSettings` already provides; no new persistence layer
  needed. Applies to both the collection-coverage floor and (if implemented similarly) the
  tag-coverage floor — one setting or two is an implementation-time call, not a design one.
- **Dead `steam.hasRecencyData` flag: delete outright**, confirmed. It's read in exactly one file
  (`LayoutControlPanel.ts`), written nowhere, and this plan replaces its intended job wholesale —
  no reason to keep a narrower, half-working mechanism alongside the general one.
- **Multiple simultaneously-available dimensions**: resolved by the codified preference-order
  list above (`ByUserCollection` > `ByRecency`/`ByLastPlayed` > `ByGenre`/`ByPlaytime`) — first
  qualifying rank wins as *default*; every qualifying dimension still gets *offered* as a menu
  option regardless of rank. No further tie-breaking logic needed beyond list order.

## Related

- [Sort/Filter Data Provenance](../architecture/sort-filter-data-provenance.md) — the spec this
  plan's gate reads from; needs a follow-up edit once this plan is implemented to replace its
  "reuse an existing event" language
- [Desktop Local Data Pipeline Plan](desktop-local-data-pipeline-plan.md) — the data sources
  (tags, collections) this plan's gate reacts to
- `client/src/ui/LayoutControlPanel.ts`, `client/src/scene/categorization/GameSorter.ts`,
  `client/src/scene/categorization/SectionSorter.ts` — code this plan changes
- `client/src/steam/GamesLoader.ts`, `client/src/steam/LocalSteamDataWriter.ts` — the two
  `TaxonomyDataReady` emission points
