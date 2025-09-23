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

### 📝 **Logging Standards**
- **Use Logger system, NOT console.log**: Import `Logger` from `utils/Logger` and create contextual loggers
- **Create class-level loggers**: `private static readonly logger = Logger.withContext(ClassName.name)`
- **Use appropriate log levels**: `.debug()`, `.info()`, `.warn()`, `.error()` based on severity
- **Provide context**: Include relevant data and operation details in log messages
- **Never use raw console methods**: Avoid `console.log()`, `console.warn()`, `console.error()` in production code

### 🔧 **Tool Usage**
- **Use `scripts/scratch.sh`** for complex multi-command operations
- **ALWAYS use `yarn` not `npm`**: This project uses Yarn PnP exclusively
- **Follow technology-specific guidelines** (see `.github/javascript-guidelines.md`, etc.)
- **Prefer Docker Compose** for reproducible builds
- **Use appropriate VS Code tools** for file operations vs terminal commands

### ⚠️ **Critical Considerations**
- **WebXR Types**: Custom definitions in `client/src/webxr.d.ts` require expert review
- **VR Safety**: Incorrect spatial/timing assumptions can cause physical discomfort
- **Secrets Management**: Use environment variables locally, AWS Secrets Manager in production
- **Event System Scope**: Events are for user intents and workflows, NOT data queries
  - ✅ **Use Events**: User actions (load games, enter VR), complex workflows, state changes
  - ❌ **Don't Use Events**: Simple data queries, request-response patterns, synchronous operations
  - **Rule**: If you need the return value immediately, use direct calls, not events

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
- The active roadmap is now tracked in `docs/current-roadmap.md` (single source of truth for priorities and next steps).
- See `.github/terraform-progress.md` for detailed infrastructure development progress.

## Reference Files
- **JavaScript/Node.js**: `.github/javascript-guidelines.md`
- **README Guidelines**: `docs/readme-guidelines.md`
- **Architecture Decisions**: `docs/webxr-architecture.md`
- **Infrastructure Progress**: `.github/terraform-progress.md`