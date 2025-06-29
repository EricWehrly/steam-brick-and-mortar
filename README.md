# SteamVR Blockbuster Shelf

Recreate the nostalgic Blockbuster browsing experience in VR with your Steam library. Procedurally generates 3D shelves and creates an interactive WebXR environment where you can physically browse and launch your games.

## Quick Start

```bash
# 1. Run the setup script to check prerequisites
./scripts/setup.sh

# 2. Generate a shelf model (outputs to steamvr-addon/models/)
docker compose run blender blender --background --python blender/gen_shelf_modular.py

# 3. Test Steam protocol launching
cd external-tool && yarn test

# 4. Start browser-based development
yarn run test-browser
```

**Outputs**: 3D models in `steamvr-addon/models/` (GLTF format for WebXR, FBX for SteamVR compatibility)

---

## 🎯 Project Vision

Transform your Steam library into a virtual "Blockbuster" experience:
- **Procedurally generated shelves** with realistic wood textures and bracket supports
- **Dynamic game covers** fetched from Steam API and displayed as physical game boxes
- **WebXR VR interaction** - reach out and grab games to launch them
- **Cross-platform compatibility** - works on Meta Quest, SteamVR, and any WebXR browser
- **Nostalgic atmosphere** with appropriate lighting, sounds, and store ambiance

*Yes, this is totally a lark - but imagine walking through aisles of your games like the old days!* 📼

## Technologies

- **WebXR + Three.js** - Cross-platform VR runtime with WebGL rendering
- **Blender CLI** - Automated 3D model generation via Python scripts
- **Steam Web API** - Fetches your game library and metadata (via CORS proxy)
- **Yarn PnP** - High-performance Node.js package management
- **Docker** - Containerized development environment

## Current Status

**✅ Working**: Modular 3D shelf generation, Docker workflow, GLTF/FBX export, Steam protocol testing
**🔧 In Progress**: WebXR foundation, Steam protocol validation, browser compatibility testing  
**📋 Planned**: Three.js scene integration, VR interaction system, game library visualization

## Development Setup

### Prerequisites
**Run the setup script first**: `./scripts/setup.sh`

This will check for and help install:
- Node.js 18+ with Corepack and Yarn PnP
- Docker & Docker Compose (optional but recommended)
- Steam (for testing game launches)
- Git for version control

### Available Commands
```bash
# Generate shelf models (Blender + Docker)
docker compose run blender blender --background --python blender/gen_shelf_modular.py

# Steam protocol testing
cd external-tool
yarn test                      # Command-line Steam protocol tests
yarn run test-browser         # Browser-based interactive tests

# Development services  
docker compose up nodejs      # Start all development services
docker compose run blender    # Run Blender environment only
```

## Architecture

```
steam-brick-and-mortar/
├── blender/                    # 3D model generation
│   ├── geometry/              # Modular components (shelf, brackets, backing, crown)
│   └── gen_shelf_modular.py   # Main orchestration script
├── external-tool/             # Node.js Steam protocol testing and API integration
│   ├── steam-protocol-test.html  # Browser-based protocol testing
│   └── test-steam-protocol.js    # Command-line protocol testing
├── webxr-app/                 # WebXR VR application (planned)
├── prompts/                   # Task management and development context
├── steamvr-addon/             # Legacy SteamVR environment files (compatibility)
├── docker/                    # Development containers
└── docs/                      # Documentation and research
```

## Design Specifications

**Current Shelf Design**:
- Main Shelf: Gray wood-style, 2.0×0.6×0.1 units
- Backing: Dark beige pegboard, 2.2×1.5×0.02 units  
- Crown: Gray decorative molding, centered on backing
- Brackets: Gray triangular supports, positioned below shelf

**Colors**: Shelf/Crown/Brackets use gray tones, Backing uses darkish beige

## Core Workflow (WebXR Architecture)

1. **WebXR App** loads in VR-capable browser (Chrome, Firefox, Quest Browser)
2. **CORS Proxy** provides Steam Web API access from browser
3. **Steam Library** fetched and cached in browser storage
4. **Blender Models** loaded as GLTF into Three.js WebXR scene
5. **VR Interaction** via WebXR controllers to select and launch games
6. **Steam Protocol** launches games directly from browser (`steam://run/<appid>`)

## Future Vision

Recreate the tactile browsing experience of physical media:
- Walk through aisles of your games in any VR headset
- Pick up and examine game covers with hand tracking
- Discover forgotten games in your library  
- Share your virtual store via simple web links
- Customize shelf layouts and store themes
- Progressive Web App - no installation required

---

*Building the future of game library browsing, one shelf at a time.* 🎬🎮
