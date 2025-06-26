# SteamVR Blockbuster Shelf - Project Roadmap

## Project Structure Overview
- **Tasks**: Smallest unit of work that can be committed without breaking the build
- **Stories**: Smallest grouping of acceptance criteria intended to ship together
- **Features**: Documentation grouping providing shared context for related stories
- **Milestones**: User-noticeable functionality groupings

**Incremental Progress Principle**: Each task should be achievable in a single session and immediately testable/committable without breaking the build / tests / etc.

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

## Milestone 3: Steam API Integration
*Goal: External tool can fetch and process Steam game library*

### Feature 3.1: Steam Web API Client
**Context**: Fetch user's Steam library and download game assets

#### Story 3.1.1: Basic Node.js Environment + IPC Testing
- **Task 3.1.1.1**: Create package.json for Node.js dependencies
- **Task 3.1.1.2**: Add Node.js Dockerfile
- **Task 3.1.1.3**: Update docker-compose.yml with nodejs service  
- **Task 3.1.1.4**: Test Node.js environment setup
- **Task 3.1.1.5**: ⭐ **PRIORITY**: Test file-based IPC with dummy VScript files
- **Task 3.1.1.6**: ⭐ **PRIORITY**: Test filesystem watching for signal files
- **Task 3.1.1.7**: ⭐ **PRIORITY**: Test Steam protocol URL execution (`steam://run/440`)

#### Story 3.1.2: Steam Library Fetching
- **Task 3.1.2.1**: Implement Steam Web API authentication
- **Task 3.1.2.2**: Create GetOwnedGames API client
- **Task 3.1.2.3**: Add error handling for API failures
- **Task 3.1.2.4**: Add rate limiting and retry logic

#### Story 3.1.3: Asset Download System  
- **Task 3.1.3.1**: Download game icons from Steam CDN
- **Task 3.1.3.2**: Create local asset storage in `steamvr-addon/art/`
- **Task 3.1.3.3**: Implement file caching and validation
- **Task 3.1.3.4**: Generate JSON manifest with game metadata

**Acceptance**: Running `docker compose run nodejs node external-tool/fetch_library.js` creates JSON file with game data

### Feature 3.2: File System Monitoring
**Context**: Watch for VR interaction signals and launch games

#### Story 3.2.1: Launch Signal Watcher + Game Transition
- **Task 3.2.1.1**: Implement file system watcher with chokidar
- **Task 3.2.1.2**: Parse launch signal files for game AppIDs
- **Task 3.2.1.3**: Execute Steam protocol URLs (`steam://run/<appid>`)
- **Task 3.2.1.4**: Add logging and error handling
- **Task 3.2.1.5**: ⭐ **PRIORITY**: Test VScript signal writing → external tool detection
- **Task 3.2.1.6**: ⭐ **PRIORITY**: Test game launch timing and environment transition
- **Task 3.2.1.7**: Research environment shutdown vs. sleep strategies
- **Task 3.2.1.8**: Implement cleanup/restore logic for failed launches

**Acceptance**: Writing a signal file triggers game launch via Steam + smooth environment transition

---

## Milestone 4: WebXR Implementation 🚧
*Goal: Build cross-platform VR library browser using WebXR + Three.js*

### Feature 4.1: WebXR Foundation
**Context**: Core VR capabilities with Three.js and hand tracking

#### Story 4.1.1: Basic WebXR Setup
- **Task 4.1.1.1**: Create Three.js WebXR scene with VR session management
- **Task 4.1.1.2**: Implement hand tracking and controller input handling  
- **Task 4.1.1.3**: Test VR session lifecycle (enter/exit VR mode)
- **Task 4.1.1.4**: Add basic 3D environment and lighting setup

**Acceptance**: Can enter VR, see hands/controllers, and interact with objects

#### Story 4.1.2: Asset Integration
- **Task 4.1.2.1**: Integrate GLTFLoader for Blender-generated models
- **Task 4.1.2.2**: Load and display shelf geometry in VR space
- **Task 4.1.2.3**: Optimize GLTF assets for web delivery (compression, textures)
- **Task 4.1.2.4**: Implement progressive loading for large assets

**Acceptance**: Blender shelf models display correctly in WebXR

### Feature 4.2: Steam Integration Layer
**Context**: Steam Web API access and game library management

