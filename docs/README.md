# Steam Brick and Mortar - LLM Exobrain

This directory is structured specifically as a knowledge base and entrypoint for AI agents (like Vex) working on the project.

## Current status
**Act 2: Ready for Friends** — see [`acts/act2-ready-for-friends.md`](acts/act2-ready-for-friends.md).

**2026-07-22 reorientation**: Act 2 now targets a downloadable desktop client
([`features/desktop-app.md`](features/desktop-app.md)) as the primary release vehicle, not a
publicly-hosted web build — see the act doc's Overview for the full rationale. Web hosting is
demoted to an Act 3 stretch goal ([`features/static-hosting.md`](features/static-hosting.md)).

In-flight thread:
- **Input System** ([`features/input-system.md`](features/input-system.md)) — most of the
  abstraction and gamepad support already exist; remaining work is a live pause-menu input-leak
  bug, two half-wired camera controls (roll, acceleration), and VR controller routing (Gate 2).

Recently closed out:
- **Framerate regression investigation**
  ([`plans/framerate-regression-investigation-plan.md`](plans/framerate-regression-investigation-plan.md)) —
  root-caused 2026-07-29: N8AO (SSAO) was ~84.5% of the 16.67ms frame budget at the old default.
  Fixed by shipping a measured-cost `ssaoQuality` slider. 2026-07-30: extended into re-implementing
  the "Renderer Quality Preset" selector as a real unified dial — `RENDER_QUALITY_PRESETS` in
  `AppSettings.ts` now drives `lightingQuality`/`shadowQuality`/`ssaoQuality`/`smaaPreset`/
  `msaaLevel`/`pixelRatioScale` together per tier, built from a fresh settings sweep (`PerfSweep.ts`,
  `?sweep=1`) plus the existing SSAO data. The capture tool and settings-sweep methodology are
  documented separately — see
  [`architecture/frame-budget-capture-tooling.md`](architecture/frame-budget-capture-tooling.md).
  Visual-quality validation of both the SSAO default and the new preset tiers is still owed (not yet
  done).

Still open from the prior thread (desktop local data pipeline, PR 141): `autoLoadProfile` isn't
wired to the startup waterfall yet
(`docs/tech-debt.md#id-autoloadprofile-not-wired-to-startup-waterfall`), tracked as an early Act 3
item per the act doc's "Move to Act 3" list.

## Where to start
1. Read the current act doc above — goals, feature list, completion criteria.
2. Read the relevant feature doc(s) in `features/` for the specific work at hand.
3. Check `../.github/lessons-learned.md` for entries relevant to the work at hand — especially
   before adding a new load path, persistence key, validation routine, or event that might
   duplicate something the codebase already has. This is an active step, not an optional
   reference: skipping it is how duplicate mechanisms get built in the first place.
4. Read `agent-context/startup-sequence.md` to understand the 5-phase startup architecture.
5. Read `agent-context/component-interaction-map.md` **only when touching the DI/event layer** — deep-dive reference (~1700 lines), not required reading for every task.

## Tech Debt Tags

Source files may contain one or more `// TD: <tag-id>` comments near the top. These signal that the file is affected by a tracked tech debt item.

- **Tag format**: `// TD: kebab-case-name` — one line per item, in the file's top comment block or just below imports
- **Lookup**: Find the tag as an `## id: <tag-id>` section in `tech-debt.md`
- **Meaning**: "This file needs attention when working on this debt item, but it is NOT a blocker for unrelated work"

Example in a source file:
```typescript
// TD: legacy-atlas-removal
// TD: sticker-coordinator
import { ... }
```

## Directory Structure

### 🎭 acts/
**The primary planning layer.** Each act is a development phase with named goals, gated feature sets, and completion criteria.
- `act1-intermission-technical-stewardship.md` — completed: debt paydown, metrics, UI normalization
- `act2-ready-for-friends.md` — current phase: hosting, infrastructure, VR
- `act3-ready-for-everyone.md` — public release: compliance, scaling
- `act4-encore-someday-maybe.md` — unscheduled ideas and stretch goals

### 🧩 features/
**One doc per feature.** Each feature has status, acceptance criteria, stories/tasks, related plans, and related debt IDs. Features are linked from act docs. Read the feature doc before starting any non-trivial work.

### 📋 agent-context/
High-value, fast-load architectural rules and interaction maps. **Read these to understand how the codebase works.**
- `performance-metrics.md` — what metrics we track, current targets, how to measure, known gaps. Non-mandatory; read when asked about metrics or setting up measurement.

### 🗺️ Root tracking docs
- `bugs.md` — active bugs
- `tech-debt.md` — tagged architectural debt (keyed by TD tag IDs)
- `README.md` — this file; entry point for agents

### 📝 plans/
**Implementation plans and design proposals.**
These are detailed "how to build it" docs for specific features. Check these before implementing a feature — we may have already designed it. Each plan is linked from its parent feature doc.

### 🏛️ architecture/
**Deep-dive technical design documents.**
Read these when touching specific complex systems (WebXR, instancing, event-driven patterns, data management).


### 🔬 research/ & 📦 archive/
**Historical context.**
Do not read these unless specifically looking for why a past decision was made or how an old feature worked.
