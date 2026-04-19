# Layout & Sections — Design Intent Notes
*Captured: 2026-04-18, from design conversation*

---

## Core Mental Model

**Layout → Sections → Filter + Sort → Shelves**

The Layout is the top-level container. It breaks out into Sections. Each Section is essentially a filtered, sorted slice of the game library that gets rendered across some number of shelves.

Grouping is not a separate concept — it's just applying filters to define sections across the whole layout.

---

## Section

A Section owns:
- **Filter criteria** — e.g. tag/genre match (`roguelike`, `hack-and-slash`, `action-rpg`). A section shows every game that satisfies its filter.
- **Sort order** — how surviving games are ordered within the section.
- **Shelf allocation** — however many shelves are needed to hold the filtered+sorted games.

Signs (category labels, time-bucket headers) are essentially Section breakpoint markers. Currently we place them somewhat arbitrarily; they should eventually be Section-owned.

---

## Layout Modes

### Playtime (current default)
- Deliberately **ungrouped** — no sections, just one continuous cascading sort by playtime.
- Intentional aesthetic: no hard category breaks, just flow.

### Genre / Tag grouping
- Layout creates one Section per tag/genre (or per filter combination).
- Each Section independently filters, sorts, and populates its shelves.
- A game can appear in **multiple sections** if it matches multiple filter criteria — this is expected and intended.
  - This means **multiple game box instances per game** in the scene.
  - Prefetch once (texture in atlas), place N times (one per section).
  - Some rules will govern max instances to keep in scene (likely LOD/distance-aware).

---

## Arrangement (future / deferred)

How games are physically arranged on shelves within a section:
- Orientation: top-to-bottom vs left-to-right
- Wrapping: yes/no
- Shape: row, two rows in parallel, arc curve (current arc is one instance of this)
- Grid patterns are probably achievable relatively easily

This is a **later feature** but the architecture should not foreclose it. Arrangement is probably a property of the Section (or a sub-object it holds).

---

## Implications for Current Work (placement race fix)

- The "place game at position" unit will eventually be **Section-driven**, not game-driven.
- The Layout/Section system will be the initiator of shelf spawning and game placement.
- `GamesSort` as a flat sorted list is a stepping stone — eventually it'll be Section-scoped placement intents.
- Per-game state (e.g. `artworkReady` flag) should live somewhere that survives multiple placements of the same game across sections.
- The renderer's job remains: given (game, position), stamp a GPU instance. It doesn't need to know about sections.

**Near-term:** fix the prefetch/place race without baking in assumptions that break the multi-section future.  
**Don't:** make the spawner own per-section logic or treat one-position-per-game as a hard constraint.

---

## What We're NOT Doing Yet
- Multi-instance placement (game in multiple sections)
- Arrangement configuration
- Section objects as first-class data structures
- Layout persistence / user-defined layouts

---

## Open Questions (to answer when we get there)
- Does `GamesSort` event evolve into a per-Section event, or does Layout emit something different?
- Who owns Section lifecycle — SceneCoordinator, a new LayoutCoordinator?
- Max-instances rule: static cap, or distance/LOD driven?
- Does a Section own its shelves, or does it request them from ShelfRenderer?
