# Layout Pipeline: Group, Sort, Section, Placement

*Plan created: 2026-04-18*
*Supersedes: `layout-sections-design-intent.md` (earlier conversation notes)*

---

## Summary

The current store rendering pipeline conflates grouping with sorting. `by-genre` is
treated as a sort mode, but it's actually "group by genre, then sort within groups."
Signs try to re-derive group boundaries from a flat sorted list — fragile, and several
sort modes have no sign support at all.

This plan separates **Group**, **Sort**, **Layout**, and **Placement** into distinct
pipeline stages with clean event seams between them.

---

## Pipeline

```
Games loaded (data)
    → Layout selected         (spatial strategy: arcs, rows, zones)
    → Grouping applied        (partition into 0-N sections)
    → Sort applied            (ordering within each section)
    → Placement               (fill shelves with games)
```

Each `→` is an event boundary. Defaults fire on initial load. The player can
re-trigger any step, and everything downstream re-runs:

- Change **layout** → re-derive section positions, re-place everything.
- Change **grouping** → re-partition games, re-assign sections, re-place.
- Change **sort** → re-order within sections, re-place.

### First load vs. re-trigger

On first load, the pipeline runs top-to-bottom with defaults. After that, the
driving force is player interaction (re-group, re-sort, re-layout). The resource
loading step (artwork prefetch) stays at data-load time — before any layout/group
decision. This is correct because:

- Prefetch is per-game, placement is per-section. A game in 3 sections is prefetched
  once and placed 3 times.
- Re-grouping uses the same games — just different positions. Atlas slots aren't wasted.
- First-paint latency matters; deferring prefetch to after grouping would slow visible startup.

---

## Concepts

### Layout

Owns the **spatial strategy**: where sections can go, and how shelves within a
section are arranged.

Two families:

- **Computed** — arcs, rows. Section positions are derived from a function.
  "Put section N at angle θ" or "put section N at row Y." Supports arbitrary
  section count.
- **Fixed** — predefined zones. "Genre A goes in the east wing." Hard-forked
  from computed; a later feature.

The Layout receives pre-built sections and decides where they go spatially.
It does **not** decide what the sections are — that's Grouping's job.

Layout also handles chunking: an 800-game ungrouped section is one semantic section
but the layout splits it across 45 shelf runs for spatial reasons. This chunking
is spatial, not semantic — Layout's concern, not Grouping's.

**Layout responsibilities:**
- Assign spatial allocations to sections
- Decide shelf arrangement within a section (arc curve, row grid, etc.)
- Chunk large sections into shelf runs
- Own the `ILayoutStrategy` interface (see `layout-variations.md`)

### Grouping

Partitions the game library into **0-N named sections**.

- **0 sections** (ungrouped): one big collection. Playtime sort, rating sort.
  The degenerate case — semantically equivalent to 1 section with all games.
- **N sections**: genre groups, tag groups, ownership status, etc.
- A game can appear in **multiple sections** if it matches multiple group criteria.

Grouping produces `Section[]`, each with a name (used for signage) and a game list.
Grouping knows nothing about spatial layout.

### Sort

Ordering within a section. Pure function: takes a game list, returns a sorted game
list. The layout provides a default sort. Stretch: each section can override with
its own sort.

Sort modes: `recently-played`, `by-playtime`, `by-rating`, `by-genre` (alpha within
genre), `alphabetical`.

### Section

A Section is the join point between grouping and layout:

```typescript
interface Section {
    name: string                        // display label (for signage)
    games: ReadonlyArray<SteamGameData> // grouped + sorted
    spatialAllocation?: {               // assigned by Layout
        shelfPositions: ShelfPosition[]
        arrangement: ArrangementConfig  // future: arc, row, grid, etc.
    }
}
```

Sections are created by Grouping, enriched with spatial data by Layout, and
consumed by Placement.

### Placement

