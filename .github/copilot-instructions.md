# Copilot Instructions for Steam Brick and Mortar Project

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

### 🎭 **Event-Driven Architecture Pattern**
- **Zero Cross-Class Dependencies**: Classes communicate exclusively through typed events
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
- The active roadmap is now tracked in `docs/active/roadmap.md` (single source of truth for priorities and next steps).

### Roadmap Navigation & Management
When working with roadmap items, follow this structure and workflow:

**📁 Roadmap File Organization**:
- `docs/active/roadmap.md` - High-level overview and current status
- `docs/roadmap-phase1-ready-for-me.md` - Detailed Phase 1 tasks and milestones
- `docs/roadmap-phase2-ready-for-friends.md` - Detailed Phase 2 infrastructure and features  
- `docs/roadmap-phase3-ready-for-everyone.md` - Detailed Phase 3 compliance and scaling
- `docs/active/tech-debt.md` - Technical debt backlog with priority management

**🎯 Adding New Features**:
1. **Determine Phase**: Phase 1 (core functionality) → Phase 2 (infrastructure) → Phase 3 (compliance)
2. **Choose Section**: High-priority infrastructure → Main features, Enhancement features → "TBD" section, Technical improvements → tech-debt.md
3. **Use Standard Format**: Include Context, Tasks, Expected Deliverable, Acceptance, Priority, Timeline
4. **Deferring**: Place in "TBD" with Deferral Reason, Dependencies, and Context

**📍 Finding Current Work**: Check `docs/active/roadmap.md` for 🚧 CURRENT FOCUS markers and `docs/active/tech-debt.md` for immediate tasks

**✅ Completion**: Move to "Archived/Completed" in tech-debt.md with achievement details

## Reference Files
- **JavaScript/Node.js**: `.github/javascript-guidelines.md`
- **README Guidelines**: `docs/readme-guidelines.md`
- **Architecture Decisions**: `docs/webxr-architecture.md`
- **Infrastructure Progress**: `.github/terraform-progress.md`