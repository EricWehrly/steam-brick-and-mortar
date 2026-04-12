# Sign System Simplification Plan

**Branch context:** follow-on to `openclaw/feat-neon-ui-intermission`  
**Status:** Proposed — not started

---

## Goal

Reduce `SceneSignManager` to a pure sign placement and renderer dispatch service.
Remove semantic tracking (`SignKind`) and layout-specific logic, leaving three
explicit concerns at every call site:

1. **Renderer** — which renderer produces the sign (canvas, neon-tube, block-letter)
2. **Anchor position** — where in world space the sign appears
3. **Style** — colors, font size, depth, etc.

The manager routes (1) to the right `ISignRenderer`, resolves (2) through mount
math, and passes (3) through. Everything else — *which* signs to place, *when* to
place them, *which* identifiers to clear — belongs to the caller.

---

## What changes

### 1. Drop `SignKind`, replace with `RenderKind` tracking

**Current:** `signKindsByIdentifier: Map<string, SignKind>` (6-value union)  
**New:** `signRendererByIdentifier: Map<string, RenderKind>` (3-value union: `'canvas' | 'neon-tube' | 'block-letter'`)

`removeSign(id)` looks up render kind directly.  
`clearByKind` is removed — callers track their own identifiers.

**Diff size:** ~5 lines changed inside the manager.

### 2. Change `placeSign` signature

**Current:** `placeSign(kind: SignKind, descriptor: SignDescriptor)`  
**New:** `placeSign(renderer: RenderKind, descriptor: SignDescriptor)`

`SignKind` is removed from the public API entirely. Callers pass the renderer
they want directly. The `RENDER_KIND_BY_SIGN_KIND` lookup table is deleted.

**External callers to update:**
- `ShelfSectionPlanner` — passes `'canvas'` instead of `'category'`
- All internal `this.placeSign(...)` calls (~6) — pass `'canvas'` or `'block-letter'` directly

**Diff size:** ~10 lines changed across 2 files.

### 3. Move bucket sign placement out of SceneSignManager

The time-bucket (recently-played section divider) signs are currently placed
internally by `SceneSignManager` in response to `GamesSort` and `ShelfReady`
events. They are layout decisions — which shelf boundary marks a time transition —
not sign-system decisions.

**Destination:** `ShelfSectionPlanner` or a new `TimeBucketSignCoordinator`.
`SceneSignManager` loses: `handleGamesSort`, `shelfTransforms`, `sortedGames`,
`buckets`, `lastPlacedBucket`, `hasRecentlyPlayedData`, `clearByKind`,
`replayTimeBucketSignsFromCreatedShelves`, `placeTimeBucketSignForShelf`,
the `GamesSort` event subscription, and the `ShelfReady` subscription (partially).

The receiving class subscribes to these events itself and calls
`SceneSignManager.instance.placeSign('canvas', ...)` directly.

**Diff size:** ~100 lines removed from SceneSignManager, ~60 lines added to
ShelfSectionPlanner or new coordinator. Net: manager loses ~40% of its current body.

### 4. Move ceiling sign placement out of SceneSignManager

`syncRecentlyPlayedCeilingSign` and `syncSteamLibraryBlockSign` are room/layout
concerns. They currently live here because `SceneSignManager` is a singleton that's
easy to reach. With layout coordinator work (existing TODO), these move to whatever
class responds to `RoomResized` for layout purposes.

**For now:** leave them here with existing TODOs — this is the bigger refactor and
should not block this change.

### 5. End-cap labels stay in SceneSignManager

End-cap labels (FRONT/BACK shelf orientation signs) sit at the intersection of
shelf geometry and sign placement. They are driven by `ShelfReady` and need shelf
surface data (`ShelfTopSurface`). Keeping them here is correct for now.

---

## SignDescriptor defaults (separate, smaller change)

Add a `SignRequestDefaults` const (or object) in `ISignRenderer.ts`:

```ts
export const SignRequestDefaults = {
    textColor: 0xffffff,   // spans all renderers; will be theme-driven later
}
```

Per-renderer defaults (e.g. canvas `backgroundColor`, block-letter `depth`) stay
inside each renderer. `buildSignRequest` in the manager applies
`SignRequestDefaults.textColor` as the cross-renderer fallback before per-renderer
defaults kick in.

**Diff size:** ~10 lines.

---

## Complexity assessment

| Change | Files touched | Lines Δ | Risk |
|---|---|---|---|
| 1. Replace `SignKind` map with `RenderKind` | SceneSignManager | ~5 | Low |
| 2. Change `placeSign` signature | SceneSignManager, ShelfSectionPlanner | ~10 | Low |
| 3. Move bucket signs to planner | SceneSignManager, ShelfSectionPlanner | −40 net | Medium |
| 4. Move ceiling signs | SceneSignManager + new/existing coordinator | −30 net | Medium — defer |
| 5. End-cap labels stay | — | 0 | — |
| Defaults const | ISignRenderer | ~10 | Low |

Changes 1, 2, and the defaults const are straightforward and touch few lines.
Change 3 is the meaningful one: it removes a chunk of SceneSignManager state
that currently feels misplaced. The bucket sign logic is already partly isolated
in `TimeBucketSignHelpers.ts` — the move mostly pulls event subscriptions and the
replay loop into `ShelfSectionPlanner` (which already owns category sign placement
and listens to `BatchReadyForPlacement`).

**Overall verdict:** not complex. The majority of the work is moving ~60 lines of
existing logic from one class to another, and the interfaces get cleaner at every
call site. Recommend doing 1 + 2 + defaults in this branch if review is already
open, and 3 as the first commit on the next branch.

---

## What the call sites look like after

**Before:**
```ts
signManager.placeSign('category', { uniqueIdentifier: genre, anchorPosition, mount })
signManager.placeSign('bucket', { uniqueIdentifier, anchorPosition, mount, style })
signManager.placeSign('ceiling', { uniqueIdentifier, anchorPosition, mount, style })
signManager.placeSign('block-letter', { uniqueIdentifier, text, anchorPosition, style })
```

**After:**
```ts
signManager.placeSign('canvas',        { uniqueIdentifier: genre, anchorPosition, mount })
signManager.placeSign('canvas',        { uniqueIdentifier, anchorPosition, mount, style })
signManager.placeSign('canvas',        { uniqueIdentifier, anchorPosition, mount, style })
signManager.placeSign('block-letter',  { uniqueIdentifier, text, anchorPosition, style })
```

The caller knows what they're rendering. The manager doesn't need to infer it.

---

## Open questions

- Should `RenderKind` live in `ISignRenderer.ts` alongside the interface, or in a
  shared sign types file? (Currently in `SceneSignManager` — moving it to
  `ISignRenderer.ts` would be cleaner since renderers are the thing being named.)
- Does `ShelfSectionPlanner` grow too large absorbing bucket sign logic, or does it
  warrant a separate `TimeBucketSignCoordinator`? The existing helpers file
  (`TimeBucketSignHelpers.ts`) suggests the logic was already being carved out.
