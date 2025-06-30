# Steam Brick and Mortar - WebXR Implementation Roadmap

## Project Overview

**Current Architecture**: WebXR-first with progressive enhancement (see `docs/webxr-architecture.md`)  
**Research Status**: Complete (archived in `docs/research-archive.md`)  
**Current Phase**: WebXR implementation and Steam integration  

## Task Management

**Current Task Prompt**: See `prompts/current-task.prompt.md` for detailed context on what to work on next.

**Task Completion Workflow**:
1. Read `prompts/current-task.prompt.md` for current context and priorities
2. Complete the specified task with testing and validation
3. Update both `prompts/current-task.prompt.md` and this roadmap file with ✅ completion markers
4. Update the current task prompt with the next priority task
5. Commit changes with clear description of what was accomplished

**Progress Tracking**: 
- **Tasks**: Smallest unit of work that can be committed without breaking the build
- **Stories**: Smallest grouping of acceptance criteria intended to ship together
- **Milestones**: User-noticeable functionality groupings

---

## Milestone 1: Foundation & Development Environment ✅
*Goal: Establish project structure and development toolchain*

### Feature 1.1: Project Infrastructure ✅
**Context**: Basic project setup, tooling, and development environment

#### Story 1.1.1: Project Scaffolding ✅
- **Task 1.1.1.1**: Create directory structure per project spec ✅
- **Task 1.1.1.2**: Initialize git repository with .gitignore ✅
- **Task 1.1.1.3**: Add README.md with setup instructions ✅
- **Task 1.1.1.4**: Create requirements.txt for Python dependencies ✅
- **Task 1.1.1.5**: Add docs/links.md with API references ✅
- **Task 1.1.1.6**: Add docs/readme-guidelines.md ✅
- **Task 1.1.1.7**: Add copilot instructions for project context ✅
- **Task 1.1.1.8**: Create prompts folder with current task management ✅

#### Story 1.1.2: Development Environment Setup ✅
- **Task 1.1.2.1**: Create minimal Docker setup for Blender CLI ✅
- **Task 1.1.2.2**: Configure docker-compose.yml for incremental development ✅
- **Task 1.1.2.3**: Test Blender containerized execution ✅

**Acceptance**: `docker compose run blender` launches Blender successfully ✅

---

## Milestone 2: 3D Asset Generation ✅
*Goal: Procedurally generate shelf models using Blender CLI*

### Feature 2.1: Modular Blender Pipeline ✅
**Context**: CLI-driven 3D model generation with clean modular architecture

#### Story 2.1.1: Shelf Geometry Generation ✅
- **Task 2.1.1.1**: Create main shelf (rectangular cube) mesh ✅
- **Task 2.1.1.2**: Generate bracket supports (triangular prisms) ✅
- **Task 2.1.1.3**: Create backing plane/pegboard geometry ✅
- **Task 2.1.1.4**: Add crown/topper (cylindrical ovoid) ✅
- **Task 2.1.1.5**: Refactor monolithic script into modular components ✅
- **Task 2.1.1.6**: Create geometry modules (shelf, brackets, backing, crown) ✅
- **Task 2.1.1.7**: Create utils module for scene management ✅

#### Story 2.1.2: Export Pipeline ✅
- **Task 2.1.2.1**: Configure FBX export settings ✅
- **Task 2.1.2.2**: Configure GLTF export settings ✅
- **Task 2.1.2.3**: Create material assignment system ✅
- **Task 2.1.2.4**: Test export pipeline in Docker ✅

#### Story 2.1.3: Design System ✅
- **Task 2.1.3.1**: Implement color scheme (gray shelf/brackets/crown, beige backing) ✅
- **Task 2.1.3.2**: Position crown centered on backing ✅
- **Task 2.1.3.3**: Make shelf flush with backing ✅
- **Task 2.1.3.4**: Fix bracket positioning and orientation ✅
- **Task 2.1.3.5**: Add independent bracket length/height parameters ✅

**Acceptance**: `docker compose run blender blender --background --python blender/gen_shelf_modular.py` produces FBX and GLTF assets ✅

---

