# Steam Brick and Mortar - LLM Exobrain

This directory is structured specifically as a knowledge base and entrypoint for AI agents (like Vex) working on the project.

## Current status
**Act 2: Ready for Friends** — see [`acts/act2-ready-for-friends.md`](acts/act2-ready-for-friends.md).

Active in-flight thread: **library population alternatives** — manual import (bookmarklet/file)
now converges onto the same unified `Library` shape as the online path (both halves built and
live-verified 2026-07-11; see [`plans/library-source-convergence-plan.md`](plans/library-source-convergence-plan.md)),
closing out the ownership-traffic-avoidance work from
[`archive/manual-library-export-feasibility.md`](archive/manual-library-export-feasibility.md).
Next up: the desktop app's local Steam-files reading path (see
[`features/desktop-app.md`](features/desktop-app.md)).

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
- `act1-intermission-technical-stewardship.md` — current phase: debt paydown, metrics, UI normalization
- `act2-ready-for-friends.md` — next phase: hosting, infrastructure, VR
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
