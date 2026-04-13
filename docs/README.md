# Steam Brick and Mortar - LLM Exobrain

This directory is structured specifically as a knowledge base and entrypoint for AI agents (like Vex) working on the project.

## Where to start
1. Read `roadmaps/current-status.md` — what we are working on right now and which act/branch is active.
2. Read the current act doc in `acts/` (linked from current-status.md) — goals, feature list, completion criteria.
3. Read the relevant feature doc(s) in `features/` for the specific work at hand.
4. Read `agent-context/startup-sequence.md` to understand the 5-phase startup architecture.
5. Read `agent-context/component-interaction-map.md` **only when touching the DI/event layer** — deep-dive reference (~1700 lines), not required reading for every task.

## Tech Debt Tags

Source files may contain one or more `// TD: <tag-id>` comments near the top. These signal that the file is affected by a tracked tech debt item.

- **Tag format**: `// TD: kebab-case-name` — one line per item, in the file's top comment block or just below imports
- **Lookup**: Find the tag as an `## id: <tag-id>` section in `roadmaps/tech-debt.md`
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

### 🗺️ roadmaps/
**Active tracking.**
- `current-status.md` — immediate focus and active branch
- `bugs.md` — active bugs
- `tech-debt.md` — known technical debt sorted by Fix Now / Act 2 / Later (keyed by TD tag IDs)

### 📝 plans/
**Implementation plans and design proposals.**
These are detailed "how to build it" docs for specific features. Check these before implementing a feature — we may have already designed it. Each plan is linked from its parent feature doc.

### 🏛️ architecture/
**Deep-dive technical design documents.**
Read these when touching specific complex systems (WebXR, instancing, event-driven patterns, data management).

### 📏 guidelines/
**Conventions and rules.**
- `code-conventions.md` — JSDoc hygiene, file size, naming, TD tags ("clean as you go" rules)
- `test-guidelines.md`, `ui-guidelines.md` — domain-specific rules

### 🔬 research/ & 📦 archive/
**Historical context.**
Do not read these unless specifically looking for why a past decision was made or how an old feature worked.
