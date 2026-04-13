
random unsorted idea:

- (this should actually be easy:)
  rotate shelves alternatingly to make it easier to weave between them
  Angle them at like 15 degrees, and make the opening between them 30 degrees, to make it easier to navigate in
  (can probably do it by) Rotate every other shelf negative rather than positive
- did we already mention somewhere we wanted the ability to add a little smoke to the atmosphere?
- light switch with settings for "dingy", "classy", "corporate"
- (separate) dimmer
- additional (hidden) switches for flat / doom-style lighting
maybe also quake 
- potential support for user-defined css that drives colors used in scene
- it would be cool to support movie-theater lit walkways
- and tron-like lights along the shelf edges
- pixellate obscuring shader
at distance
dynamic to attempt to maintain framerate
- At some point, I'd like to support a "Museum" mode,
  where you can build out your own game museum to share (via url code) with your friends
  You can group games however you like, say what you want about them, and showcase videos or screenshots

# Steam Brick and Mortar - Roadmap Overview

## Documentation Hierarchy

**This document**: High-level roadmap overview and current status  
**Detailed phase documents**: Complete task breakdowns and implementation details
- [`roadmap-phase1-ready-for-me.md`](../roadmap-phase1-ready-for-me.md) - Detailed Phase 1 milestones and tasks
- [`roadmap-phase2-ready-for-friends.md`](../roadmap-phase2-ready-for-friends.md) - Detailed Phase 2 milestones and tasks  
- [`roadmap-phase3-ready-for-everyone.md`](../roadmap-phase3-ready-for-everyone.md) - Detailed Phase 3 milestones and tasks

## Project Overview

**Current Architecture**: WebXR-first with progressive enhancement (see `docs/webxr-architecture.md`)  
**Research Status**: Complete (archived in `docs/research-archive.md`)  
**Current Phase**: Level layout and spatial design  
**Current Task**: Milestone 6 - Level Layout and Spatial Design

## Three-Phase Development Strategy

### **Phase 1: "Ready for Me"** 🚧 **CURRENT FOCUS**
*Goal: Demonstrate all imagined functionality with competency - personal demo-ready*

**Scope**: Complete through Milestone 6 (Level Layout)
- ✅ Foundation & Development Environment (Milestone 1)
- ✅ 3D Asset Generation (Milestone 2) 
- ✅ 3D Scene Foundation (Milestone 3)
- ✅ Steam API Research & Integration (Milestone 4)
- ✅ Game Art & Visual Integration (Milestone 5) - **COMPLETED**
- ✅ **Pause Menu & UI Consolidation** - **COMPLETED**
- 🔄 **Level Layout and Spatial Design (Milestone 6)** - **CURRENT TASK**

**Major Achievements**:
- Complete IndexedDB image caching system with 24-hour expiration
- Progressive artwork loading integrated with Steam game processing
- Cache management UI with quota monitoring and controls
- Robust error handling and fallback mechanisms
- Comprehensive test suite covering all caching functionality
- Full pause menu system with 5 functional panels and 183 passing tests

**Acceptable Limitations**:
- Small library demos (5-20 games) acceptable
- Rate limiting acceptable for single-user testing
- Basic error handling sufficient

**See**: [`docs/roadmap-phase1-ready-for-me.md`](./roadmap-phase1-ready-for-me.md)

---

### **Phase 2: "Ready for Friends"** 🔮 **POST-GRAPHICS**
*Goal: Works for people standing next to you during conversation*

**Scope**: Infrastructure hardening and multi-user capability
- Robust rate limiting and error handling for Steam API constraints
- Infrastructure hardening for 20 req/min per IP limits  
- Caching strategy implementation to handle 800+ game libraries
- Multi-user testing capability
- Input Systems and User Controls (Milestone 7)
  - Enhanced camera controls with configurable roll system
  - Movement acceleration and speed customization
  - Camera reset and player positioning features
- User Experience Options (Milestone 8)

**Key Requirements**:
- Handle 800+ game libraries efficiently (120+ minute loading without caching)
- AWS Lambda IP pool analysis and mitigation
- Comprehensive caching infrastructure (browser + cloud)
- Error recovery and graceful degradation

**See**: [`docs/roadmap-phase2-ready-for-friends.md`](./roadmap-phase2-ready-for-friends.md)

---

### **Phase 3: "Ready for Everyone"** 🔮 **PRE-PUBLIC**  
*Goal: Public release readiness with compliance and scalability*

**Scope**: Compliance, legal, and production scalability
- Privacy policy and Steam API compliance research
- Production-grade infrastructure scaling
- Public traffic handling and abuse mitigation
- Legal compliance and user data handling

**Key Requirements**:
- Steam API terms of service compliance
- Privacy policy creation and user consent flows
- Production infrastructure scaling
- Public traffic abuse mitigation

**See**: [`docs/roadmap-phase3-ready-for-everyone.md`](./roadmap-phase3-ready-for-everyone.md)

---

## Task Management

**Current Task Prompt**: See `prompts/current-task.prompt.md` for detailed context on what to work on next.

**Task Completion Workflow**:
1. Read `prompts/current-task.prompt.md` for current context and priorities
2. Complete the specified task with testing and validation
3. Update both `prompts/current-task.prompt.md` and the appropriate phase roadmap file with ✅ completion markers
4. Update the current task prompt with the next priority task
5. Commit changes with clear description of what was accomplished

**Progress Tracking**: 
- **Tasks**: Smallest unit of work that can be committed without breaking the build
- **Stories**: Smallest grouping of acceptance criteria intended to ship together
- **Milestones**: User-noticeable functionality groupings

**Roadmap Order = Working Priority**: For our two-person team, the order in each phase roadmap reflects the actual working priority. No additional priority labels needed.

## Current Status

**Active Phase**: Act 1 → Intermission (Technical Stewardship)
**Active Branch**: `openclaw/feat-neon-ui-intermission`
**Current Act Doc**: `docs/acts/intermission-technical-stewardship.md`
**Current Milestone**: Milestone 6 complete (core implementation done)
**Next**: Intermission tasks per `intermission-before-phase2.md`, then Phase 2

**Recent Completions (since last update)**:
- ✅ Event-driven shelf spawning (ShelfReady → GameBoxSpawner)
- ✅ ShelfLayoutCoordinator extracted from GpuStorePropsRenderer
- ✅ GameSorter + GameSortFunctions (composable sort pipeline)
- ✅ CategoryAssigner + CategoryAisleOffset (genre → aisle mapping)
- ✅ InstancedShelfRenderer + ShelfGeometryBuilder (GPU-instanced shelves)
- ✅ SignageRenderer + SceneSignManager (end-cap and ceiling signs)
- ✅ ProceduralTextureWorker → ManagedWorker (WebWorker texture generation)
- ✅ LOD artwork system (LodArtworkOrchestrator, HighTextureCache, pixel-cache worker)
- ✅ Lint pass 1 + 2 (explicit-any, unused-vars, no-case-declarations)

**Phase 1 Completion**: ~95% — all core systems implemented. See `phase1-ready-for-me.md` for slim remaining-work list.
