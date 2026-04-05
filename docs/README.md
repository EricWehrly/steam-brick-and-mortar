# Steam Brick and Mortar - LLM Exobrain

This directory is structured specifically as a knowledge base and entrypoint for AI agents (like Vex) working on the project.

## Where to start
1. Read `roadmaps/current-status.md` to understand what we are working on right now.
2. Read `agent-context/startup-sequence.md` to understand the 5-phase startup architecture.
3. Read `agent-context/component-interaction-map.md` **only when touching the DI/event layer** — it is a deep-dive reference (~1700 lines), not required reading for every task.

## Tech Debt Tags

Source files may contain one or more `// TD: <tag-id>` comments near the top. These signal that the file is affected by a tracked tech debt item.

- **Tag format**: `// TD: kebab-case-name` — one line per item, in the file's top comment block or just below imports
- **Lookup**: Find the tag as an `## id: <tag-id>` section in `roadmaps/tech-debt.md`
- **Meaning**: "This file needs attention when working on this debt item, but it is NOT a blocker for unrelated work"
- **Status**: Some debt items are marked `(pattern not yet finalized)` — means the approach is still being designed; tag the files now so we don't lose track, but don't act on them yet

Example in a source file:
```typescript
// TD: singleton-pattern-refactor
// TD: event-migration-store-props
import { ... }
```

## Directory Structure

### 📋 agent-context/
High-value, fast-load architectural rules and interaction maps. **Read these to understand how the codebase works.**

### 🗺️ roadmaps/
**Active work and tracking.**
- `current-status.md` - The immediate focus.
- `bugs.md` - Active bugs.
- `tech-debt.md` - Known technical debt (keyed by TD tag IDs).
- `phaseX-*.md` - High-level project milestones.

### 📝 plans/
**Pending feature plans and refactor proposals.**
These are things we *intend* to do, but are not actively coding right this second. Check these before starting a new major feature to see if we already designed it.

### 🏛️ architecture/
**Deep-dive technical design documents.**
Read these when touching specific complex systems (e.g., WebXR, Instancing, Event-Driven patterns).

### 📏 guidelines/
**Conventions and rules.**
- `code-conventions.md` — JSDoc hygiene, file size, naming, TD tags ("clean as you go" rules)
- Other UI patterns and testing rules.

### 🔬 research/ & 📦 archive/
**Historical context.**
Do not read these unless specifically looking for why a past decision was made or how an old feature worked.
