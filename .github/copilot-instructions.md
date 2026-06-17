# Copilot Instructions for Steam Brick and Mortar Project

** COULD NOT BE MORE IMPORTANT **
** NEVER EVER EVER EVER USE `npx`. THE PROJECT USES `yarn` AND NPX USES A COMPLETELY DIFFERENT SET OF RESOURCES AND WILL BREAK OUR BUILD **

## Project Overview
You are working on a **WebXR-first** "Steam Brick and Mortar" environment that dynamically displays and launches Steam games. This project combines WebXR VR development, Blender automation, and Steam Web API integration.

## Architecture & Technologies
- **WebXR + Three.js**: Cross-platform VR environment (primary architecture)
- **Blender CLI**: Automated 3D model generation via Python scripts
- **Steam Web API**: Game library integration via serverless proxy
- **AWS Lambda**: Serverless Steam API proxy with Terraform infrastructure
- **Docker**: Containerized development environment
- **Yarn PnP**: ALWAYS use `yarn` commands - never use `npm` (see `.github/javascript-guidelines.md`)

## Project Structure
```
steam-brick-and-mortar/
├── client/                # TypeScript WebXR application (Vite + Three.js)
├── external-tool/         # Node.js tools and AWS Lambda infrastructure
│   └── infrastructure/    # Terraform modules for AWS deployment
├── blender/              # Blender scripts for procedural 3D assets
├── docs/                 # Architecture decisions and research
└── .github/              # Development guidelines and documentation
```

## Development Principles

### 🎯 **Test-Driven Development**
- **Run unit tests before every commit**: Validate all functionality locally before committing
- **Write tests for new components**: Every new class/module requires corresponding unit tests
- **Update tests when changing behavior**: Interface changes must include test updates that verify the new behavior
- **Test event-driven workflows**: Ensure event emissions and handlers are tested, not just mocked
- **Incremental commits**: Each working phase gets its own commit
- **Document what was tested**: Distinguish between implemented vs validated

### 🔧 **Tool Usage**
- **Use `scripts/scratch.sh`** for complex multi-command operations
- **ALWAYS use `yarn` not `npm` or `npx`**: This project uses Yarn PnP exclusively. The latter are not set up and will error. This is desired.
- **Follow technology-specific guidelines** (see `.github/javascript-guidelines.md`, etc.)
- **Prefer Docker Compose** for reproducible builds
- **Use appropriate VS Code tools** for file operations vs terminal commands
- **Read terminal output carefully**: Check exit codes and actual error messages, not just command failures
- **Don't chain failing commands**: If `cd client && yarn tsc` fails because you're already in client/, just run `yarn tsc`
- **Never try `npx` as fallback**: It's not configured and will never work in this Yarn PnP setup

### 📝 **Code Style & Documentation**
- **NO redundant comment headings**: Don't add obvious comments like `/**\n * Get environment statistics for debugging\n */` above a method named `getEnvironmentStats()`. The method name is self-explanatory.
- **Comments should add value**: Only add comments when they explain WHY something is done, not WHAT is being done (the code shows what)
- **Meaningful documentation**: Comments should provide context, gotchas, business logic, or non-obvious implementation details
- **Avoid comment noise**: If a comment doesn't make the code significantly clearer, don't add it
- **Event callback naming**: Avoid generic `handleX` names for event subscribers. Prefer intent-revealing names that describe the state transition or action (example: `stagePlacementRunFromSections` instead of `handleSectionsReady`).

### 🎨 **UI Development**
- **Use UIComponentUtils for form controls**: Declarative configs reduce boilerplate by 50-70%
- **Prefer .bind(this) for simple method calls**: Use arrow functions only when wrapping conditional logic
- **Pattern for event handlers**: `onClick: this.methodName.bind(this)` vs `onClick: () => { if (condition) this.method() }`
- **See**: `client/src/utils/UIComponentUtils.ts` for examples and patterns

### 🎭 **Event-Driven Architecture Pattern**
- **Zero Cross-Class Dependencies**: Classes communicate exclusively through typed events
- **No Direct Method Fallbacks**: In production runtime paths, do not replace event handoffs with direct calls between orchestrators and handlers (for example renderer → spawner). If ordering/race issues appear, solve with event contract changes, readiness events, or buffering/queueing at event boundaries.
- **Owner-Managed Subscriptions**: If a class owns buffered state or lifecycle-sensitive behavior, it should subscribe to the events that govern that state itself. Avoid pass-through control methods whose only job is to let another class tell the owner when to reset, clear, or react; treat that forwarding seam as a design smell unless there is a strong boundary reason.
- **Capability-Based Handler Selection**: 
  - Default handlers provide baseline functionality (e.g., Legacy renderers)
  - Feature-rich handlers register as replacements when system supports them (e.g., Instanced renderers with WebGL2)
  - Handlers self-check capabilities before registering
  - Automatic fallback to defaults when replacements fail
