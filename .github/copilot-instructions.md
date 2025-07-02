# Copilot Instructions for Steam Brick and Mortar Project

## Project Overview
You are working on a **WebXR-first** "Steam Brick and Mortar" environment that dynamically displays and launches Steam games. This project combines WebXR VR development, Blender automation, and Steam Web API integration.

## Architecture & Technologies
- **WebXR + Three.js**: Cross-platform VR environment (primary architecture)
- **Blender CLI**: Automated 3D model generation via Python scripts
- **Steam Web API**: Game library integration via serverless proxy
- **AWS Lambda**: Serverless Steam API proxy with Terraform infrastructure
- **Docker**: Containerized development environment

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
- **Test locally first**: Validate all functionality before deploying
- **Incremental commits**: Each working phase gets its own commit
- **Document what was tested**: Distinguish between implemented vs validated

### 🔧 **Tool Usage**
- **Use `scripts/scratch.sh`** for complex multi-command operations
- **Follow technology-specific guidelines** (see `.github/javascript-guidelines.md`, etc.)
- **Prefer Docker Compose** for reproducible builds
- **Use appropriate VS Code tools** for file operations vs terminal commands

### ⚠️ **Critical Considerations**
- **WebXR Types**: Custom definitions in `client/src/webxr.d.ts` require expert review
- **VR Safety**: Incorrect spatial/timing assumptions can cause physical discomfort
- **Secrets Management**: Use environment variables locally, AWS Secrets Manager in production

## Workflow Guidelines

### Git Strategy
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

## Current Status
See `.github/terraform-progress.md` for detailed infrastructure development progress.

## Reference Files
- **JavaScript/Node.js**: `.github/javascript-guidelines.md`
- **README Guidelines**: `docs/readme-guidelines.md`
- **Architecture Decisions**: `docs/webxr-architecture.md`
- **Infrastructure Progress**: `.github/terraform-progress.md`