# Copilot Instructions for Steam Brick and Mortar Project

## Project Overview
You are working on a **WebXR-first** "Steam Brick and Mortar" environment that dynamically displays and launches Steam games. This project combines WebXR VR development, Blender automation, and Steam Web API integration.

## Key Technologies & Context
- **WebXR + Three.js**: Cross-platform VR environment (primary architecture)
- **Blender CLI**: Automated 3D model generation via Python scripts
- **Steam Web API**: For fetching user's game library (via CORS proxy)
- **Node.js**: External tools and CORS proxy service
- **Docker**: Containerized development environment for all tools
- **Progressive Enhancement**: Web-first PWA → Electron desktop apps

## Project Structure
```
steam-brick-and-mortar/
├── blender/               # Blender scripts for procedural 3D assets
├── client/                # TypeScript WebXR application (Vite + Three.js)
├── external-tool/         # Node.js tools (CORS proxy, Steam API)
├── docker/               # Docker development containers
├── prompts/              # Task management and current context
├── docs/                 # Architecture decisions and research
├── docker-compose.yml    # Multi-service development setup
└── README.md
```

## Core Workflow (WebXR Architecture)
1. **WebXR app** runs in browser with VR session management
2. **CORS proxy** (Node.js) provides Steam Web API access
3. **Three.js** loads Blender-generated GLTF shelf models
4. **Steam API** fetches user's game library and artwork
5. **WebXR interactions** trigger direct Steam protocol URLs (`steam://run/<appid>`)
6. **Progressive enhancement** via Electron for desktop integration

## Key Components to Implement

### TypeScript WebXR Application (`client/`)
- **Technology Stack**: TypeScript + Vite + Three.js + Vitest
- **Entry Points**: `index.html`, `src/main.ts`
- **Build System**: `yarn serve` (dev), `yarn build` (production), `yarn test`
- **WebXR Integration**: Custom type definitions (see WebXR Types Risk below)
- **Progressive Enhancement**: Works without VR hardware (desktop 3D mode)

### External Tools (`external-tool/`)
- `cors-proxy.js`: Steam Web API CORS proxy service
- `steam-protocol-test.js`: Steam protocol URL testing utilities
- Dependencies: Managed via **Yarn PnP** (Plug'n'Play) for performance
- Containerized via `docker/Dockerfile.nodejs`

### Blender Automation (`blender/`)
- `gen_shelf_modular.py`: CLI script for procedural shelf generation
- Creates: shelf (cube), brackets (triangular prisms), backing (plane/pegboard), crown (cylindrical ovoid)
- Exports: GLTF and FBX for WebXR and fallback compatibility  
- Usage: `docker compose run blender blender --background --python blender/gen_shelf_modular.py`
- Containerized via `docker/Dockerfile.python`

## Development Guidelines

### ⚠️ **CRITICAL: Testing and Validation Requirements**
**NOTHING IS COMPLETE UNTIL IT'S BEEN TESTED AND VALIDATED**

1. **Always test implementations** before marking tasks complete
2. **Run builds** to verify TypeScript compilation
3. **Execute scripts** to ensure they work as expected  
4. **Test in target environments** (browsers, VR headsets, etc.)
5. **Document what was actually tested** vs. what was only implemented
6. **Mark tasks as "implemented but not tested" until validation is complete**

### ⚠️ **CRITICAL: WebXR Types Risk - REQUIRES REVIEW**
**CUSTOM WEBXR TYPE DEFINITIONS ARE A DELIBERATE TECHNICAL DEBT**

- **Location**: `client/src/webxr.d.ts`
- **Risk Level**: HIGH - Incorrect WebXR types could cause **physical discomfort** for VR users
- **Decision**: Using custom types instead of @types/webxr or official definitions
- **Rationale**: Faster development iteration, official types may be outdated
- **Required Action**: **EXPLICIT REVIEW REQUIRED** after basic functionality works
- **Alternative**: Find reliable fork with updates or contribute to official types
- **Impact**: Vision-replacing VR environments require 100% correct spatial/timing assumptions

**WebXR Custom Types Status**:
- ✅ Implemented basic WebXR interface definitions
- ❌ **NOT TESTED** against real WebXR implementations
- ❌ **NOT VALIDATED** for VR safety and comfort
- 🚨 **REQUIRES EXPERT REVIEW** before production use

### When working on this project:
1. **Research APIs thoroughly**: SteamVR VScript API, Blender bpy module
2. **Focus on automation**: Everything should work via CLI/scripts
3. **Prefer Docker Compose**: Use `docker compose run <service>` for reproducible builds
4. **Handle file I/O carefully**: VScript limitations, cross-platform paths
5. **Consider VR UX**: Intuitive interactions, proper scaling, 3D audio
6. **Error handling**: Steam API failures, missing assets, VR disconnection

### Code Style:
- **JavaScript/Node.js**: Modern ES6+, async/await patterns, **Yarn PnP** package manager (NO npm)
- **WebXR/Three.js**: ES6 modules, clean component architecture, WebGL best practices
- **Python/Blender**: PEP 8, comprehensive docstrings for bpy operations
- **Docker**: Multi-stage builds, non-root users, layer optimization
- **All files**: Include setup/usage instructions in comments

### Git Workflow & Commit Strategy:
- **Create legible commit chunks** - group related changes together
- **Meaningful commit messages** - describe what and why, not just what changed
- **Separate concerns** - don't mix feature implementation with documentation updates
- **Use scratchpad for multi-command operations** - create `scripts/scratch.sh` for complex terminal sequences
- **Review git status before committing** - understand what's being staged

### Terminal & Script Management:
- **Use `scripts/scratch.sh` for multi-command operations** instead of multiple run_in_terminal calls
- **Add scratch.sh to .gitignore** - it's a temporary development tool
- **Make scripts executable** with `chmod +x` where needed
- **Use absolute paths in scripts** to avoid directory confusion

### Project Naming Convention:
- **Official Project Name**: "Steam Brick and Mortar" 
- **Context**: VR game launcher with physical "brick and mortar" video store aesthetic
- **Legacy References**: Historical references to "Blockbuster Shelf" have been updated to "Steam Brick and Mortar"
- **Keep "Shelf" terminology** - the physical shelf metaphor is core to the UX

### Package Management:
- **ALWAYS use Yarn PnP** for Node.js projects - it's much more performant than npm
- **Use `.yarnrc.yml`** with `nodeLinker: pnp` for Plug'n'Play mode
- **Never use npm install** - always use `yarn install` or `yarn add <package>`
- **Commit `.pnp.cjs` and `.yarn/`** directories for reproducible builds
- **Trust the established package manager** - if yarn.lock exists, use Yarn; if package-lock.json exists, use npm

### Testing Approach:
- Test each component independently in Docker containers
- Mock Steam API responses during development
- Verify Blender exports work in WebXR browsers (Chrome, Firefox, Quest)
- Test VR interactions with proper hardware setup
- Use `docker compose run build` for integrated testing

## Prerequisites
- Blender 4.x (or use Docker container)
- WebXR-compatible browser (Chrome, Firefox, Safari)
- Docker & Docker Compose (recommended)
- VS Code with WebXR/Three.js extensions
- **Yarn** (not npm) for Node.js package management
- Python 3.x (or use Docker container)
- Steam account with owned games for testing

## README Writing Guidelines

See `docs/readme-guidelines.md` for comprehensive README structure and tone guidelines.