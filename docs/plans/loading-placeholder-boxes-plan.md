# Loading Placeholder Boxes — Design Plan

**Feature**: [Loading Placeholder Boxes](../features/loading-placeholder-boxes.md)
**Act**: 2 (Also In Act 2 — Best Effort)
**Status**: 📋 Design — awaiting sign-off, not started

---

## 1. Problem

A game box's shelf slot is known well before its artwork is. Shelves are pure procedural geometry
with no network dependency; artwork must be fetched, decoded, and uploaded to a texture array.
Between those two moments the slot renders **nothing** — the shelf is there and the box is not.

This was reported concretely during liminal-mode work (2026-07-30, "the games arrive slightly after
the shelves"), but it is not liminal-specific. It applies to every layout, on initial world build,
on re-sort, and on liminal's per-crossing recycle. Liminal only made it obvious, because there the
same gap replays every few steps instead of once at startup.

The goal is **not** to make artwork arrive faster, and **not** to delay shelves until artwork is
ready. Both trade the symptom for something worse. The goal is for a known slot to always render
*something*.

---

## 2. Key finding: the seam already exists

The rendezvous between "slot known" and "artwork known" is already an explicit, named boundary —
`RenderIntentCoordinator`. No new state tracking is needed to know which boxes are pending; that
set is already materialized in memory.

```
GameBoxSpawner.emitPlacementIntents()
        │  emits PlacementIntentReady { appid, game, position, rotation }
        │  ← slot is FULLY known here (final position + rotation)
        ▼
RenderIntentCoordinator.pendingPlacementIntents      ← THE PLACEHOLDER POPULATION
        │  held until ArtworkIntentSettled fires for that appid
        │  (ArtworkPrefetchCoordinator emits that on fetch success OR failure)
        ▼
        │  emits PlacementResolved { appid, game, position, rotation }
        ▼
GpuGameBoxRenderer.placeResolvedGame()
        │  lodArtworkRenderer.placeInstance() → artwork instance
        └─ on -1 (no prefetched texture) → placeLabelBox() → label instance
```

Everything buffered in `pendingPlacementIntents` is, by definition, a slot that is known and has
nothing rendered in it. **The placeholder's lifetime is exactly the buffered interval.** That is
the whole design in one sentence.

---

## 3. Mechanism

### 3.1 The placeholder is an ordinary artwork instance pointed at a reserved texture slot

`LodTextureArrayManager.allocateSlot()` is a monotonic counter. Reserving the first slot at
construction — before any game can claim one — costs one MID-tier slot (150×225×4 ≈ 135 KB) and
nothing else.

The instanced artwork shader already reads a per-instance `textureIndex` attribute into the MID
`DataArrayTexture`. An instance pointing at the reserved slot renders the placeholder art with:

- **no new `InstancedMesh`**
- **no new draw call**
- **no shader change**
- **no new material**

### 3.2 Promotion is already built

`LodArtworkOrchestrator.setInstanceArtwork(instanceIndex, appid, gameName, position, rotation)`
already repoints an existing instance's texture in place without allocating. It was built for
liminal's treadmill (Story 5) and is exactly what promotion needs. Promotion is a texture-index
swap on an instance that already exists — not a placement.

So the flow becomes:

| Event | Today | With placeholders |
|---|---|---|
| `PlacementIntentReady` | (buffered, nothing renders) | **place instance → reserved placeholder slot** |
| `PlacementResolved` (artwork ok) | `placeInstance()` — allocates | **`setInstanceArtwork()` — repoints in place** |
| `PlacementResolved` (artwork failed) | `placeLabelBox()` — allocates label | retire placeholder + `placeLabelBox()` (see §4.3) |

---

## 4. The three correctness traps

These are the parts that will silently produce duplicate or orphaned boxes if built naively. They
are the reason this is a design doc and not a one-story task.

### 4.1 Nested synchronous resolution → duplicate instances

`RenderIntentCoordinator` is constructed inside `GpuGameBoxRenderer`'s constructor **before**
`GpuGameBoxRenderer` registers its own handlers, so its listeners run first. When artwork is
already settled (cache hit — the common case on reload), `handlePlacementIntentReady` emits
`PlacementResolved` **synchronously, nested inside the `PlacementIntentReady` dispatch**.

A naive "place a placeholder on `PlacementIntentReady`" handler therefore runs *after* the real
box has already been placed, and adds a second, permanent, orphaned instance on top of it.

**Resolution**: the placeholder placement must be a no-op when that placement has already
resolved. This requires per-placement identity — see §4.2, which supplies it.

### 4.2 One appid can have many simultaneous placements

`pendingPlacementIntents` is `Map<number, PlacementIntentReadyEvent[]>` — an **array** per appid,
because the same game can occupy multiple slots at once. Liminal's ring wrap
(`LibraryRing.indexAt`) makes this routine rather than exotic: a library smaller than the resident
window shows the same game on several shelves simultaneously.

So placeholder bookkeeping keyed by `appid` alone is wrong — it cannot tell which of N pending
placements a given `PlacementResolved` corresponds to.

Two ways to get per-placement identity:

| Option | How | Cost |
|---|---|---|
| **A. `placementId` field (recommended)** | Add a `placementId` to `PlacementIntentReadyEvent`, carry it verbatim through `PlacementResolvedEvent`. `GpuGameBoxRenderer` keys placeholder instances by it. | One field on two existing events; **no new event type**. Explicit, order-independent. |
| B. FIFO mirror | Keep a per-appid queue of placeholder instance indices and rely on `RenderIntentCoordinator` flushing with `pending.shift()` in the same order intents arrived. | Zero schema change, but encodes an invisible ordering contract between two classes. Breaks silently if the flush order ever changes. |

**Recommendation: Option A.** It also solves §4.1 for free (a resolved `placementId` is simply
absent from the placeholder map, so the late placeholder handler no-ops). Per the "survey before
you extend" rule this adds a *field to existing events* rather than a sibling event — it's a
discriminator on an existing concept, which is the outcome that rule asks for.

### 4.3 Artwork and label instances live in separate index spaces

This is the same structural constraint liminal hit in Story 5. A placeholder occupies an **artwork**
instance. If artwork ultimately fails, today's behavior places a **label** instance — a different
`InstancedMesh` with its own index space. The placeholder cannot become a label.

`PlacementRunResettableInstancedBase.allocateInstanceIndex()` is a monotonic counter with no
free-list, so a placeholder on the failure path cannot be returned to the pool.

| Option | Behavior | Assessment |
|---|---|---|
| **A. Retire + place label (recommended for v1)** | Zero-scale the placeholder's matrix, then place the label as today. | Simple, preserves the game name. Leaks one artwork instance per permanently-failed game — bounded, and quantified by the existing `ArtworkPrefetchCoordinator` fallback summary log. |
| B. Keep placeholder as a "no artwork" variant | Reserve a second texture slot; failed games keep a distinct placeholder forever. | No leak, but **loses the game name** — a real information regression vs. today's label. Rejected. |
| C. Instance free-list | Make instance slots genuinely reclaimable. | The correct long-term fix, but it is its own piece of work. Natural companion to [`idempotent-library-scene-sync`](../features/idempotent-library-scene-sync.md), which already names "reconcile's unbounded slot leak". |

**Recommendation: A for v1, and record C as the follow-up** rather than pretending A is free.

**Capacity implication of A**: today artwork instances are allocated only for *successes*. With
placeholders, every game consumes an artwork instance, and failures additionally consume a label
instance. Peak artwork-instance usage rises from `successes` to `all games`. `placementCapacity`
defaults to `textureCapacity`, so this needs an explicit check before build — see Story 0.

---

## 5. What the placeholder looks like

The Act 2 note is explicit that this must be **generic** — one shared texture, not a per-game
render: *"Deliberately not a full label-box render for every pending game — too resource-heavy to
generate at that scale for what's meant to be a brief, generic placeholder."*

That constraint is what makes the single-reserved-slot design possible, and it should stay locked.

**Animation is the open question.** The Act 2 note suggests "a simple spinner/shimmer":

| Approach | Cost | Notes |
|---|---|---|
| **Static generic case art (recommended v1)** | One canvas paint at startup, one slot upload, zero per-frame cost | Ships the fix. Reads as "a box whose cover hasn't printed yet". |
| Animated via per-frame slot upload | ~135 KB re-upload every frame | One layer, so `addLayerUpdate()` keeps it off the full-array path — but still per-frame GPU traffic for a cosmetic effect. Not recommended. |
| Animated via shader uniform | One `time` uniform + a branch on `textureIndex == PLACEHOLDER_SLOT` | Cheapest animated option, but touches `LitArtworkMaterial`'s injected shader, whose replacements are deliberately guarded to "fail loudly". Viable follow-up, not v1. |

**Recommendation**: ship static, evaluate in-app, and only then decide whether shimmer earns the
shader change. The gap is often brief; a shimmer may be strictly worse than a calm static box.

---

## 6. What this unlocks beyond the reported symptom

Two genuine improvements fall out, neither of which motivated the work:

1. **Liminal's stale-box case gets a correct answer.** Story 5 accepted that a recycled box whose
   new game lacks prefetched artwork keeps showing its *previous occupant* until the next recycle
   ("bounded staleness"). With a placeholder texture available, `PlacementRepointRequested` can
   repoint to the placeholder instead — showing "loading" rather than a confidently wrong game.
   That is a strict correctness upgrade over the accepted compromise.

2. **Liminal's classification assumption gets more robust.** `LiminalWindowCoordinator.classify
   ShelfInstances()` reads instance metadata immediately after the synthetic `SectionsReady`, and
   its own class doc notes this only works "*provided* every window game's artwork was already
   prefetched — which holds in practice". With placeholders, every intent produces an instance
   immediately regardless of artwork state, so that "in practice" caveat stops being load-bearing.

---

## 7. Story sequence

| # | Story | Outcome |
|---|---|---|
| **0** | **Capacity audit** | Confirm `placementCapacity` accommodates one artwork instance per game (not per artwork *success*) at real library sizes. Blocks everything else; see §4.3. |
| **1** | Reserve the placeholder texture slot | `LodArtworkOrchestrator` claims slot 0 at construction and paints a generic placeholder into the MID tier. Nothing renders it yet. Verifiable by slot-allocation test. |
| **2** | Per-placement identity | Add `placementId` to `PlacementIntentReadyEvent`, carry it through `PlacementResolvedEvent` (§4.2). Pure plumbing, no behavior change — lands green on its own. |
| **3** | Place placeholders | `GpuGameBoxRenderer` subscribes to `PlacementIntentReady`, places a placeholder instance, records it by `placementId`. Must no-op if already resolved (§4.1). |
| **4** | Promote on resolve | `placeResolvedGame` repoints the existing placeholder via `setInstanceArtwork()` instead of allocating, when one exists for that `placementId`. |
| **5** | Failure path | Retire (zero-scale) the placeholder and fall through to `placeLabelBox()` (§4.3 Option A). |
| **6** | Liminal repoint-to-placeholder | Replace Story 5's "leave previous occupant" fallback with a repoint to the placeholder slot (§6.1). |
| **7** | Visual tuning | Evaluate the static placeholder in-app; decide shimmer yes/no (§5). |

Stories 1–2 are independently landable and low-risk. The behavior change begins at Story 3, and
Stories 3–5 should be treated as one reviewable unit — shipping 3 without 5 leaves failed-artwork
games showing a permanent placeholder with no name.

---

## 8. Risks

- **Duplicate instances from nested dispatch** (§4.1) — the highest-likelihood defect. Needs a test
  that emits `PlacementIntentReady` for an *already-settled* appid and asserts exactly one instance.
- **Instance leak on the failure path** (§4.3) — accepted and bounded for v1, but must be
  quantified in the run summary log, not left silent.
- **Capacity regression** (§4.3) — Story 0 exists specifically to retire this before any code lands.
- **Placeholder never promoted** — if `ArtworkIntentSettled` never fires for an appid, the box stays
  a placeholder forever. That is still better than today (nothing renders at all), but the run
  summary should count unpromoted placeholders so the condition is observable rather than invisible.

---

## 9. Explicit non-goals

- Making artwork resolve faster (prefetch prioritization, proximity-ordered fetch). Orthogonal;
  worth doing on its own merits, but it narrows the gap rather than closing it.
- Delaying shelf geometry to match artwork timing. Trades a visible gap for a slower world build.
- Per-game placeholder rendering (name, genre color, etc.). Explicitly rejected by the Act 2 scope
  note; would forfeit the single-shared-slot property this entire design rests on.
- Reclaiming instance slots generally (§4.3 Option C) — named as follow-up, deliberately not folded
  in here.

---

## 10. Related

- [Loading Placeholder Boxes](../features/loading-placeholder-boxes.md) — feature doc (status,
  acceptance criteria)
- [Act 2 — Ready for Friends](../acts/act2-ready-for-friends.md) — where this idea was captured
- [Game Box Construction Chain](../features/game-box-construction-chain.md) — if/when that lands,
  the placeholder becomes a natural occupant of the interval between `ArtworkRenderRequested` and
  `ArtworkTextureResolved`. This design does **not** depend on it.
- [Liminal Mode](../features/liminal-mode.md) / [plan](liminal-mode-plan.md) — the reporter of the
  symptom, and the beneficiary of §6
- [Idempotent Library Scene Sync](../features/idempotent-library-scene-sync.md) — the right home for
  the instance free-list (§4.3 Option C)
- [Desktop Startup Load Ordering](desktop-startup-load-ordering-plan.md) — independently arrived at
  "show *something* for slots whose real content isn't ready"; same idea, different entry point

---
— P1 / O2 / T1