## Milestone 3: WebXR Foundation 🔥 **CURRENT PRIORITY**
*Goal: Create working WebXR environment with 3D scene and interaction*

### Feature 3.0: TypeScript Build System ✅ **TESTED AND VERIFIED**
**Context**: Modern TypeScript workflow with fast development iteration

#### Story 3.0.1: Development Environment ✅ **TESTED AND VERIFIED**
- **Task 3.0.1.1**: Create `client/` folder with TypeScript configuration ✅ **TESTED**
- **Task 3.0.1.2**: Set up Vite for fast development and building ✅ **TESTED**
- **Task 3.0.1.3**: Configure Vitest for unit testing ✅ **TESTED**
- **Task 3.0.1.4**: Add ESLint configuration focused on issue-catching 🔄 **IMPLEMENTED** (not tested)
- **Task 3.0.1.5**: Create Yarn PnP setup for package management ✅ **TESTED**
- **Task 3.0.1.6**: Add build scripts (`yarn build`, `yarn serve`, `yarn test`) ✅ **TESTED**

**Acceptance**: `yarn serve` starts development server, `yarn build` creates production bundle, `yarn test` runs tests
**Status**: ✅ **VERIFIED** - Build compiles successfully, tests pass (7/7), fixed rootDir TypeScript issue

### Feature 3.1: Basic Web 3D Scene 🔄 **IMPLEMENTED BUT NOT TESTED**
**Context**: Progressive implementation from hello world to full 3D scene

#### Story 3.1.1: HTML/JavaScript Foundation 🔄 **IMPLEMENTED BUT NOT TESTED**
- **Task 3.1.1.1**: Create basic HTML page with WebXR capability 🔄 **IMPLEMENTED**
- **Task 3.1.1.2**: Add Three.js integration with basic 3D scene 🔄 **IMPLEMENTED**
- **Task 3.1.1.3**: Add basic cube geometry for testing 🔄 **IMPLEMENTED**

**⚠️ CRITICAL RISK**: Custom WebXR type definitions (`client/src/webxr.d.ts`) require expert review for VR safety

#### Story 3.1.2: 3D Scene Development 🔄 **IMPLEMENTED BUT NOT TESTED**
- **Task 3.1.2.1**: Import and display Blender-generated shelf model (GLTF)
- **Task 3.1.2.2**: Implement camera controls for desktop testing 🔄 **IMPLEMENTED**
- **Task 3.1.2.3**: Add basic movement/navigation system 🔄 **IMPLEMENTED**
- **Task 3.1.2.4**: Configure lighting system for 3D scene 🔄 **IMPLEMENTED**

#### Story 3.1.3: WebXR Integration
- **Task 3.1.3.1**: ⭐ **MOVED FROM 3.1.1.3**: Test WebXR session management (enter/exit VR)
- **Task 3.1.3.2**: Enable WebXR mode with VR session management
- **Task 3.1.3.3**: Implement VR controller input and hand tracking
- **Task 3.1.3.4**: Test interaction with 3D objects in VR
- **Task 3.1.3.5**: Optimize performance for VR frame rates (90fps)

**Acceptance**: Can view and interact with Blender shelf model in both desktop 3D and VR modes

### Feature 3.2: Progressive Web App Setup
**Context**: Make WebXR app installable and offline-capable

#### Story 3.2.1: PWA Foundation
- **Task 3.2.1.1**: Create PWA manifest with VR app metadata
- **Task 3.2.1.2**: Implement service worker for offline asset caching
- **Task 3.2.1.3**: Test PWA installation on desktop browsers
- **Task 3.2.1.4**: Test PWA installation on Meta Quest Browser

**Acceptance**: App installs as PWA on Windows/Mac/Linux/Quest with app-like experience

---

## Milestone 4: Steam API Integration
*Goal: Fetch and display user's Steam game library*

### Feature 4.1: Steam Web API Client
**Context**: Browser-based Steam integration with CORS proxy

#### Story 4.1.1: CORS Proxy Service
- **Task 4.1.1.1**: Create minimal Node.js CORS proxy for Steam Web API
- **Task 4.1.1.2**: Implement GetOwnedGames API endpoint wrapping
- **Task 4.1.1.3**: Add API key management and rate limiting
- **Task 4.1.1.4**: Test proxy service with real Steam accounts

