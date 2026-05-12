# Artwork Selection Loop Refactor Plan

## Goal

Move from "failure-precheck driven" logic to "resolved-artwork-type driven" logic.

In plain terms:

1. Resolve a game's artwork by trying sources in priority order.
2. Persist the resolved type and URL (`library`, `header`, `capsule`, or `label`).
3. Reuse that resolved type on future loads as the primary signal.

This makes `label` a first-class resolved outcome, not just a failure side effect.

---

## Why Change

Current behavior still relies on permanent-failure checks to decide whether to skip work. That creates scattered "should I try?" logic and can drift from the actual source-selection loop.

What we want instead is one source of truth:

- **Resolved type metadata** says what to do next time.
- The retry loop only runs when there is no resolved type yet, or when user explicitly retries.

---

## Target Model

### Data contract (sidecar)

Store only:

- `selectedType: 'library' | 'header' | 'capsule' | 'label'`
- `selectedUrl?: string`

No persistent per-format failure maps are required for the main control flow.

### Runtime behavior

On load:

1. Read sidecar state for appId.
2. If `selectedType` exists:
   - If `label`: render label path directly.
   - Else: use `selectedUrl`/derived URL for that selected type.
3. If no selected type: run the resolution loop.

On first resolution (cache miss):

1. Try candidates in priority order.
2. First success wins and is persisted as selected type + URL.
3. If none succeed, persist `selectedType='label'`.

---

## Resolution Loop (Single Place)

```
resolveArtwork(appId, preferredUrl):
  candidates = [library, header, capsule]  // final chosen priority

  for candidate in candidates:
    url = buildUrl(candidate, preferredUrl, appId)
    if fetch(url) succeeds:
      persist selectedType=candidate, selectedUrl=url
      return candidate, url

  persist selectedType='label'
  return label
```

Important: this loop is the only place that decides "which artwork do we use?".

---

## Where "Permanent Failure" Fits After Refactor

Permanent-failure categorization can still exist for logging/observability, but it should not be the primary control signal.

- Keep: error typing for diagnostics, skip metrics, debug tools.
- Remove as flow gate: pre-loop `shouldSkip...` checks driving branch behavior.

The persisted selected type is the gate.

---

## Slot Allocation Consideration

To avoid wasting texture slots:

1. Check sidecar selected type first.
2. If selected type is `label`, do not allocate a texture slot.
3. Only allocate slot when selected type is non-label (or when entering first-time resolution path).

This preserves resource safety without duplicating precheck logic across orchestrator and request layers.

---

## Proposed Refactor Steps

1. Consolidate selection authority in `GameArtworkRequest.fetchFromStrategy` (or a single resolver extracted from it).
2. Remove `shouldSkipPermanentFailure` and `shouldSkipPermanentFailureForUrls` from the main flow.
3. Keep sidecar state minimal and selection-focused (`selectedType`, `selectedUrl`).
4. Update orchestrator preload path to consult selected type first and avoid slot allocation for label.
5. Treat explicit retry as "clear selection then rerun resolution loop".

---

## Expected Outcomes

1. One definition of "which artwork to use".
2. Fewer branching gates and lower cognitive overhead.
3. Label path becomes explicit and stable across sessions.
4. Better alignment between persisted metadata and runtime decisions.

---

## Open Decisions

1. Final priority order: `library -> header -> capsule` or `library -> capsule -> header`.
2. Whether `selectedUrl` is always required when selected type is non-label.
3. Whether to keep transient in-memory failure caches for optimization only (non-authoritative).

These can be finalized before implementation to keep the refactor clean and incremental.

---

## Phased Implementation Checklist

### Phase 0: Lock decisions

Goal: avoid churn mid-refactor.

- [ ] Confirm final candidate priority order.
- [ ] Confirm `selectedUrl` requirements for non-label selections.
- [ ] Confirm whether transient provider failure caches stay for diagnostics only.

### Phase 1: Make sidecar state the authoritative signal

File: [client/src/core/data/SteamArtworkStateManager.ts](client/src/core/data/SteamArtworkStateManager.ts)

- [ ] Keep API focused on `selectedType` and `selectedUrl` only.
- [ ] Ensure clear/retry path only clears selection state.
- [ ] Verify no callsites rely on removed failure-map/attempt APIs.

