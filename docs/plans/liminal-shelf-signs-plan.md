# Liminal Shelf Signs — Plan

**Status**: Design — ready for sign-off, not yet implemented
**Branch**: `act2/shelf-signs`
**Parent**: [Placement Anchor System](placement-anchor-system-plan.md) — this plan fulfills that
plan's Story 4b (shelf-sign (de)activation), scoped per the requirement: *"we want to put the same
signs on our shelves we use today, and have them follow as the shelves advance through the liminal
layout... focus on them being aligned to a given shelf and then just (de)activated & drawn with it."*

---

## 1. Why this needs its own plan, not just "build the seam"

`placement-anchor-system-plan.md` §5 describes Story 4b as narrow: build
`ShelfAnchorRegistry.onReshaped`/`offReshaped` and defer the *rules* for what a shelf sign shows to
`sign-placement-rules-plan.md` / `layout-sign-responsibility-plan.md`. Two things make that framing
not directly actionable:

**The gating plans are stale.** Both describe a `ShelfSectionPlanner` class that was never built.
The class that actually ships section signage today is [`ShelfSignPlanner`](../../client/src/scene/ShelfSignPlanner.ts),
with a different, already-shipped design (signs at each section's first/last shelf, plus row-aisle
edge signs) — not the `RowBoundaryRule`/`IntervalRule` abstraction those docs propose. There is
nothing live to sequence after; those two docs should be treated as superseded, not as a blocker.

**Liminal has no section signage today, and the reason is structural, not "not yet built."**
`ShelfSignPlanner` explicitly skips liminal (`ShelfSignPlanner.ts:132`, `"no section signage in v1"`,
also listed under Non-goals in `docs/features/liminal-mode.md`). It tags a `sectionIndex` onto each
shelf **once**, at initial `ShelfReady`. That model cannot extend to liminal: a liminal shelf's
*content* keeps changing as `LiminalWindowCoordinator` recycles the ring, but nothing currently
re-derives which section is showing there. Worse, section/category identity doesn't survive into
liminal's content pipeline at all — `LiminalWindow`/`LibraryRing` operate on a flat
`SteamGameData[]` with no section field, and `SteamGameData` itself carries no category/genre field.

So this plan owns two things `placement-anchor-system-plan.md` deliberately didn't: **threading
section identity through the recycling window**, and **the selection/activation rule** for a
shelf's sign in a continuously-recycling corridor — scoped narrowly (see §5 Non-goals), not as a
general-purpose rule engine.

---

## 2. Code grounding

- **Section identity exists right up until it's discarded.** `LiminalWindowCoordinator.handleSectionsReadyForPlacement`
  (`LiminalWindowCoordinator.ts:141`) does `this.flatGames = sections.flatMap(({ section }) => section.games)`
  — `sections` at that point is `ReadonlyArray<{ sectionId, sectionIndex, section: Section }>`, and
  `Section.name` is already documented "used for sign placement" (`LayoutTypes.ts:77`). The flatten
  throws the pairing away.
- **Content and transform already change together, in a fixed order.** Both `advance()` (recycle) and
  `alignWindowToPlayer()` (initial seed) call `repositionShelf(shelfIndex, ...)` immediately followed
  by `repointShelf(shelfIndex, ...)` for the same shelf index — geometry event first, content event
  second, every time. There is no case where one fires without the other.
- **`repointShelf` already has a per-instance repoint event to mirror.** `PlacementRepointRequestedEvent`
  (`InteractionEvents.ts:286`) — `{instanceIndex, kind, appid, gameName, position, rotation}` — is
  emitted once per game-box instance when its shelf recycles. A shelf-level sign needs the same
  shape of signal at shelf granularity, not instance granularity.
- **`ShelfAnchorRegistry.resolve(shelfIndex, localOffset)` already does the position math** this needs
  — composing a shelf's current world transform with a local offset, rotated by the shelf's yaw. No
  change needed there; shelf signs are a new caller, not a new capability.