- **Readonly Event Data**: Events must exclusively emit readonly data to prevent mutation bugs
- **Event-Driven Async**: Use event listeners instead of awaiting async calls between classes
- **Handler Bootstrap**: Handlers instantiate themselves to get into execution path for self-registration

### ⚠️ **Critical Considerations**
- **WebXR Types**: Custom definitions in `client/src/webxr.d.ts` require expert review
- **VR Safety**: Incorrect spatial/timing assumptions can cause physical discomfort
- **Secrets Management**: Use environment variables locally, AWS Secrets Manager in production
- **Singleton Exceptions**: DataManager and EventManager remain singletons for now (migration TBD)

## Workflow Guidelines

### Git Strategy
- **Run unit tests before committing**: Ensure all tests pass before each commit
- **Meaningful commits**: Group related changes, describe what and why
- **Review git status** before committing to understand changes
- **Separate concerns**: Don't mix implementation with documentation
- **Stage only edited files**: Use `git add <file1> <file2>` for files you modified, never `git add -A` which stages unrelated changes

### Development Approach
1. **Research thoroughly**: Understand APIs and constraints before coding
2. **Focus on automation**: Everything should work via CLI/scripts  
3. **Handle errors gracefully**: Account for API failures, missing assets, etc.
4. **Consider VR UX**: Intuitive interactions, proper scaling, 3D audio

### Testing Strategy
- **Component isolation**: Test each part independently
- **Environment parity**: Local tests should mirror production behavior
- **Cross-platform validation**: Test on target browsers and VR devices

### Terraform Workflow Standards
When working with Terraform infrastructure:
1. **validate**: Run `terraform validate` to check syntax and configuration
2. **plan**: Run `terraform plan` to review proposed changes
3. **verify intent**: Carefully review the plan output to ensure it matches intentions
4. **apply**: Run `terraform apply` only after plan verification
5. **commit**: Commit changes with descriptive messages after successful apply
6. **Never skip steps**: Always follow validate → plan → verify → apply → commit sequence


## Current Status & Roadmap
- Start at **`docs/README.md`** — the docs entry point and map. The planning layer is organized as **acts** (phases) in `docs/acts/`, with one doc per feature in `docs/features/`.

### Roadmap Navigation & Management
When working with roadmap items, follow this structure and workflow:

**📁 Roadmap File Organization**:
- `docs/README.md` - Docs entry point and directory guide (start here)
- `docs/acts/` - Primary planning layer: `act1-intermission-…`, `act2-ready-for-friends`, `act3-ready-for-everyone`, `act4-encore-someday-maybe`
- `docs/features/` - One doc per feature (status, acceptance criteria, stories/tasks)
- `docs/plans/` - Implementation/design plans, linked from their parent feature
- `docs/tech-debt.md` - Technical debt backlog, keyed by `// TD: <tag-id>` source comments

**🎯 Adding New Features**:
1. **Determine Act**: which act (`docs/acts/`) does the work belong to?
2. **Add/Update Feature Doc**: create or update `docs/features/<feature>.md` and link it from the act doc
3. **Use Standard Format**: Include Context, Tasks, Expected Deliverable, Acceptance, Priority, Timeline
4. **Build Plan**: add a `docs/plans/<feature>-plan.md` if the feature needs a how-to-build plan
5. **Deferring**: record Deferral Reason, Dependencies, and Context (Encore items live in `act4-encore-someday-maybe.md`)

**📍 Finding Current Work**: Check the act marked current in `docs/README.md`, and `docs/tech-debt.md` for tagged debt

**✅ Completion**: Mark the feature/act item complete in its doc; archived debt details live in `docs/tech-debt.md`

## Reference Files
- **JavaScript/Node.js**: `.github/javascript-guidelines.md`
- **README Guidelines**: `docs/archive/readme-guidelines.md` (archived)
- **Architecture Decisions**: `docs/architecture/webxr-architecture.md`
- **Infrastructure Progress**: `.github/terraform-progress.md`