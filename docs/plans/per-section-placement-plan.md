# Per-Section Placement Plan

## Why This Revision Exists
The previous plan treated section identity and arrangement/allocation decisions as one seam.

That is not the desired architecture. Even if both are computed in one pass, they must be emitted separately so consumers can subscribe to the concern they own.

## Current State (As Implemented)
1. GameSorter computes grouped/sorted sections.
2. GameSorter computes allocation and capping in the same run.
3. GameSorter emits `SectionsComputed` as uncapped section identity.
4. GameSorter emits `ArrangementAllocationPlanned` with per-section allocation keyed by `sectionId`.
5. GameSorter emits `SectionsReadyForPlacement` for spawner execution and `SectionsReady` for layout/sign consumers.
6. GameBoxSpawner consumes `SectionsReadyForPlacement` and no longer consumes `SectionsReady`.

## Intended State (Separated Event Concerns)
1. Emit section identity as its own seam.
2. Emit arrangement/allocation decisions as its own seam.
3. Emit placement execution payload as its own seam.

### Event A: Section Identity
Name: `SectionsComputed`

Payload responsibility:
1. Group/sort provenance (`groupMode`, `sortMode`).
2. Full section set before allocation truncation.
3. Stable section identifiers (`sectionId`) for cross-event joins.
4. Section identity data (`sectionName`, game membership).

Consumers:
1. Diagnostics and analytics.
2. UI summaries and section-level tooling.
3. Allocation planner input.

### Event B: Arrangement/Allocation Decision
Name: `ArrangementAllocationPlanned`

Payload responsibility:
1. Capacity policy inputs (`shelfCapacity`, `maxShelves`, policy version).
2. Per-section requested vs allocated shelves keyed by `sectionId`.
3. Requested/allocated/deferred game counts keyed by `sectionId`.
4. Run-level totals.

Consumers:
1. Shelf layout planning.
2. Capacity diagnostics.
3. Future settings UI previews.

### Event C: Placement Execution Input
Name: `SectionsReadyForPlacement`

Payload responsibility:
1. Only what spawner needs to execute placement.
2. Explicitly allocated section windows keyed by `sectionId`.
3. Deterministic game subset boundaries (`startIndex`, `endIndexExclusive` or equivalent).

Consumers:
1. GameBoxSpawner.

## Current vs Intended Diffs
1. Concern boundaries:
Current: identity and decision are emitted separately.
Intended: preserve separation and keep payload ownership strict.

2. Section truth source:
Current: `SectionsComputed` is uncapped canonical topology.
Intended: `SectionsComputed` is uncapped canonical section topology.

3. Consumer coupling:
Current: downstream systems infer too much from one payload.
Intended: each consumer subscribes to one concern seam.

4. Progressive loading readiness:
Current: one-pass emission only.
Intended: allocation and execution seams can stream per section/chunk later.

## Revised Implementation Plan

### Phase 1: Introduce Explicit Section Identity Seam
1. Add `SectionsComputedEvent` type.
2. Emit `SectionsComputed` from GameSorter before allocation/capping.
3. Include stable `sectionId` in each section entry.

### Phase 2: Rename and Narrow Allocation Seam
1. Allocation seam is now `ArrangementAllocationPlanned`. ✅
2. Allocation payload references `sectionId`; avoid carrying section identity fields redundantly.
3. Keep run-level totals and policy metadata.

### Phase 3: Isolate Placement Execution Seam
1. Introduce `SectionsReadyForPlacement` payload keyed by `sectionId`. ✅
2. Carry only allocated section game windows.
3. Move GameBoxSpawner to this seam.
4. Keep `SectionsReady` for layout/sign consumers only.

### Phase 4: Progressive Per-Section Execution
1. Emit placement-ready sections in chunks.
2. Add pacing/backpressure policy (idle budget or frame budget).
3. Add shelf reuse/pool policy once chunking is stable.

## Capacity and Configurability Strategy
1. Centralize capacity terms under one policy object (no new hardcoded literals).
2. Keep searchable markers for future UI settings:
`CONFIG-CANDIDATE(layout-capacity)`
3. Ensure capacity supports future shelf profiles (different shelf types/layouts).

## Validation Criteria
1. `SectionsComputed` includes full uncapped section topology.
2. `ArrangementAllocationPlanned` contains deterministic per-section allocation keyed by `sectionId`.
3. Placement consumers can execute using only placement event payload.
4. Arrangement persistence behavior remains unchanged.
5. Existing regression tests pass while seams are split.
