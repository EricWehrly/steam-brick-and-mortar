# Current Task Prompt - Steam Brick and Mortar

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

### Current Status: 🔥 **WebXR BROWSER TESTING - IMMEDIATE FOCUS**

**Context**: Build system is now **TESTED AND WORKING**! All scripts compile and tests pass. Next critical step is testing the actual WebXR functionality in browsers.

**Completed & Tested ✅**:
- TypeScript build system ✅ **TESTED** (`yarn build` compiles successfully)
- Unit testing framework ✅ **TESTED** (7/7 tests pass with `yarn test:run`)
- Fixed rootDir TypeScript configuration ✅ **TESTED**
- Vite development/build pipeline ✅ **TESTED**

**Implemented but NOT Browser Tested ❌**:
- HTML page with WebXR capability detection 🔄 **NEEDS BROWSER TESTING**
- Three.js integration with test cube geometry 🔄 **NEEDS BROWSER TESTING**
- Desktop mouse/keyboard controls (WASD movement, mouse look) 🔄 **NEEDS BROWSER TESTING**
- Basic lighting system and scene setup 🔄 **NEEDS BROWSER TESTING**
- WebXR session management (Enter/Exit VR buttons) 🔄 **NEEDS BROWSER TESTING**

**⚠️ CRITICAL RISK**: Custom WebXR type definitions require expert review for VR safety

**Architecture Reference**: See `docs/webxr-architecture.md` for technical details
**Research Status**: Complete (archived in `docs/research-archive.md`)

### Immediate Priority Tasks

#### Task 3.1.1.3: ⭐ **CURRENT PRIORITY** - Test WebXR functionality in browser
**Status**: 🚧 **READY TO START**
**Description**: Launch the development server and validate WebXR scene works in browser
**Directory**: `client/` 
**Expected deliverable**: 
- Run `yarn serve` and verify page loads at localhost:3000
- Confirm 3D scene with rotating green cube displays
- Test desktop controls (WASD movement, mouse look)
- Verify WebXR button shows appropriate state ("VR Not Available" on desktop)
- Test on Chrome desktop (should work), Firefox (may have issues)
- Console shows proper initialization messages

**Critical Testing Steps**:
1. `yarn serve` - development server starts without errors
2. Browser shows 3D scene with rotating cube
3. WASD keys move camera, mouse controls look direction
4. WebXR button appears with correct state
5. Console logs show successful initialization
6. No JavaScript errors in browser console
**Status**: 🚧 **READY TO START**
**Description**: Test that the build system actually works and fix any TypeScript compilation errors
**Directory**: `client/` 
**Expected deliverable**: 
- `yarn install` completes successfully
- `yarn build` compiles without errors
- `yarn serve` starts development server
- `yarn test` runs tests successfully
- Fix any TypeScript rootDir errors or other compilation issues

**Testing Steps**:
1. Navigate to `client/` directory
2. Run `yarn install` (first time setup)
3. Run `yarn build` and fix any compilation errors
4. Run `yarn serve` and verify it opens in browser
5. Run `yarn test` and verify tests pass
6. Document any issues found and their resolutions

#### Task 3.1.1.3: ⭐ **NEXT** - Test WebXR session management in browsers
**Status**: 📋 **WAITING FOR BUILD VALIDATION**
**Description**: Once build works, test WebXR functionality across different browsers
**Expected deliverable**: 
- WebXR session lifecycle works on Chrome desktop
- Proper error handling for unsupported browsers
- Console logging shows proper WebXR state transitions

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
