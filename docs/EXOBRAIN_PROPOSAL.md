# Exobrain Reorganization Proposal
**Author**: Vex (AI agent subagent pass)  
**Date**: 2026-04-04  
**Purpose**: Restructure `docs/` to be a high-quality exobrain for LLM agents working on this codebase

---

## Current State Assessment

The docs directory is large (~70 files) and has grown organically across at least 3 phases of development. The structure is broadly sane — there's already an `archive/`, `active/`, `architecture/`, etc. — but there are real problems for LLM context loading:

1. **`analysis/` is a graveyard.** Contains pre-refactor analysis docs (DI pattern proposal, legacy bifurcation analysis, indirection patterns, scene-factory redundancy, material duplication). These refactors are done (the DI system exists, `ServiceContainer` is in use). Loading these wastes tokens and may actively confuse an agent about the current architecture.

2. **`docs/` root has duplicate/stale roadmaps.** `roadmap-phase1-ready-for-me.md`, `roadmap-phase2-ready-for-friends.md`, `roadmap-phase3-ready-for-everyone.md` at root level are detailed task breakdowns. `active/roadmap.md` summarizes all three. An LLM will likely read both, getting redundant context.

3. **`active/` has some stale planning docs.** `network-fetch-optimization-plan.md`, `texture-cache-refactor-plan.md`, `shader-prewarm-plan.md` — these appear to be future plans, not active work. Without reading each fully, unclear if they're live or stale.

4. **`docs/technical/` at root is orphaned.** `docs/technical/cache-refactor-plan.md` exists alone, with similar plans in `archive/completed/` and `active/`. Almost certainly stale/redundant.

5. **`client/docs/` is a separate tree** with its own `technical/` subdirectory and refactor plans. Some files there (`di-phase1-summary.md`, `di-phase2-summary.md`) are historical completion records. The `startup-sequence.md` is actively valuable and should be surfaced.

6. **`research/alternatives/` is historical.** Technology comparison research (godot vs webxr, steamvr-vscript, etc.) — the decision was made years ago. These are pure archive material.

7. **`docs/README.md` is generic nav boilerplate.** Useful for a human browsing a GitHub repo, but actively bad for an LLM — it lists directories without saying *what state the project is in* or *what the agent should load first*.

---

## Files to Archive or Delete

### Archive → `docs/archive/analysis/` (completed pre-refactor work)
These describe problems that have been solved. An agent reading them would model a codebase that no longer exists.

- `docs/analysis/dependency-injection-pattern-proposal.md` → DI is implemented; this is moot
- `docs/analysis/indirection-patterns-analysis.md` → indirection cleanup is in `archive/completed/`
- `docs/analysis/legacy-bifurcation-analysis.md` → legacy code appears cleaned up
- `docs/analysis/scene-factory-redundancy-analysis.md` → scene refactoring done
- `docs/analysis/material-duplication-analysis.md` → likely resolved
- `docs/analysis/scene-traverse-audit.md` → audit, not ongoing doc
- `docs/analysis/instanced-mesh-implementation-plan.md` → instancing is live (architecture docs exist)
- `docs/analysis/debug.log` → **DELETE**. A debug.log file has no place in docs.

### Archive → `docs/archive/research/` (technology decisions are final)
- `docs/research/alternatives/` (entire subdirectory) → WebXR decision was made; godot/steamvr research is trivia now
- `docs/steam-categorization-research.md` → move to research archive

### Archive → `docs/archive/completed-plans/`
- `docs/technical/cache-refactor-plan.md` → duplicate of archived version
- `client/docs/technical/di-phase1-summary.md` → historical
- `client/docs/technical/di-phase2-summary.md` → historical
- `client/docs/ui-coordinator-refactor-plan.md` → check if done; likely completed
- `client/docs/interaction-architecture-refactor-plan.md` → check status

### Keep but verify staleness before next agent session
- `docs/active/network-fetch-optimization-plan.md`
- `docs/active/texture-cache-refactor-plan.md`
- `docs/active/shader-prewarm-plan.md`
- `client/docs/technical/data-management-system-plan.md`

---

## Proposed New Directory Structure

```
docs/
├── README.md                          ← REWRITE: LLM entrypoint (see below)
├── EXOBRAIN_PROPOSAL.md               ← this file
│
├── agent-context/                     ← NEW: stuff an LLM should load every session
│   ├── architecture-rules.md          ← distilled rules (coordinator pattern, DI keys, event bus)
│   ├── startup-sequence.md            ← MOVE from client/docs/technical/startup-sequence.md
│   ├── component-interaction-map.md   ← MOVE from active/ (keep, it's a living map)
│   └── code-conventions.md            ← NEW: pull key conventions from guidelines/ into one file
│
├── active/                            ← things being actively worked RIGHT NOW
│   ├── roadmap.md                     ← keep (high-level status)
│   ├── bugs.md                        ← keep
│   ├── tech-debt.md                   ← keep
│   ├── gpustoreprops-event-untangling.md  ← keep (active plan, status=In Progress)
│   ├── startup-event-tracking.md      ← keep (active system)
│   ├── startup-sequence-diagram.md    ← keep (visual aid for active work)
│   └── startup-tracking-quick-reference.md ← keep
│
├── plans/                             ← NEW: future work, not yet started
│   ├── network-fetch-optimization-plan.md
│   ├── texture-cache-refactor-plan.md
│   ├── shader-prewarm-plan.md
│   └── steam-store-api-integration.md  ← MOVE from active/ if not actively being coded
│
├── architecture/                      ← KEEP: stable architecture reference
│   ├── webxr-architecture.md
│   ├── event-driven-architecture-pattern.md
│   ├── instancing-architecture.md
│   ├── image-texture-pipeline.md
│   ├── steam-lambda-infrastructure.md
│   └── cdn-access-strategy.md
│   (remove: event-driven-migration-roadmap.md if migration is complete)
│   (remove: room-structure-refactor-plan.md if refactor is done)
│
├── guidelines/                        ← KEEP: development standards
│   ├── test-guidelines.md
│   ├── ui-guidelines.md
│   ├── readme-guidelines.md
│   └── links.md
│
├── roadmaps/                          ← NEW: consolidate the 3 root-level phase docs
│   ├── phase1-ready-for-me.md
│   ├── phase2-ready-for-friends.md
│   └── phase3-ready-for-everyone.md
│
├── research/                          ← trim to only still-relevant research
│   ├── dissolve-animation-research.md
│   ├── view-dependent-rendering-technique.md
│   └── implementation/
│       ├── phase2-shelf-generation-research.md
│       └── phase2c-store-layout-spatial-research.md
│   (alternatives/ → archive)
│   (steam-api-research.md → archive if Steam integration is complete)
│   (command-line-installation-research.md → archive)
│
├── design-philosophy.md               ← keep at root (core identity doc)
│
└── archive/                           ← KEEP, add subdirs as needed
    ├── analysis/                      ← NEW: move docs/analysis/ here
    ├── research/alternatives/         ← NEW: move research/alternatives/ here
    └── (existing subdirs)
```