#### Story 4.2.1: CORS Proxy Service
- **Task 4.2.1.1**: Create simple Node.js CORS proxy for Steam Web API
- **Task 4.2.1.2**: Implement GetOwnedGames API endpoint wrapping
- **Task 4.2.1.3**: Add API key management and rate limiting
- **Task 4.2.1.4**: Test proxy service with real Steam accounts

**Acceptance**: Can fetch user's Steam library via JavaScript

#### Story 4.2.2: Game Data Management
- **Task 4.2.2.1**: Implement IndexedDB storage for game library caching
- **Task 4.2.2.2**: Create game icon/artwork downloading system
- **Task 4.2.2.3**: Build JSON manifest generator for VR scene population
- **Task 4.2.2.4**: Add offline capability with cached data

**Acceptance**: Game library persists between sessions, icons load efficiently

### Feature 4.3: VR Interaction & Game Launching
**Context**: 3D shelf interaction and external game launching

#### Story 4.3.1: VR Game Shelf
- **Task 4.3.1.1**: Generate 3D game box props from library data
- **Task 4.3.1.2**: Implement grab/touch interactions with game boxes
- **Task 4.3.1.3**: Add hover effects and game information display
- **Task 4.3.1.4**: Create spatial audio feedback for interactions

**Acceptance**: Can browse and select games in 3D VR space

#### Story 4.3.2: Game Launching System
- **Task 4.3.2.1**: Test steam:// protocol URL launching in different browsers
- **Task 4.3.2.2**: Implement fallback UI for unsupported browsers
- **Task 4.3.2.3**: Add user education for enabling protocol handlers
- **Task 4.3.2.4**: Create browser extension for enhanced launching (optional)

**Acceptance**: Games launch successfully with clear user feedback

---

## Milestone 5: Dynamic Content System  
*Goal: VR environment dynamically populates with user's Steam games*

### Feature 5.1: Dynamic Game Display
**Context**: Spawn game entities based on Steam library data

#### Story 5.1.1: Basic Game Entity Creation
- **Task 5.1.1.1**: Create simple prop_physics test entity
- **Task 5.1.1.2**: Test entity positioning on shelf
- **Task 5.1.1.3**: Apply basic texture to test entity
- **Task 5.1.1.4**: Verify entity physics behavior

#### Story 5.1.2: Game Library Integration
- **Task 5.1.2.1**: Read JSON manifest in VScript
- **Task 5.1.2.2**: Spawn one game entity per JSON entry
- **Task 5.1.2.3**: Apply game icons as entity textures
- **Task 5.1.2.4**: Position games with proper spacing

#### Story 5.1.3: Dynamic Updates
- **Task 5.1.3.1**: Detect changes in JSON manifest
- **Task 5.1.3.2**: Update VR environment without restart
- **Task 5.1.3.3**: Handle new game additions incrementally
- **Task 5.1.3.4**: Remove games no longer in library

**Acceptance**: VR environment shows user's actual Steam games on shelf

---

## Milestone 6: Interactive Game Launching
*Goal: Users can interact with games in VR to launch them*

### Feature 6.1: Basic VR Interaction
**Context**: Touch/grab interactions trigger game launches

#### Story 6.1.1: Interaction Detection
- **Task 6.1.1.1**: Add interaction detection to single test entity
- **Task 6.1.1.2**: Test grab/touch event triggering
- **Task 6.1.1.3**: Add visual feedback for interactions
- **Task 6.1.1.4**: Log interaction events for debugging

#### Story 6.1.2: Launch Signal System
- **Task 6.1.2.1**: Write launch signal files on interaction
- **Task 6.1.2.2**: Test signal file creation from VScript
- **Task 6.1.2.3**: Connect to file watcher for launch
- **Task 6.1.2.4**: Test end-to-end launch for one game

#### Story 6.1.3: Full Launch Integration
- **Task 6.1.3.1**: Apply interaction system to all game entities
- **Task 6.1.3.2**: Add launch confirmation UI
- **Task 6.1.3.3**: Handle launch failures gracefully
- **Task 6.1.3.4**: Add cooldown to prevent accidental launches

**Acceptance**: Grabbing a game in VR launches it via Steam

---

## Milestone 7: Audio & Polish
*Goal: Enhanced VR experience with 3D audio and visual polish*

### Feature 7.1: Basic Audio System
**Context**: Add immersive audio to VR environment

