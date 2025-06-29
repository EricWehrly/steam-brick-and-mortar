# Current Task Prompt - Steam VR Blockbuster Shelf

## General Task Workflow Instructions

### How to Approach Tasks
1. **Read this prompt file completely** to understand current context
2. **Review the roadmap** (`docs/roadmap.md`) for the bigger picture
3. **Focus on the specific current task** outlined below
4. **Work incrementally** - each task should be completable in one session
5. **Test as you go** - validate each change immediately
6. **Update both this prompt and the roadmap** when tasks are completed

### Development Guidelines
- **Use Docker containers** whenever possible for reproducible builds
- **CLI-first approach** - everything should work via command line
- **Cross-platform compatibility** - Windows primary, but consider others
- **Commit small, working changes** - don't break the build
- **Document what you learn** - update relevant docs as you discover things

### Technology Stack
- **WebXR + Three.js**: Core VR implementation (decided architecture)
- **Blender CLI**: Procedural 3D asset generation 
- **Node.js**: External tools and API integration
- **Docker**: Development environment containerization
- **Steam Web API**: Game library integration

---

## Current Task: Milestone 4 - WebXR Foundation (UI Priority)

### Current Status: 🔥 **WebXR UI Development - IMMEDIATE FOCUS**

**Context**: We're now focusing on the core WebXR user interface before any Steam integration. The external tool/proxy research can come later once we have a working 3D environment.

**Major Priority Shift**: 
- **Previous focus**: Steam protocol testing and Node.js external tools
- **New focus**: WebXR 3D scene with movement, camera, and shelf objects

### Immediate Priority Tasks

#### Task 4.1.1.1: ⭐ **CURRENT PRIORITY** - Create Three.js WebXR scene with VR session management
**Status**: 🚧 **READY TO START**
**Description**: Set up basic WebXR scene with VR session management, camera controls, and movement
**Expected deliverable**: Working HTML page that can enter/exit VR mode across browsers

#### Task 4.1.1.2: ⭐ **NEXT** - Implement WebXR controller input and hand tracking  
**Status**: 📋 **WAITING**
**Description**: Add VR controller detection and basic interaction capabilities
**Expected deliverable**: VR controllers/hands visible and responsive in 3D scene

#### Task 4.1.3.1: ⭐ **FOLLOWING** - Integrate GLTFLoader for Blender-generated models
**Status**: � **WAITING**
**Description**: Load and display our procedurally generated shelf in the VR scene
**Expected deliverable**: Blender shelf models visible and positioned correctly in WebXR

### Next High-Priority Tasks (After UI Foundation)

**Task 4.2.0.1-4.2.0.5: Steam Integration Research**
**Status**: � **RESEARCH PHASE**
**Description**: Research lightweight Docker container approaches for Steam API proxy
**Goal**: Determine minimal, performant way to handle Steam Web API CORS issues

### Current Focus Recommendation

**START WITH: WebXR UI Foundation**
1. Set up basic WebXR scene with Three.js
2. Test VR session management across browsers  
3. Add camera movement and basic interaction
4. Load Blender shelf models into the scene
5. THEN research Steam integration approaches

**Rationale**: UI-first approach allows rapid iteration and cross-browser testing. Steam integration is complex and can be optimized once we have a working 3D environment to integrate with.
- Task 4.1.1.2: Implement WebXR controller input and hand tracking  
- Task 4.1.1.3: Test VR session lifecycle (enter/exit VR mode)

**Rationale**: The Node.js/IPC tasks are now obsolete. We should pivot to building the WebXR core and then tackle Steam integration from the browser context.

---

## Background Information

### Completed Work
✅ **Milestone 1**: Project infrastructure and Docker setup
✅ **Milestone 2**: Blender procedural shelf generation (`blender/gen_shelf_modular.py`)
- Modular geometry generation (shelf, brackets, backing, crown)
- FBX and GLTF export pipeline 
- Material assignment system
- Docker containerized execution

### Key Files & Directories
- `blender/gen_shelf_modular.py`: Main Blender script for 3D asset generation
- `docker-compose.yml`: Multi-service development environment
- `steamvr-addon/`: Legacy SteamVR environment files (may be obsoleted)
- `external-tool/`: Node.js tools (may need WebXR refactoring)
- `docs/roadmap.md`: Comprehensive project roadmap and architecture decisions

### Architecture Decision Context
The project recently completed extensive research (see `docs/webxr-research-findings.md`) and decided on **WebXR-first with progressive enhancement**:

1. **Phase 1**: WebXR PWA hosted with HTTPS (immediate VR headset access)
2. **Phase 2**: Electron desktop apps for Windows/Mac/Linux (direct Steam launching)  
3. **Phase 3**: VR headset optimization and app store distribution

### Current Technical Challenges
1. **Steam Web API CORS**: Need proxy service for browser-based Steam API access
2. **Game Launching**: Browser security limitations for `steam://` protocol URLs
3. **Cross-Platform VR**: Ensure WebXR works on Meta Quest, SteamVR, etc.
4. **Asset Pipeline**: Integrate Blender GLTF output with Three.js WebXR scene

---

## Task Completion Checklist

When completing tasks, update both files:

### This Prompt File Updates
- [ ] Mark completed tasks with ✅
- [ ] Update "Current Focus Recommendation" section
- [ ] Add any new findings to "Background Information"
- [ ] Update priority task list

### Roadmap Updates (`docs/roadmap.md`)
- [ ] Mark completed tasks with ✅ 
- [ ] Update story/milestone status if fully completed
- [ ] Add any architecture notes or lessons learned
- [ ] Update the 🚧 indicators to reflect current work

### New Issues Discovered
If you discover new challenges or requirements:
- [ ] Add new tasks to appropriate roadmap sections
- [ ] Note any architecture implications
- [ ] Update this prompt with relevant context
- [ ] Consider if timeline estimates need adjustment

---

## Quick Command Reference

```bash
# Test Blender pipeline
docker compose run blender blender --background --python blender/gen_shelf_modular.py

# Start Node.js development environment  
docker compose run nodejs npm install

# Build and test all services
docker compose build
docker compose run --rm test

# Start development services
docker compose up -d
```

**Remember**: Focus on the current task, test incrementally, and update documentation as you learn!
