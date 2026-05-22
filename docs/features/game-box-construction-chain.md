# Feature: Game Box Construction Event Chain

**Act**: 2 (Also In Act 2 — Best Effort)  
**Status**: WIP Plan — not yet started  
**Priority**: Medium (quality / architecture; enables cleaner lifecycle taps for VR, LOD, streaming)

---

## Goal

Replace the current ad-hoc "rebuild everything" calls in game box construction with a typed dependency chain driven by events. Each stage declares what it requires before it can proceed. The chain is the orchestration layer — classes don't call each other directly; they emit readiness and listen for prerequisites.

---

## Motivation

Currently `LodGameArtworkRenderer` (and adjacent coordinators) contain monolithic rebuild methods that run all stages in sequence imperatively. This makes it hard to:

- Re-enter the pipeline at a specific stage (e.g. texture resolved, skip material prep)
- Tap into a stage for debugging, testing, or future subsystems (LOD streaming, preloading)
- Know *why* a stage didn't run (silent skip vs. actual failure)
- Control ordering across class boundaries without tight coupling

The event chain addresses all of these by making stage boundaries explicit and observable.

---

## Core Concept: Dependency-Declared Chain Stages

Each stage in the chain is an event. A stage handler subscribes to its **trigger event**, asserts its **prerequisites**, does its narrow work, then emits the **next event**. If prerequisites are not met, it emits a `*Failed` variant instead of silently returning.

```
[Trigger enters chain]
        │
        ▼
 ArtworkRenderRequested       ← entry point; carries scope (gameId | 'all')
        │
        ▼
 ArtworkMaterialPrepared      ← material params resolved from AppSettings + game data
        │
        ▼
 ArtworkTextureResolved       ← texture array slot confirmed / uploaded to GPU
        │
        ▼
 ArtworkInstanceUpdated       ← GPU buffer written for this game box instance
        │
        ▼
 ArtworkRenderComplete        ← frame signal; cleanup hook; downstream taps (debug overlay, perf logging)
```

Each event carries:
```typescript
interface ChainStageEvent {
    chainId: string          // unique ID for this chain run (for correlation)
    scope: GameBoxScope      // { gameId: string } | { all: true }
    triggeredBy: string      // name of the upstream event that initiated the chain
    stageStartedAt: number   // performance.now() at stage entry
}
```

---

## Failure / Break Signaling

If a stage cannot complete, it emits `ArtworkChainFailed`:

```typescript
interface ArtworkChainFailedEvent {
    chainId: string
    failedStage: string      // name of the stage event that broke
    reason: string
    scope: GameBoxScope
    recoverable: boolean     // true = retry candidate; false = permanent for this scope
}
```

A `ChainMonitor` class (or inline in a debug utility) subscribes to `ArtworkChainFailed` and logs/surfaces broken chains. In production, `recoverable: true` chains can be queued for retry.

---

## Prerequisite Declaration

Each stage handler optionally declares prerequisites — other events that must have fired (for the same `chainId` or globally) before this handler proceeds:

```typescript
// Pseudocode — actual mechanism TBD (could be a simple registry or just inline guards)
ChainStageRegistry.register({
    trigger: ArtworkEventTypes.TextureResolved,
    requires: [ArtworkEventTypes.MaterialPrepared],
    handler: onTextureResolved,
})
```

If a required prior stage hasn't fired, the handler emits `ArtworkChainFailed` with `reason: 'prerequisite not met'` rather than no-opping silently.

This is the mechanism that lets us "define the chain by dependencies" — future stages can declare requirements on events from *other* chains (e.g. `LightingSystemReadyEvent`) without those chains knowing about the artwork pipeline.

---

## Entry Points

Different triggers enter the chain at the appropriate stage:

| Trigger | Entry Stage |
|---|---|
| Artwork tuning slider changed | `ArtworkRenderRequested` |
| Game data loaded for a new title | `ArtworkRenderRequested` |
| Texture cache miss resolved | `ArtworkTextureResolved` |
| Shadow / lighting quality changed | `ArtworkInstanceUpdated` |
| VR render mode switch | `ArtworkInstanceUpdated` |
| Full scene reset | `ArtworkRenderRequested` (scope: all) |

---

## Cleanup / Resource Handoff

The `ArtworkMaterialPrepared` handler is responsible for marking previous resources as stale or reusable. Whether to reuse a texture slot or replace it is decided here — not spread across callers. This keeps "update in place vs. replace" contained to one boundary.

---

## Affected Classes (Migration Scope)

- **`LodGameArtworkRenderer`**: currently owns all stages internally; migrates to owning `ArtworkRenderRequested` → `ArtworkMaterialPrepared` + `ArtworkTextureResolved` → `ArtworkInstanceUpdated`
- **`DisplayAdvancedPanel`**: emits `ArtworkRenderRequested` (already partially wired via `MaterialRefreshRequested`; this generalizes it)
- **`SceneCoordinator`** (or equivalent startup orchestrator): emits `ArtworkRenderRequested` on initial game data ready
- **`LightingRenderer`**: emits `ArtworkInstanceUpdated` for shadow-only changes (enters chain late, skips material/texture stages)
- **`ArtworkChainMonitor`** (new, small): subscribes to `ArtworkChainFailed`, surfaces breaks; also useful for perf timing across stages

---

## What to Do With Current Events

The three events added in `feature/tsl-artwork-material` (`TuningChanged`, `ShadowContactTuningChanged`, `MaterialRefreshRequested`) become entry aliases or are removed:

- `MaterialRefreshRequested` → rename/replace with `ArtworkRenderRequested`
- `TuningChanged`, `ShadowContactTuningChanged` → remove once chain handles those entry points
- Shadow-contact path enters chain at `ArtworkInstanceUpdated` stage (no material/texture re-resolve needed)

---

## Stories / Tasks

- [ ] Define `ChainStageEvent` base interface and `ArtworkChainFailedEvent` in `LightingEvents.ts` (or a new `ArtworkChainEvents.ts`)
- [ ] Define the full stage event set: `ArtworkRenderRequested`, `ArtworkMaterialPrepared`, `ArtworkTextureResolved`, `ArtworkInstanceUpdated`, `ArtworkRenderComplete`
- [ ] Migrate `LodGameArtworkRenderer` internal rebuild sequence into stage handlers; emit stage events between them
- [ ] Wire `DisplayAdvancedPanel` to emit `ArtworkRenderRequested` (replaces `MaterialRefreshRequested`)
- [ ] Wire `SceneCoordinator` initial construction through `ArtworkRenderRequested`
- [ ] Implement prerequisite guard mechanism (simple inline version first; registry refactor later if needed)
- [ ] Add `ArtworkChainMonitor` for debug-mode chain failure surfacing
- [ ] Update tests: each stage handler testable in isolation via emitted events

## Open Questions

- Should `ChainStageEvent` be a generic base for *any* multi-stage pipeline, or artwork-specific?
- Should the prerequisite registry be a runtime object or a static declaration at class init?
- Is `ArtworkRenderComplete` worth subscribing to, or is it just a perf-tap?

---

## Acceptance Criteria

- Re-entering the chain at `ArtworkInstanceUpdated` skips material/texture stages cleanly
- A broken chain emits `ArtworkChainFailed` with enough info to diagnose in dev tools
- `DisplayAdvancedPanel` emits only `ArtworkRenderRequested` — no stage-specific knowledge
- All existing artwork tuning + shadow contact paths covered with no regression
- Each stage handler has a unit test asserting it emits the correct next event on success and `ChainFailed` on failure