#### Story 7.1.1: Environmental Audio
- **Task 7.1.1.1**: Create basic .vsndevts audio event file
- **Task 7.1.1.2**: Test 3D sound emitter placement
- **Task 7.1.1.3**: Add interaction sound effects
- **Task 7.1.1.4**: Add ambient environment sounds

#### Story 7.1.2: Visual Polish
- **Task 7.1.2.1**: Improve shelf material quality
- **Task 7.1.2.2**: Optimize lighting setup
- **Task 7.1.2.3**: Enhance game icon display quality  
- **Task 7.1.2.4**: Add subtle particle effects for interactions

**Acceptance**: VR environment has immersive audio and polished visuals

---

## Milestone 8: Performance & Reliability
*Goal: System runs reliably in production VR use*

### Feature 8.1: Performance Optimization
**Context**: Ensure smooth VR performance

#### Story 8.1.1: Performance Baseline
- **Task 8.1.1.1**: Profile VR frame rate with 10 games
- **Task 8.1.1.2**: Profile VR frame rate with 50 games
- **Task 8.1.1.3**: Profile VR frame rate with 100+ games
- **Task 8.1.1.4**: Identify performance bottlenecks

#### Story 8.1.2: Performance Improvements
- **Task 8.1.2.1**: Implement game entity LOD system
- **Task 8.1.2.2**: Add culling for off-screen games
- **Task 8.1.2.3**: Optimize texture loading and caching
- **Task 8.1.2.4**: Test with large game libraries (500+ games)

#### Story 8.1.3: Error Recovery
- **Task 8.1.3.1**: Handle Steam API downtime gracefully
- **Task 8.1.3.2**: Recover from VR disconnection
- **Task 8.1.3.3**: Add comprehensive logging system
- **Task 8.1.3.4**: Create diagnostic tools for troubleshooting

**Acceptance**: System maintains 90+ FPS in VR with 100+ games displayed

---

## 🔄 **Critical Integration Points & Testing Priorities**

### **File-Based IPC (Inter-Process Communication)**

The VScript ↔ External Tool communication is **mission-critical** and must be thoroughly tested before building higher-level features.

#### **Communication Flow:**
1. **External Tool** → VScript: JSON manifest (`data/games.json`)
2. **VScript** → External Tool: Launch signals (`launch_signals/*.signal`)  
3. **External Tool** → System: Steam protocol execution (`steam://run/<appid>`)

#### **File System Requirements:**
- **Shared directory access** between SteamVR addon and external tool
- **File locking/atomic writes** to prevent race conditions
- **Polling vs. filesystem watching** for signal detection
- **Signal cleanup** after processing to avoid duplicate launches

#### **Testing Prerequisites:**
```
PRIORITY 1: Basic IPC Testing
├── ✅ Test file creation from VScript (StringToFile)
├── ✅ Test file reading by external Node.js process  
├── ✅ Test file deletion/cleanup cycle
├── ⭐ Test signal detection latency (<100ms target)
└── ⭐ Test concurrent access (multiple signal files)

PRIORITY 2: Steam Integration Testing  
├── ⭐ Test Steam protocol URL execution
├── ⭐ Test Steam process detection/monitoring
├── ⭐ Test game launch success/failure feedback
└── ⭐ Test transition timing (store→game)
```

### **Environment Transition Strategy**

#### **Current Limitation: No Graceful Handoff**
- SteamVR environments **cannot directly launch and transition to games**
- **"Desktop risk"** is unavoidable but acceptable as fallback
- **Priority**: Minimize transition jarring/improve UX where possible

#### **Transition Options (Research Needed):**

**Option A: Environment Shutdown**
```lua
-- VScript approach: Clean shutdown before launch
function PrepareForGameLaunch(appid)
    -- 1. Save state if needed
    -- 2. Clean up entities and resources
    -- 3. Stop audio/effects
    -- 4. Trigger shutdown sequence
    SendToConsole("quit")  -- Force SteamVR Home exit
end
```

**Option B: Environment Sleep/Minimize**
```lua
-- VScript approach: Resource reduction (if possible)
function MinimizeForGameLaunch(appid)
    -- 1. Stop all audio
    StopGlobalSound("ambient.store")
    
    -- 2. Hide/remove all entities  
    for _, entity in pairs(gameEntities) do
        SetRenderingEnabled(entity:GetEntityHandle(), false)
    end
    
    -- 3. Reduce think frequency
    ScriptSystem_RemovePerFrameUpdateFunction(updateFunction)
    
    -- 4. Wait for game to finish (external tool monitors)
    -- 5. Restore environment when game exits
end
```

