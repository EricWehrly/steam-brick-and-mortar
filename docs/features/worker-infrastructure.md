# Feature: Worker Infrastructure (ManagedWorker)

**Act**: 1 (Mostly Complete — one known pending item)
**Status**: In Progress (pending carpet worker off-thread; otherwise done)
**Priority**: Low — check-in deliberately during Key Metrics work

## Goal

A consistent, lifecycle-managed base class for all Web Workers — reducing startup thread locking, improving error handling, and making worker patterns reusable across the codebase.

## Context

Before `ManagedWorker`, each worker had its own ad-hoc lifecycle, error handling, and message routing. This made workers fragile, hard to test, and a source of main-thread hitches during startup (workers were being initialized synchronously or without proper scheduling).

`ManagedWorker` was introduced as a base class that all workers now extend. It standardizes construction, message dispatch, error propagation, and teardown. The migration of all existing workers (`ProceduralTextureWorker`, `NeonGeometryWorker`, pixel-cache worker, etc.) to `ManagedWorker` is complete. `WorkerErrorUtils` was deleted as a result.

The main thread locking improvement was a direct performance benefit — workers that previously competed with startup sequencing now initialize within the managed framework without blocking.

## What Was Done

- `ManagedWorker` base class implemented
- All workers migrated: `ProceduralTextureWorker`, pixel-cache worker, `NeonGeometryWorker`
- `WorkerErrorUtils` deleted (functionality absorbed into `ManagedWorker`)
- Error handling standardized across all workers
- `WorkerErrorUtils` fold-into-ManagedWorker reviewer note from PR #39 resolved
- **Pending**: carpet texture generation is still on the main thread (`prewarmCarpet` in `SharedMaterialManager`); tracked in `tech-debt.md` as `carpet-worker-offload`. Check-in on this during Key Metrics instrumentation work to understand its frame cost.

## Notes

- Related plan (archived): `docs/archive/neon-tube-worker-plan.md` — ManagedWorker pattern applied to NeonGeometryWorker; work is complete.
- `ManagedWorker` is infrastructure, not a user-facing feature. It is complete and should not need significant revisiting unless a new worker type emerges with requirements outside the current base class.
- The performance benefit (reduced main-thread locking) feeds into the Key Metrics Instrumentation story — startup time improvements are partly attributable to this work.


**Related debt**: `carpet-worker-offload`
