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

## Current Task: Milestone 3 - Steam API Integration (Priority Tasks)

### Current Status: ⚧ WebXR Transition in Progress

**Context**: The project has recently pivoted to a **WebXR-first architecture** (see roadmap for full rationale). This eliminates complex VScript+IPC communication in favor of direct browser-based Steam Web API integration.

**Major Architecture Change**: 
- **Old**: SteamVR Environment + VScript + File-based IPC + External Node.js tool
- **New**: WebXR PWA + Three.js + Direct Steam Web API + Optional Electron packaging

### Immediate Priority Tasks

Based on the roadmap's ⭐ **PRIORITY** markers, focus on these tasks in order:

#### Task 3.1.1.7: ⭐ **PRIORITY** - Test Steam protocol URL execution (`steam://run/440`)
**Status**: 🔥 **STILL CRITICAL** for WebXR approach
**Description**: Verify that browsers can launch Steam games via protocol URLs
**Expected deliverable**: Test script that validates `steam://run/<appid>` works across browsers

### Next High-Priority Tasks (WebXR Foundation)

Given the WebXR architecture decision, the **immediate next tasks** should be:

**Task 4.1.1.6: ⭐ **PRIORITY** - Test game launch timing and browser → Steam transition**
**Status**: 🔥 **CRITICAL** for WebXR approach
**WebXR Version**: Test browser → Steam game launching UX and transition experience

### Current Focus Recommendation

Given the WebXR architecture decision, the **immediate next task** should be:

**NEW PRIORITY: Begin WebXR Foundation (Milestone 4.1.1)**
- Task 4.1.1.1: Create Three.js WebXR scene with VR session management
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