#### Story 4.1.2: Game Library Integration
- **Task 4.1.2.1**: Fetch user's Steam library via proxy
- **Task 4.1.2.2**: Download and cache game icons/artwork
- **Task 4.1.2.3**: Create JSON manifest for WebXR scene population
- **Task 4.1.2.4**: Add offline capability with cached data

**Acceptance**: Can fetch user's Steam library and cache game data for offline use

### Feature 4.2: Game Display System
**Context**: Populate 3D scene with user's actual games

#### Story 4.2.1: Dynamic Game Objects
- **Task 4.2.1.1**: Generate 3D game box objects from Steam library data
- **Task 4.2.1.2**: Apply Steam game artwork as WebGL textures
- **Task 4.2.1.3**: Position games with proper 3D spacing on shelf
- **Task 4.2.1.4**: Test with libraries of different sizes (10, 50, 100+ games)

**Acceptance**: User's Steam games appear as interactive 3D objects on the shelf

---

## Milestone 5: Game Launching & Interaction
*Goal: Users can interact with games in WebXR to launch them*

### Feature 5.1: VR Interaction System
**Context**: Three.js raycasting and WebXR controller integration

#### Story 5.1.1: WebXR Game Interaction
- **Task 5.1.1.1**: Implement VR controller raycasting for game selection
- **Task 5.1.1.2**: Add grab/touch interactions with game objects
- **Task 5.1.1.3**: Create visual feedback (highlighting, haptics)
- **Task 5.1.1.4**: Add game information display in VR space

#### Story 5.1.2: Steam Protocol Integration
- **Task 5.1.2.1**: Execute Steam protocol URLs (`steam://run/<appid>`) from browser
- **Task 5.1.2.2**: Add user education for enabling Steam protocol handlers
- **Task 5.1.2.3**: Create launch confirmation UI within VR space
- **Task 5.1.2.4**: Test cross-platform game launching (Windows/Mac/Linux)

**Acceptance**: Can select and launch Steam games directly from WebXR interface

### Feature 5.2: Enhanced Desktop Integration
**Context**: Electron wrapper for seamless Steam launching

#### Story 5.2.1: Electron Packaging
- **Task 5.2.1.1**: Create Electron wrapper around WebXR application
- **Task 5.2.1.2**: Configure Electron Builder for platform packaging
- **Task 5.2.1.3**: Test desktop VR functionality via Electron
- **Task 5.2.1.4**: Add auto-update capability for desktop apps

**Acceptance**: Desktop apps launch games without browser security limitations

---

## Milestone 6: Polish & Performance
*Goal: Production-ready VR experience with optimal performance*

### Feature 6.1: Performance Optimization
- **Task 6.1.1**: Profile and optimize VR frame rate with large game libraries
- **Task 6.1.2**: Implement level-of-detail (LOD) system for game objects
- **Task 6.1.3**: Add culling for off-screen games
- **Task 6.1.4**: Optimize texture loading and memory usage

### Feature 6.2: Audio & Visual Polish
- **Task 6.2.1**: Add 3D spatial audio for interactions
- **Task 6.2.2**: Implement ambient environment sounds
- **Task 6.2.3**: Enhance lighting and material quality
- **Task 6.2.4**: Add particle effects for game interactions

### Feature 6.3: Error Handling & Reliability
- **Task 6.3.1**: Handle Steam API downtime gracefully
- **Task 6.3.2**: Recover from VR disconnection
- **Task 6.3.3**: Add comprehensive logging system
- **Task 6.3.4**: Create diagnostic tools for troubleshooting

**Acceptance**: Maintains 90+ FPS in VR with 100+ games, robust error handling, immersive audio

---

## Future Considerations
- **Multi-user support**: Share shelves between Steam friends
- **Custom shelf layouts**: User-configurable shelf arrangements  
- **Game metadata**: Display playtime, achievements, reviews
- **Voice commands**: "Launch Half-Life" voice interaction
- **Workshop integration**: Share custom shelf designs