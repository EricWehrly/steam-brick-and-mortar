# Copilot Instructions for SteamVR Blockbuster Shelf Project

## Project Overview
You are working on a SteamVR "Blockbuster shelf" environment that dynamically displays and launches Steam games. This project combines VR development, Blender automation, and Steam API integration.

## Key Technologies & Context
- **SteamVR Home**: VR environment with custom scripting capabilities
- **Blender CLI**: Automated 3D model generation via Python scripts
- **Steam Web API**: For fetching user's game library
- **VScript (Lua)**: SteamVR's scripting language for interactive elements
- **Node.js/Python**: External tools for API integration and file watching

## Project Structure
```
steamvr-blockbuster/
├── blender/               # Blender scripts and .blend prototypes
├── steamvr-addon/         # Environment addon (Hammer assets)
│   ├── models/
│   ├── materials/
│   ├── sounds/
│   ├── panorama/
│   └── scripts/vscripts/
│       └── map_scripts/
├── external-tool/         # Node.js / Python daemon
│   ├── fetch_library.js
│   └── watcher.js
└── README.md
```

## Core Workflow
1. **External tool** fetches Steam library via Steam Web API
2. **Downloads** game icons/assets to `steamvr-addon/art/`
3. **Generates** JSON manifest with game data
4. **Blender script** procedurally creates shelf models (CLI mode)
5. **VScript** reads JSON, spawns interactive game props in VR
6. **Watcher daemon** monitors for launch signals and opens games

## Key Components to Implement

### External Tools (`external-tool/`)
- `fetch_library.js`: Steam Web API integration (GetOwnedGames)
- `watcher.js`: File system monitoring for launch signals
- Dependencies: `node-fetch`, `chokidar`, `steamapi`

### Blender Automation (`blender/`)
- `gen_shelf.py`: CLI script for procedural shelf generation
- Creates: shelf (cube), brackets (triangular prisms), backing (plane/pegboard), crown (cylindrical ovoid)
- Exports: FBX or Source engine compatible assets
- Usage: `blender --background --python blender/gen_shelf.py`

### VR Environment (`steamvr-addon/`)
- `populate.lua`: VScript for dynamic prop creation
- Reads JSON manifest, spawns `prop_physics` entities
- Sets up interaction hooks for game launching
- Integrates 3D audio via `.vsndevts` files

## Development Guidelines

### When working on this project:
1. **Research APIs thoroughly**: SteamVR VScript API, Blender bpy module
2. **Focus on automation**: Everything should work via CLI/scripts
3. **Handle file I/O carefully**: VScript limitations, cross-platform paths
4. **Consider VR UX**: Intuitive interactions, proper scaling, 3D audio
5. **Error handling**: Steam API failures, missing assets, VR disconnection

### Code Style:
- **JavaScript/Node.js**: Modern ES6+, async/await patterns
- **Python/Blender**: PEP 8, comprehensive docstrings for bpy operations
- **Lua/VScript**: Clear comments, robust error checking
- **All files**: Include setup/usage instructions in comments

### Testing Approach:
- Test each component independently
- Mock Steam API responses during development
- Verify Blender exports work in SteamVR Workshop Tools
- Test VR interactions with proper hardware setup

## Prerequisites
- Blender 4.x
- SteamVR Workshop Tools
- VS Code with Lua/VScript extensions
- Node.js and npm
- Python 3.x
- Steam account with owned games for testing