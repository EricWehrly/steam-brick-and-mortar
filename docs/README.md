# Steam Brick and Mortar - LLM Exobrain

This directory is structured specifically as a knowledge base and entrypoint for AI agents (like Vex) working on the project.

## Where to start
1. Read oadmaps/current-status.md to understand what we are working on right now.
2. Read gent-context/startup-sequence.md to understand the 5-phase startup architecture.
3. Read gent-context/component-interaction-map.md to understand the DI and event flow.

## Directory Structure

### ?? gent-context/
High-value, fast-load architectural rules and interaction maps. **Read these to understand how the codebase works.**

### ?? oadmaps/
**Active work and tracking.**
- current-status.md - The immediate focus.
- ugs.md - Active bugs.
- 	ech-debt.md - Known technical debt.
- phaseX...md - High-level project milestones.

### ?? plans/
**Pending feature plans and refactor proposals.**
These are things we *intend* to do, but are not actively coding right this second. Check these before starting a new major feature to see if we already designed it.

### ??? rchitecture/
**Deep-dive technical design documents.**
Read these when touching specific complex systems (e.g., WebXR, Instancing, Event-Driven patterns).

### ?? guidelines/
**Conventions and rules.**
UI patterns, testing rules, etc.

### ?? esearch/ & ??? rchive/
**Historical context.**
Do not read these unless specifically looking for why a past decision was made or how an old feature worked.
