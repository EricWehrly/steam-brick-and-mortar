# Branch: openclaw/feat-demo-store

## Purpose
Demonstrate the store without requiring a Steam user to be logged in.
Primary audience: dev testing, CI visual tests, and showing the store to
someone who doesn't have a Steam account nearby.

This branch is also used for iterative visual polish on top of the stable
openclaw/6.2.x base.

## What's Here vs 6.2.x

### From the old demo-store branch (cherry-picked)
- Anonymous store mode: client/src/steam/fixtures/demo-games.ts
  18 hardcoded fixture games (TF2, Dota2, CS2, etc.) auto-load in
  developmentMode when no cached Steam user exists. No network, no CDN
  art, immediate label rendering.
- ui-design-tokens.css: CSS custom property token file

### Added on this branch
- Label rotation fix (InstancedLabelRenderer now accepts rotation from GameBoxUtils)
- suppressEmit removed from GpuStorePropsRenderer (layoutDetermined flag instead)
- ProceduralTextureWorker migrated to ManagedWorker base class
- Lighting panel UI token application (in progress - subagent)

## Current Scope / What To Do Next
1. Verify anonymous store renders (yarn dev, no Steam user cached)
2. Label rotation - verify label boxes now face correctly on arc shelves
3. Migrate TextureWorker and PixelDataCache to ManagedWorker (see tech-debt.md)
4. Delete WorkerErrorUtils once all three workers use ManagedWorker
5. GpuStorePropsRenderer split - extract layout functionality to ShelfLayoutManager

## Rename Note
"Demo store" is slightly misleading. The key feature is an "anonymous/empty store"
mode for development. Could rename to feat-anonymous-store on next branch cut.