---

## How to Rewrite `docs/README.md` for LLM Consumption

The current README is a GitHub-flavored nav page. An LLM needs a **project state briefing**, not a directory listing. Here's the proposed content:

```markdown
# Steam Brick and Mortar — Documentation Index (LLM Entrypoint)

## What This Project Is
A WebXR VR game launcher that renders your Steam library as a virtual brick-and-mortar video store.
Stack: Three.js r170 + WebXR + TypeScript 5.7 + Vite 6. Backend: AWS Lambda + API Gateway (Steam API proxy).

## Current Status (as of April 2026)
- **Active Phase**: Phase 1 — "Ready for Me" (~85% complete)
- **Current Milestone**: Milestone 6 — Level Layout and Spatial Design
- **Current Focus**: Enhanced shelf visuals, smart game population, lighting improvements
- **Architecture**: DI container sealed, event-driven coordinator pattern active, instanced rendering live

## Load Order for Agent Context
If you're starting a session, load these in order (smallest to largest):

1. `agent-context/architecture-rules.md` — non-negotiable architecture rules
2. `agent-context/startup-sequence.md` — 5-phase startup, critical for event debugging
3. `active/roadmap.md` — current phase status and active task
4. `active/bugs.md` — known open bugs to avoid reintroducing
5. `active/tech-debt.md` — backlog of known issues (don't fix unless asked)

Load on-demand:
- `agent-context/component-interaction-map.md` — 37-component full interaction map (large, load if diagnosing wiring issues)
- `architecture/` — stable design docs, load the relevant one if working in that subsystem
- `active/gpustoreprops-event-untangling.md` — if working on event system refactor

## Key Architecture Rules (TL;DR)
- DI via `ServiceContainer` / `ServiceKeys` — never pass services through constructor params ad-hoc
- Events via `EventManager` with typed `GameEventTypes` — no direct method calls across coordinator boundaries
- Scene lifecycle managed by `SceneCoordinator` — don't instantiate scene objects outside it
- UI layers: `SteamUICoordinator`, `WebXRUICoordinator`, `SystemUICoordinator` — each owns its layer
- All per-frame work registers with `RenderLoopRegistry`

## Directory Quick Reference
| Path | Purpose |
|------|---------|
| `active/` | Live tracking: roadmap, bugs, tech debt, in-progress plans |
| `agent-context/` | Distilled LLM context: architecture rules, startup, component map |
| `architecture/` | Stable architecture decisions and system designs |
| `guidelines/` | Code conventions, test standards, UI rules |
| `plans/` | Future work not yet started |
| `roadmaps/` | Detailed phase task breakdowns |
| `research/` | Research docs still relevant to active decisions |
| `archive/` | Completed plans, historical analysis, superseded designs |
```

---

## Summary of Key Changes

| Change | Rationale |
|--------|-----------|
| Create `agent-context/` | Agents need a fast-load context tier; mixing it into `active/` creates noise |
| Archive `docs/analysis/` | Pre-refactor analysis describes a codebase that no longer exists |
| Archive `research/alternatives/` | Technology decision is final; loads stale context |
| Move root roadmap files to `roadmaps/` | Reduces root clutter; `active/roadmap.md` is the summary |
| Rewrite `README.md` as LLM briefing | Current README is human nav boilerplate, not agent context |
| Add `plans/` tier | Separates "actively coding this" from "intend to do someday" |
| Move `client/docs/technical/startup-sequence.md` to `agent-context/` | It's the canonical startup doc; shouldn't be buried in client/ |
| Delete `docs/analysis/debug.log` | A debug log file with no documented purpose |

---

## What NOT to Touch
- `docs/active/gpustoreprops-event-untangling.md` — this is an active multi-phase refactor, keep in active/
- `docs/active/startup-event-tracking.md` — `StartupEventTracker` is a live system
- `docs/design-philosophy.md` — good soul document, keep at root or move to agent-context/
- `docs/guidelines/` — all four files appear actively useful
- `docs/architecture/` — most are stable and accurate (verify `event-driven-migration-roadmap.md` and `room-structure-refactor-plan.md` aren't stale)
- `client/docs/technical/playwright-visual-testing-plan.md` — check if Playwright is actually in use; if not, this is a plan not yet started
