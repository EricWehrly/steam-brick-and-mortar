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

## Current Task: Milestone 3 - WebXR Foundation

### Current Status: 🔥 **WebXR HTML/JavaScript Foundation - IMMEDIATE FOCUS**

**Context**: We're implementing WebXR from the ground up with a progressive approach:
1. **HTML page with WebXR capability** (current priority)
2. **Three.js integration with basic 3D scene**
3. **Load and display our Blender shelf model**
4. **Add camera controls and movement**
5. **Enable VR mode and controller interaction**
6. **Later**: Steam integration after we have a working 3D environment

**Architecture Reference**: See `docs/webxr-architecture.md` for technical details
**Research Status**: Complete (archived in `docs/research-archive.md`)

### Immediate Priority Tasks

#### Task 3.1.1.1: ⭐ **CURRENT PRIORITY** - Create basic HTML page with WebXR capability
**Status**: 🚧 **READY TO START**
**Description**: Create foundational WebXR HTML page that can detect VR capability and enter/exit VR sessions
**Directory**: `webxr-app/` 
**Expected deliverable**: 
- `webxr-app/index.html` - Basic HTML page with WebXR setup
- `webxr-app/main.js` - JavaScript with WebXR session management
- Can test WebXR capability in browser, enter/exit VR mode
- Works on both desktop browsers and Quest Browser

**Progressive Implementation Plan**:
1. Basic HTML with WebXR session detection
2. Enter/Exit VR button functionality
3. Basic console logging for WebXR events
4. Test on Chrome desktop and Quest Browser

#### Task 3.1.1.2: ⭐ **NEXT** - Add Three.js integration with basic 3D scene
**Status**: 📋 **WAITING**
**Description**: Integrate Three.js for 3D rendering with a simple test scene
**Expected deliverable**: 
- Three.js scene with basic cube geometry
- Camera controls for desktop testing
- WebGL canvas rendering properly
- Foundation for importing Blender models

#### Task 3.1.1.3: ⭐ **FOLLOWING** - Test WebXR session management (enter/exit VR)
**Status**: 📋 **WAITING**
**Description**: Ensure VR session lifecycle works correctly across platforms
**Expected deliverable**: Smooth VR mode transitions, proper session cleanup

#### Task 3.1.1.4: ⭐ **THEN** - Add basic cube geometry for testing
**Status**: 📋 **WAITING**
**Description**: Simple 3D object to test rendering and interaction
**Expected deliverable**: Visible 3D cube that can be viewed in both desktop and VR modes

#### Task 3.1.2.1: **NEXT PHASE** - Import and display Blender-generated shelf model (GLTF)
**Status**: 📋 **WAITING**
**Description**: Load and display our procedurally generated shelf in the VR scene
**Expected deliverable**: Blender shelf models visible and positioned correctly in WebXR

### Next High-Priority Tasks (After WebXR Foundation)

#### Steam Integration Phase (Milestone 4)
**Task 4.1.1.1-4.1.1.4: CORS Proxy Service**
**Status**: 📋 **RESEARCH PHASE**
**Description**: Create lightweight Docker container for Steam Web API access
**Goal**: Enable browser-based Steam library fetching without CORS issues

#### Asset Integration Phase (Milestone 3.2)
**Task 3.1.2.2-3.1.2.4: Camera, Movement, and Lighting**
**Status**: 📋 **WAITING**
**Description**: Complete 3D scene foundation before adding VR interactions

### Current Focus Strategy

**PHASE 1: WebXR Foundation (Current)**
1. HTML page with WebXR capability detection ⭐ **NOW**
2. Three.js integration with basic 3D scene
3. Test VR session management (enter/exit)
4. Display simple geometry (cube) for testing

**PHASE 2: Asset Integration**
1. Load Blender GLTF shelf models
2. Implement camera controls and movement
3. Configure lighting system
4. Test across desktop and VR browsers

**PHASE 3: VR Interaction**
1. Enable WebXR controller input
2. Add hand tracking and raycasting
3. Implement grab/touch interactions
4. Optimize for VR performance (90fps)

**PHASE 4: Steam Integration** 
1. Create CORS proxy service
2. Fetch Steam library data
3. Generate game objects from library
4. Implement game launching

**Rationale**: Progressive implementation allows testing at each stage. WebXR foundation must be solid before adding Steam complexity.

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
- `webxr-app/`: **NEW** - WebXR application directory (to be created)
- `docs/webxr-architecture.md`: **NEW** - Technical architecture decisions
- `docs/research-archive.md`: **NEW** - Completed research findings

### Architecture Decision Context
**Final Decision**: WebXR-first with progressive enhancement (see `docs/webxr-architecture.md`)

**Progressive Enhancement Strategy**:
1. **Phase 1**: WebXR PWA hosted with HTTPS (immediate VR headset access)
2. **Phase 2**: Electron desktop apps for Windows/Mac/Linux (direct Steam launching)  
3. **Phase 3**: VR headset optimization and app store distribution

### Current Technical Priorities
1. **WebXR Foundation**: HTML page, Three.js integration, VR session management
2. **Asset Pipeline**: Integrate Blender GLTF output with Three.js WebXR scene
3. **Cross-Platform Testing**: Ensure WebXR works on Quest Browser, desktop VR
4. **Steam Integration**: CORS proxy service and browser-based game launching (later phase)

---

## Task Completion Checklist

When completing tasks, update both files:

### This Prompt File Updates
- [ ] Mark completed tasks with ✅
- [ ] Update current task to next priority
- [ ] Add any new findings to "Background Information"
- [ ] Update phase status and next steps

### Roadmap Updates (`docs/roadmap.md`)
- [ ] Mark completed tasks with ✅ 
- [ ] Update story/milestone status if fully completed
- [ ] Note any architecture discoveries or pivots
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
