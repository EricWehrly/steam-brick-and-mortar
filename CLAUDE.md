# Steam Brick and Mortar

## ⚠️ CRITICAL: Package Manager

**NEVER use `npx`. NEVER use `npm`.** This project uses **Yarn PnP exclusively**.

All commands: `yarn <command>`. `npx` is not configured — it silently uses different resources and will break the build. There is no scenario where trying `npx` as a fallback is correct.

## Project Overview

WebXR-first VR environment that dynamically displays and launches Steam games. Combines WebXR/Three.js, Blender CLI automation, and Steam Web API integration via AWS Lambda.

## Architecture

- **WebXR + Three.js** — cross-platform VR environment (primary)
- **Blender CLI** — procedural 3D asset generation via Python scripts
- **Material Maker** — procedural PBR material authoring + CLI bake (clone + release binary at `F:\FilePrograms\Dropbox\Projects\material-maker`); plans: `docs/plans/procedural-materials-pipeline-plan.md`
- **Steam Web API** — game library via serverless proxy
- **AWS Lambda + Terraform** — serverless infrastructure
- **Docker** — containerized dev environment
- **Yarn PnP** — package management (see above)

```
steam-brick-and-mortar/
├── client/             # TypeScript WebXR app (Vite + Three.js) — see client/CLAUDE.md
├── external-tool/      # Node.js tools + AWS Lambda
│   └── infrastructure/ # Terraform modules
├── blender/            # Blender scripts for 3D assets
├── docs/               # Architecture decisions and research
└── .github/            # Dev guidelines and captured lessons
```

## Event-Driven Architecture

These rules apply to all production runtime paths. They are not preferences.

- **Zero cross-class dependencies**: Classes communicate exclusively through typed events. No direct method calls between orchestrators or handlers.
- **No direct method fallbacks**: Race conditions and ordering issues are solved with event contract changes, readiness events, or buffering at event boundaries — not by adding direct calls.
- **Owner-managed subscriptions**: A class that owns buffered or lifecycle-sensitive state subscribes to the events governing that state itself. Pass-through control methods (whose only job is letting another class trigger a reset or clear) are a design smell. When sub-components each need to react to an event, each sub-component registers directly — a parent forwarder that calls each in turn is the wrong direction.
- **Capability-based handler selection**: Default handlers provide baseline functionality. Feature-rich handlers self-register when capabilities are available and fall back gracefully when they're not.
- **Readonly event data**: Events emit only readonly data — no mutation.
- **Event-driven async**: Use event listeners, not `await` across class boundaries.
- **Handler bootstrap**: Handlers instantiate themselves to enter the execution path for self-registration.
- **Intent-revealing handler names**: `stagePlacementRunFromSections`, not `handleSectionsReady`.

**Known exceptions**: `DataManager` and `EventManager` remain singletons (migration TBD).

## Development

### Tooling
- Prefer Docker Compose for reproducible builds
- **Check your working directory before running commands.** Most terminal errors in this project trace back to being in the wrong directory. Read the error before assuming the command is broken. Yarn commands (`test`, `tsc`, `vitest`, `build`) run from `client/` unless stated otherwise.
- Don't chain failing commands: if `cd client && yarn tsc` fails because you're already in `client/`, just run `yarn tsc`
- **Local sources before web research**: check local clones (siblings under `F:\FilePrograms\Dropbox\Projects\<name>`, e.g. `material-maker`), `docs/`, and bundled tool docs before spawning web research. Web research is for true gaps only — one focused agent, not a fan-out.

### TDD
- Run unit tests before every commit
- Every new class/module gets unit tests
- Test event emissions and handlers — not just that they were mocked
- Incremental commits: each working phase is its own commit
- **Tests follow production code, not the reverse.** When a test fails because production code was intentionally refactored, update the test — don't revert the refactor to make a stale test green.

### Git
- Stage only files you modified: `git add <file1> <file2>` — never `git add -A`
- Meaningful commits: group related changes, describe what and why
- Don't mix implementation with documentation in the same commit
- Secrets: `.env` files locally, AWS Secrets Manager in production — never commit keys

### Terraform
Always follow in order — never skip:
1. `terraform validate`
2. `terraform plan`
3. Review the plan output carefully
4. `terraform apply`
5. Commit with a descriptive message

## Roadmap & Docs

Entry point: **`docs/README.md`** — the map of the whole `docs/` tree. Read it first.

The planning layer is organized as **acts** (phases), with one doc per feature:

| Path | Purpose |
|------|---------|
| `docs/README.md` | Docs entry point + directory guide (start here) |
| `docs/acts/` | Primary planning layer — `act1-intermission-…`, `act2-ready-for-friends`, `act3-ready-for-everyone`, `act4-encore-someday-maybe`. Each act lists its gated feature set and completion criteria. |
| `docs/features/` | One doc per feature: status, acceptance criteria, stories/tasks, related plans/debt. Read the feature doc before non-trivial work. |
| `docs/plans/` | Implementation/design plans ("how to build it"), linked from their parent feature. |
| `docs/architecture/` | Deep-dive technical design (WebXR, instancing, event-driven, data management). |
| `docs/tech-debt.md` | Tagged architectural debt, keyed by `// TD: <tag-id>` source comments. |
| `docs/bugs.md` | Active bugs. |

### TD tag system

Source files reference debt entries with inline comments: `// TD: <tag-id>` (e.g. `// TD: appid-keyed-cache-split`). The `tag-id` matches the `## id:` heading in `docs/tech-debt.md`.

- When writing a TODO that maps to an existing debt entry, use `// TD: <tag-id>` instead of a bare `// TODO`.
- When adding new architectural debt, add an entry to `docs/tech-debt.md` first, then tag the source with its id.
- When encountering a bare TODO in code you're touching, check `docs/tech-debt.md` for a matching entry and upgrade it to a TD tag if found.
- Don't invent a tag-id that doesn't exist in `docs/tech-debt.md`.
- Removing a TD tag without resolving the debt is not allowed — move it or escalate it, don't drop it.

Current focus is tracked in the act docs (see the act marked current in `docs/README.md`).

Adding a feature: determine the act → add/UPDATE its `docs/features/<feature>.md` → link it from the
act doc → write a `docs/plans/<feature>-plan.md` if it needs a build plan. Defer with a "TBD"
note that records the Deferral Reason, Dependencies, and Context.

## Reference
- `.github/lessons-learned.md` — captured development lessons (check before starting similar work)
- `docs/architecture/webxr-architecture.md` — architecture decisions
- `docs/architecture/design-philosophy.md` — design philosophy
- `docs/archive/readme-guidelines.md` — README guidelines (archived)
- `.github/terraform-progress.md` — infrastructure progress
- `client/CLAUDE.md` — client-specific context (TypeScript, testing, UI patterns)