- **`ShelfSignPlanner`'s existing skip rule is directly reusable**: `if (!section.name || section.name
  === 'Other') continue` (`ShelfSignPlanner.ts:140`). Same style constants apply —
  `SignStyles.Category`, `above-shelf` mount, `yOffset ≈ 2.02`, `frontOffset ≈ 0.28` — since liminal
  shelves are the same physical shelf geometry as row/arc, just laid out along a corridor instead of
  rows.

---

## 3. Design

### 3.1 Thread section identity through the ring

Replace the implicit pairing (index *i* into `flatGames` ↔ index *i* into a hypothetical section
array) with an explicit combined type, so the two can never desync:

```typescript
interface RingEntry {
    readonly game: Readonly<SteamGameData>
    readonly sectionName: string
}
```

`LiminalWindowCoordinator.flatGames: SteamGameData[]` becomes `ringEntries: RingEntry[]`, built by
flat-mapping `sections` once (same call site, same cost) into `{game, sectionName: section.name}`
tuples instead of bare games.

`LiminalWindow` genericizes over its payload — `LiminalWindow<T>` instead of a hardcoded
`SteamGameData` — since its windowing math (`gamesForSlot`/`allWindowGames`, really "itemsForSlot"/
"allWindowItems" post-rename) never inspects the payload, only indexes into it via `indexAt()`. One
`LiminalWindow<RingEntry>` replaces the current `LiminalWindow<SteamGameData>`; every existing call
site unwraps `.game` where it needs `SteamGameData` (repoint, box classification) and gains access
to `.sectionName` where it doesn't have it today.

**Not doing**: two parallel arrays (games + section names) kept in sync by convention. A single
combined array is strictly safer for the same cost and removes an entire class of index-drift bug.

### 3.2 A shelf-level content-repoint event

New event, same shape philosophy as `PlacementRepointRequestedEvent` but at shelf granularity:

```typescript
interface ShelfSectionRepointedEvent extends BaseInteractionEvent {
    readonly shelfIndex: number
    readonly sectionName: string | null   // null when the shelf's slot has no games (empty window)
}
```

Emitted by `LiminalWindowCoordinator` at the same two call sites that already call `repointShelf()`
(`advance()`, `alignWindowToPlayer()`) — always immediately after `repositionShelf()` for that index,
matching the existing reposition-then-repoint order — plus once per shelf during the initial
`handleSectionsReady()` seed (today's code doesn't repoint on that path at shelf level for signs, but
signs need an initial value, not just updates on first recycle).

Section name resolution for a shelf: **the first game's section name in that shelf's slot**
(`slotGames[0].sectionName`, after the RingEntry change makes `slotGames` a `RingEntry[]`). Simple,
deterministic, no majority-vote computation — a shelf straddling a section boundary shows whichever
section starts it, same "boundary reads as the start of what's next" feel as `ShelfSignPlanner`'s
existing start/end placement.

**Why a new event instead of extending `ShelfUnitRepositionRequestedEvent`.** That event means "this
shelf's *transform* changed" and already has two consumers (`InstancedShelfRenderer`,
`ShelfAnchorRegistry`) that only care about geometry. Riding section identity on it would be the same
smell `placement-anchor-system-plan.md` finding (c) already named — a discriminating field standing
in for what should be a distinct event, because the two facts (moved vs. now-shows-a-different-section)
don't always change for the same reason even though today, in practice, they happen together.

### 3.3 A new liminal-only sign consumer

New class, `LiminalShelfSignPlanner` — mirrors `ShelfSignPlanner`'s name and role, deliberately not
merged into it (see §5 Non-goals for why).

- Subscribes to `ShelfSectionRepointedEvent`.
- Tracks `currentSectionByShelfIndex: Map<number, string | null>` and
  `placedSignIdentifierByShelfIndex: Map<number, string>` (mirroring `ShelfSignPlanner`'s
  `placedSignIdentifiers` pattern).
- On each event:
  - Skip (and remove any existing sign for that shelf) if `sectionName` is falsy or `'Other'` —
    same rule as `ShelfSignPlanner.placeSignsForSections`.
  - Skip entirely if `sectionName === currentSectionByShelfIndex.get(shelfIndex)` — no redundant
    re-render when a recycle doesn't cross a section boundary (most recycles won't).
  - Otherwise: remove the shelf's previous sign (if any), resolve the new position via
    `ShelfAnchorRegistry.getInstance().resolve(shelfIndex, {x: 0, y: SHELF_SIGN_Y_OFFSET, z:
    SHELF_SIGN_FRONT_OFFSET})`, and `SceneSignManager.instance.placeSign('canvas', {...})` with a
    shelf-scoped identifier (`liminal-shelf-sign-${shelfIndex}`) and the shelf's current
    `rotationY` as `signFacingY`.
- Resets (`clearSigns()` + map clears) on `StorePropsEventTypes.LibraryReloadRequest` and
  `UIEventTypes.LayoutRequested` leaving liminal, mirroring `ShelfSignPlanner.resetSignAnchorsForLibraryReload`.

**No `ShelfAnchorRegistry.onReshaped`/`offReshaped` needed.** The plan that introduced the concept
(§3.3 there) scoped it for dependents needing "your anchor changed, recompute yourself" as a generic
callback. This consumer already gets an equivalent, more specific signal — the new
`ShelfSectionRepointedEvent` — and calls `resolve()` (already public, already tested) directly for
position math on demand. Building the generic subscription machinery now, with exactly one consumer
and no second one on the horizon, would be exactly the kind of "abstraction with no behavior in it"
§3.4 of the parent plan already warned against for the frame types themselves. If a second loose
dependent shows up later needing the same shape of signal, that's the trigger to build `onReshaped`
for real — not before.

### 3.4 Position and orientation

Shelf signs reuse `ShelfSignPlanner`'s existing constants and mount style — same physical shelf
geometry, same "above-shelf, facing the aisle" placement:

```typescript
const SHELF_SIGN_Y_OFFSET = 2.02       // matches ShelfSignPlanner.SHELF_SIGN_Y_OFFSET
const SHELF_SIGN_FRONT_OFFSET = 0.28   // matches ShelfSignPlanner.SHELF_SIGN_FRONT_OFFSET
```

`ShelfAnchorRegistry.resolve()` rotates the local `{x: 0, z: frontOffset}` offset by the shelf's
current yaw — for liminal's left/right-facing shelves (`LEFT_FACING_ROTATION_Y` /
`RIGHT_FACING_ROTATION_Y`), this places the sign toward the aisle automatically, no
liminal-specific geometry math needed.

---

## 4. Story sequence

| # | Story | Scope |
|---|---|---|
| 1 | Thread section identity through the ring | `RingEntry`, genericize `LiminalWindow<T>`, update `LiminalWindowCoordinator` call sites to unwrap `.game`/`.sectionName` |
| 2 | Emit `ShelfSectionRepointedEvent` | New event type; emitted from `advance()`, `alignWindowToPlayer()`, and the initial seed in `handleSectionsReady()` |
| 3 | `LiminalShelfSignPlanner` | New class: subscribe, dedupe, skip-empty, place/remove via `SceneSignManager` + `ShelfAnchorRegistry.resolve()` |
| 4 | Verify | `tsc`, full test suite, manual walkthrough: walk the corridor, confirm signs appear/update/disappear at section boundaries, confirm no sign churn on same-section recycles |

Small enough to land as one PR.

---

## 5. Non-goals

- **No boundary/interval rule system.** One rule (first game in the slot determines the shown
  section) — not a pluggable `SignPlacementRule` abstraction. `sign-placement-rules-plan.md`'s
  broader rule-pipeline ideas (distribution rules, grouping rules, designated areas, artistic
  layouts) stay exactly as speculative as they were; nothing here builds toward them.
- **No merge with `ShelfSignPlanner`.** Arc/row/spoke's section signs are placed once per layout run
  against static shelves; liminal's are placed continuously against recycling ones. Different
  triggers, different lifecycle, same reasoning as `placement-anchor-system-plan.md` §3.4 ("no
  common base class... would produce an abstraction with no behavior in it"). `ShelfSignPlanner`
  is untouched by this plan.
- **No `ShelfAnchorRegistry.onReshaped`.** See §3.3 — deferred until a second loose dependent exists.
- **No visual variance** (boundary vs. interval styling, per-genre treatment) — one sign style,
  reusing `SignStyles.Category`.
- **No end-cap (FRONT/BACK) label revival.** That's a separate, currently-disabled feature (`TD:
  shelf-end-cap-signs`, draw-call cost) unrelated to section signage.

---

## 6. Tests

- `LiminalWindow<T>` generic windowing: existing `LiminalWindow.test.ts` cases re-verified against
  a generic payload; add a case proving two different payload types windowed independently over the
  same indices produce parallel, non-desynced results (this is exactly the risk of the parallel-array
  alternative rejected in §3.1 — worth a test even though that path wasn't taken, since `RingEntry`
  achieves the same guarantee by construction and the test documents why).
- `LiminalWindowCoordinator`: `advance()` and `alignWindowToPlayer()` each emit
  `ShelfSectionRepointedEvent` with the correct `sectionName` for the recycled/repositioned shelf;
  event fires in the same call as the existing reposition/repoint, not on a later tick.
- `LiminalShelfSignPlanner`: places a sign on first content; updates text and position on a section
  change; **does not** re-place when a recycle keeps the same section (dedupe); removes the sign
  when a shelf's section becomes empty/`'Other'`; resets cleanly on library reload / leaving liminal.

## 7. Risks

- **Sign churn reads as flicker if the dedupe check is wrong.** Most recycles will land within the
  same section (sections are typically many shelves wide); if the equality check is off by one
  index or compares the wrong field, every recycle would remove+recreate every visible sign. Guarded
  directly by the dedupe test above.
- **First-game-determines-section is a real simplification.** A shelf whose slot happens to open
  exactly on a section boundary will show the *new* section's name even though part of its content
  is still the old section's — acceptable per the requirement's own framing ("(de)activated & drawn
  with it," not "precisely boundary-aligned"), but worth confirming against a live walkthrough where
  section sizes are small relative to `slotsPerUnit`.
- **`Section.name` for the synthetic liminal window itself is `''`** (`buildWindowedSection` sets
  `name: ''` for the *outer* wrapping section) — this plan's `sectionName` comes from the *inner*
  per-game sections before that wrapping happens, so it's unaffected, but worth a regression test
  since the two are easy to confuse by name alone.

## 8. Related

- [Placement Anchor System](placement-anchor-system-plan.md) — parent plan, Story 4b
- [Liminal Mode](../features/liminal-mode.md) — "Section signage streaming with the window" listed
  under Non-goals; this plan is what retires that line
- `ShelfSignPlanner.ts` — the non-liminal precedent this plan reuses constants/skip-rules from,
  without merging into
- `sign-placement-rules-plan.md`, `layout-sign-responsibility-plan.md` — superseded by
  `ShelfSignPlanner`'s actual shipped design; not a dependency of this plan

---
*— P1 / O2*