Validation:

- [ ] `yarn tsc --noEmit`
- [ ] `yarn vitest run test/unit/core/data/SteamArtworkStateManager.test.ts`

### Phase 2: Centralize resolution loop ownership

File: [client/src/scene/game-box/instancing/GameArtworkRequest.ts](client/src/scene/game-box/instancing/GameArtworkRequest.ts)

- [ ] Treat `fetchFromStrategy` (or extracted resolver) as the only selector of final artwork type.
- [ ] On success, persist selected type/url once.
- [ ] On full exhaustion, persist `selectedType='label'`.
- [ ] Remove pre-loop permanent-failure gate usage from request-level control flow.
- [ ] Keep failure reason categorization for diagnostics only.

Validation:

- [ ] Add/update tests to cover:
- [ ] cache miss resolves to library/header/capsule based on first success.
- [ ] full exhaustion resolves to label and persists label selection.
- [ ] subsequent call uses persisted selection path.

### Phase 3: Narrow provider responsibilities

File: [client/src/scene/game-box/instancing/GameArtworkProvider.ts](client/src/scene/game-box/instancing/GameArtworkProvider.ts)

- [ ] Keep URL strategy construction and fetch/cache mechanics.
- [ ] Remove flow-driving `shouldSkip...` APIs from runtime selection path.
- [ ] If retained, reframe transient failure caches as observability/optimization only.
- [ ] Ensure public API reflects this boundary (selection authority is not in provider).

Validation:

- [ ] `yarn vitest run test/unit/scene/instancing/GameArtworkProvider.test.ts`
- [ ] update test assertions away from permanent-failure precheck behavior.

### Phase 4: Orchestrator slot-allocation alignment

File: [client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts](client/src/scene/game-box/instancing/LodArtworkOrchestrator.ts)

- [ ] Read sidecar selection before slot allocation in prefetch path.
- [ ] If selected type is label, skip texture allocation and route to label behavior.
- [ ] For unresolved games, run normal artwork resolution path.
- [ ] Keep atlas-full handling and in-flight settlement semantics unchanged.

Validation:

- [ ] confirm no slot leaks on label outcomes.
- [ ] confirm `ArtworkSettled` still emits correctly after batch completion.

### Phase 5: Retry flow consistency

Files:

- [client/src/ui/GameLibraryListPanel.ts](client/src/ui/GameLibraryListPanel.ts)
- [client/src/scene/game-box/instancing/GameArtworkProvider.ts](client/src/scene/game-box/instancing/GameArtworkProvider.ts)

- [ ] Retry action clears selection sidecar state for selected appId.
- [ ] Retry does not depend on permanent-failure gates.
- [ ] Retry re-enters resolution loop and re-persists selected type.

Validation:

- [ ] manual retry smoke check from panel.
- [ ] automated test for clear-selection then re-resolve.

### Phase 6: Integration hardening

Files likely affected by tests:

- [client/test/unit/scene/instancing/GameArtworkProvider.test.ts](client/test/unit/scene/instancing/GameArtworkProvider.test.ts)
- [client/test/unit/core/data/SteamArtworkStateManager.test.ts](client/test/unit/core/data/SteamArtworkStateManager.test.ts)
- [client/test/unit/scene/instancing](client/test/unit/scene/instancing)

- [ ] Add a focused test matrix for:
- [ ] first-load resolution.
- [ ] cached-selection reuse.
- [ ] label persistence and reuse.
- [ ] retry clears selection and re-resolves.

Final validation:

- [ ] `yarn tsc --noEmit`
- [ ] `yarn vitest run test/unit/core/data/SteamArtworkStateManager.test.ts test/unit/scene/instancing/GameArtworkProvider.test.ts`

---

## Suggested Rollout Strategy

1. Commit Phase 1 and Phase 2 together (selection authority and sidecar contract).
2. Commit Phase 3 separately (provider API cleanup).
3. Commit Phase 4 and Phase 5 together (orchestrator/runtime behavior).
4. Commit Phase 6 as test hardening.

This keeps each commit reviewable and reduces risk of hidden behavioral drift.