Bottom of the pipeline. Receives (section.games, section.spatialAllocation) and
stamps GPU instances. This is what `GameBoxSpawner` does today, but scoped
per-section rather than globally.

The rendezvous pattern (prefetch ↔ placement intent) stays. It's already per-game
and works unchanged in a multi-section world.

**Placement does NOT:**
- Decide which games to show (Grouping's job)
- Decide where sections go (Layout's job)
- Decide sort order (Sort's job)

### Signs

Signs are section labels. When sections become first-class objects, sign placement
becomes trivial: each section's name is placed at its spatial allocation's anchor
point. `ShelfSectionPlanner` becomes unnecessary — its job is absorbed by the
section lifecycle.

Time-bucket signs (e.g. "Played this week", "100+ hours") are a variant:
the section is ungrouped, but the sort creates natural breakpoints. These are
still sign-worthy even without grouping — the Layout can derive them from the
sorted game list within a section.

---

## Event Seams

| Event | Payload | Emitted by | Consumed by |
|---|---|---|---|
| `GamesLoaded` | all games | SteamIntegration | Layout pipeline start |
| `LayoutSelected` | layout strategy id | UI / defaults | LayoutCoordinator |
| `GroupingApplied` | `Section[]` (no spatial data yet) | GroupingCoordinator | LayoutCoordinator |
| `SectionsReady` | `Section[]` (with spatial allocations) | LayoutCoordinator | GameBoxSpawner |
| `SortApplied` | section id + sorted games | UI / defaults | LayoutCoordinator → re-place |

*Note: `GamesSort` as a flat sorted list is the current stepping stone. It evolves
into `SectionsReady` with per-section sorted game lists.*

---

## Migration Path

### Phase 1: Introduce Section as a data type (this branch)

- Define `Section` interface
- `GameSorter` produces `Section[]` instead of / in addition to flat list
- Ungrouped modes produce 1 section with all games
- `by-genre` produces N sections
- `ShelfSectionPlanner` and `GameBoxSpawner` consume `Section[]`
- Signs derived from section names rather than bucket-key heuristics
- `by-rating` gets sign support for free (section name = rating tier)

### Phase 2: Layout strategy abstraction

- Extract arc layout into `ILayoutStrategy`
- Add row layout as second strategy
- Layout assigns spatial allocations to sections
- Dynamic switching (live shelf repositioning)
- Chunking logic for large sections

### Phase 3: Multi-instance placement

- A game in multiple sections → multiple GPU instances
- Prefetch once, place N times (already supported architecturally)
- Instance count rules (static cap or LOD-driven)

### Phase 4: Per-section sort override + persistence

- Each section can override the layout default sort
- Save/restore layout + grouping + sort preferences

---

## Open Questions

- **Chunking granularity**: does the layout chunk at shelf boundaries (18 games)
  or at some other unit? Current `SHELF_BATCH_SIZE = 18` is shelf-driven.
- **Section transitions**: visual separator between sections? Gap in shelves,
  a sign, both? Currently signs serve this role.
- **Computed vs. fixed layout boundary**: at what point does a computed layout
  (function-driven positions) need to become a fixed layout (predefined zones)?
  Probably when sections need stable, recognizable locations across sessions.
- **Group overlap**: when a game appears in 2+ sections, which section "owns" it
  for interaction purposes (e.g. spotlight, detail panel)?

---

## Relationship to Existing Docs

- `layout-variations.md` — Layout strategy abstraction (Phase 2). ILayoutStrategy,
  dynamic switching, grouping parameter. This plan's Layout concept aligns with that
  feature's scope.
- `layout-sign-responsibility-plan.md` — Sign ownership migration. Phase 1 here
  largely obsoletes `ShelfSectionPlanner`, which is the target of that plan.
- `layout-sections-design-intent.md` — Earlier conversation notes. Superseded by
  this plan; can be archived.
- `act4-encore-someday-maybe.md` — Layout grouping and novel layout modes listed
  as stretch goals. Phase 2+ of this plan addresses them.