**Option C: SteamVR Dashboard Integration** *(Research Required)*
- Investigate if SteamVR Dashboard APIs allow environment control
- Check if games can be launched "through" the environment
- Determine if environments can detect game state changes

#### **Implementation Strategy:**
1. **Start with Option A** (clean shutdown) - most reliable
2. **Research Option C** (dashboard integration) - potentially seamless  
3. **Implement Option B** (sleep/restore) - best user experience if feasible

#### **External Tool Responsibilities:**
```javascript
// Game launch orchestration
async function launchGame(appid) {
    // 1. Signal environment to prepare for shutdown
    await writeFile('signals/prepare_shutdown.signal', appid);
    
    // 2. Wait for environment acknowledgment
    await waitForFile('signals/ready_for_launch.signal');
    
    // 3. Launch game via Steam
    await exec(`steam://run/${appid}`);
    
    // 4. Monitor game process
    const gameProcess = await waitForGameStart(appid);
    
    // 5. Optionally restore environment when game exits
    gameProcess.on('exit', () => {
        // Decide: restart environment or stay at desktop
    });
}
```

---

## Future Considerations
- **Multi-user support**: Share shelves between Steam friends
- **Custom shelf layouts**: User-configurable shelf arrangements  
- **Game metadata**: Display playtime, achievements, reviews
- **Voice commands**: "Launch Half-Life" voice interaction
- **Workshop integration**: Share custom shelf designs

---

## 🔬 **Research & UX Considerations**

### **Environment Transition Research**

#### **The Seamless Transition Challenge**
Current SteamVR environments have no native way to launch games while maintaining the VR session. This creates a jarring "desktop risk" during game transitions that we should minimize.

#### **Research Questions:**
1. **SteamVR Dashboard Integration**:
   - Can environments communicate with the SteamVR Dashboard?
   - Do Dashboard APIs support game launching?
   - Can environments detect when games start/stop?

2. **Steam VR Game Library Integration**:
   - Does Steam have VR-specific launch APIs?
   - Can we launch games "through" SteamVR rather than the desktop?
   - Are there undocumented environment-to-game transition APIs?

3. **Resource Management**:
   - Can environments "sleep" and release resources while games run?
   - What's the memory/GPU footprint of a minimized environment?
   - Is background environment restoration feasible?

4. **Alternative Approaches**:
   - Could we build this as a SteamVR Dashboard overlay instead?
   - Would a custom SteamVR Home replacement be more seamless?
   - Are there third-party VR launchers with better integration?

#### **User Experience Options:**

**Option A: Accept the Desktop** *(Pragmatic)*
- Clean shutdown with fade-to-black transition
- Clear messaging: "Launching [Game]... Starting in 3, 2, 1..."
- Fast environment restart when games exit

**Option B: Minimize and Restore** *(Ambitious)*
- Environment goes to sleep, releases most resources
- Game runs normally 
- Environment automatically restores when game exits
- Requires robust game state detection

**Option C: Dashboard Integration** *(Research Dependent)*
- Build as SteamVR Dashboard panel instead of environment
- Use Dashboard's native game launching
- Potentially seamless but limited by Dashboard APIs

**Option D: Hybrid Approach** *(Flexible)*
- Default to clean shutdown (reliable)
- Offer experimental "stay loaded" mode for power users
- Let users choose their preferred transition style

#### **Implementation Priority:**
1. **Start with Option A** - get the core functionality working
2. **Research Option C** - investigate Dashboard APIs in parallel
3. **Prototype Option B** - if resource management proves feasible
4. **Offer Option D** - provide user choice once multiple approaches work

This UX research should happen alongside core development but not block progress. The "desktop risk" is acceptable if the overall experience is magical.

---

## 🌐 **WebXR-First Technology Approach**

### **Strategic Pivot: Why WebXR is Superior**

After analyzing our requirements, **WebXR emerges as the optimal approach** for our blockbuster shelf project:

**✅ Eliminates IPC Complexity**: No file-based communication needed - direct Steam Web API calls
**✅ Cross-Platform by Default**: Works on any VR headset with any OS
**✅ Fastest Iteration Speed**: Hot reload, browser DevTools, instant testing
**✅ Universal Distribution**: Share via URL, no installation required
**✅ Future-Proof**: Web technologies, packageable as native apps later
**✅ Keep Blender Pipeline**: Generated 3D assets work perfectly in WebXR

**Trade-off**: Lose "VR desktop replacement" capability, but gain massive development speed and reach.

### **Key Requirements for Evaluation:**

#### **Must-Have Features:**
- Display user's Steam game library in 3D VR space
- Allow VR interaction (grab/touch) to launch games
- Integration with Steam Web API for game metadata
- Reasonable development iteration speed
- Cross-platform compatibility (Windows primary)

#### **Nice-to-Have Features:**
- **Auto-start on VR headset connection** (like SteamVR Home replacement)
- Seamless game launching without desktop exposure
- Integration with SteamVR ecosystem
- Workshop/sharing capabilities
- Multi-user/social features

#### **Development Constraints:**
- Need for rapid iteration and testing
- Minimal "human-in-the-middle" feedback loops
- CLI-driven development where possible
- Docker/containerized development environment

### **Updated Architecture: WebXR + Blender**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Blender CLI    │    │   WebXR App     │    │  Steam Web API  │
│                 │    │                 │    │                 │
│ • Generate 3D   │───▶│ • Import models │◄───│ • GetOwnedGames │
│   shelf models  │    │ • VR interaction│    │ • Game metadata │
│ • Export GLTF   │    │ • Direct API    │    │ • Icon URLs     │
│ • Materials     │    │ • Game launching│    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Browser Storage │
                       │ • Game library  │
                       │ • User prefs    │
                       │ • Cache         │
                       └─────────────────┘
```

