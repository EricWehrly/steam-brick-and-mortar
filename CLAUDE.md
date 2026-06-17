# Steam Brick and Mortar

## ⚠️ CRITICAL: Package Manager

**NEVER use `npx`. NEVER use `npm`.** This project uses **Yarn PnP exclusively**.

All commands: `yarn <command>`. `npx` is not configured — it silently uses different resources and will break the build. There is no scenario where trying `npx` as a fallback is correct.

## Project Overview

WebXR-first VR environment that dynamically displays and launches Steam games. Combines WebXR/Three.js, Blender CLI automation, and Steam Web API integration via AWS Lambda.

## Architecture

- **WebXR + Three.js** — cross-platform VR environment (primary)
- **Blender CLI** — procedural 3D asset generation via Python scripts
- **Steam Web API** — game library via serverless proxy
- **AWS Lambda + Terraform** — serverless infrastructure
- **Docker** — containerized dev environment
- **Yarn PnP** — package management (see above)

```
steam-brick-and-mortar/
├── client/             # TypeScript WebXR app (Vite + Three.js)
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
- **Owner-managed subscriptions**: A class that owns buffered or lifecycle-sensitive state subscribes to the events governing that state itself. Pass-through control methods (whose only job is letting another class trigger a reset or clear) are a design smell.
- **Capability-based handler selection**: Default handlers provide baseline functionality. Feature-rich handlers self-register when capabilities are available and fall back gracefully when they're not.
- **Readonly event data**: Events emit only readonly data — no mutation.
- **Event-driven async**: Use event listeners, not `await` across class boundaries.
- **Handler bootstrap**: Handlers instantiate themselves to enter the execution path for self-registration.
- **Intent-revealing handler names**: `stagePlacementRunFromSections`, not `handleSectionsReady`.

**Known exceptions**: `DataManager` and `EventManager` remain singletons (migration TBD).

## Development

### Tooling
- Use `scripts/scratch.sh` for complex multi-step operations
- Prefer Docker Compose for reproducible builds
- **Check your working directory before running commands.** Most terminal errors in this project trace back to being in the wrong directory. Read the error before assuming the command is broken.
- Don't chain failing commands: if `cd client && yarn tsc` fails because you're already in `client/`, just run `yarn tsc`

### TDD
- Run unit tests before every commit
- Every new class/module gets unit tests
- Test event emissions and handlers — not just that they were mocked
- Incremental commits: each working phase is its own commit

### Git
- Stage only files you modified: `git add <file1> <file2>` — never `git add -A`
- Meaningful commits: group related changes, describe what and why
- Don't mix implementation with documentation in the same commit

### Terraform
Always follow in order — never skip:
1. `terraform validate`
2. `terraform plan`
3. Review the plan output carefully
4. `terraform apply`
5. Commit with a descriptive message

### Critical Considerations
- `client/src/webxr.d.ts` has custom WebXR type definitions — changes require careful review
- VR safety: incorrect spatial or timing assumptions can cause physical discomfort
- Secrets: `.env` files locally, AWS Secrets Manager in production — never commit keys

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