**Key Benefits:**
- **No IPC complexity** - everything runs in same JavaScript context
- **Instant iteration** - refresh browser to see changes
- **Universal compatibility** - any VR headset, any platform
- **Keep proven Blender pipeline** - GLTF export works perfectly
- **Direct Steam integration** - fetch API calls, no external tools

### **WebXR Technology Stack Assumptions**

We need to **verify these assumptions** through focused research:

#### **Core WebXR Capabilities** *(Expected: ✅ Fully Supported)*
- **VR Session Management**: Enter/exit VR mode, headset detection
- **Hand Tracking**: 6DOF controllers, grab/touch interactions  
- **3D Scene Rendering**: WebGL/WebGPU performance for 90fps VR
- **GLTF Model Loading**: Import Blender-generated shelf models
- **Spatial Audio**: 3D positioned audio for immersive video store

#### **Steam Web API Integration** *(Expected: ⚠️ CORS Challenges)*
- **GetOwnedGames API**: Fetch user's Steam library  
- **CORS Workarounds**: Proxy server, browser extensions, or Steam OAuth
- **Game Icons**: Download and cache game artwork
- **Rate Limiting**: Handle Steam API quotas gracefully

#### **Game Launching** *(Expected: ⚠️ Browser Security Limitations)*
- **Steam Protocol URLs**: Launch `steam://run/appid` from browser
- **Cross-Platform Support**: Windows/Mac/Linux compatibility
- **User Permissions**: Browser security prompts and workarounds
- **Fallback Methods**: Deep links, desktop notifications, manual instructions

#### **Development Workflow** *(Expected: ✅ Excellent)*
- **Hot Reload**: Instant changes without VR headset removal
- **Browser DevTools**: Real-time debugging, performance profiling
- **Local Development**: Simple HTTP server, no complex toolchain
- **Asset Pipeline**: GLTF from Blender → WebXR with minimal processing

#### **Distribution & Deployment** *(Expected: ✅ Trivial)*
- **Web Hosting**: Static site deployment (GitHub Pages, Netlify, etc.)
- **Progressive Web App**: Installable, offline capability
- **Native Packaging**: Electron/Tauri for desktop apps (future)
- **Mobile VR**: Quest browser, smartphone VR support

### **Research Complete ✅**

**Key Findings** (see `docs/webxr-research-findings.md` for full analysis):

✅ **WebXR Core Capabilities**: Fully supported across target platforms  
⚠️ **Game Launching**: Solvable via browser extensions or native app wrapper  
⚠️ **Steam API CORS**: Requires CORS proxy service (standard solution)  
✅ **VR Performance**: Three.js + WebXR capable of 90fps with GLTF assets  
✅ **Development Workflow**: Hot reload and browser DevTools work excellently

**Decision**: **Proceed with WebXR approach** - start with pure web implementation, package as native app if game launching UX requires it.