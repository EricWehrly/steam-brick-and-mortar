# Blockbuster Shelf VR - WebXR Implementation Roadmap

## Project Structure Overview
- **Tasks**: Smallest unit of work that can be committed without breaking the build
- **Stories**: Smallest grouping of acceptance criteria intended to ship together
- **Features**: Documentation grouping providing shared context for related stories
- **Milestones**: User-noticeable functionality groupings

**Incremental Progress Principle**: Each task should be achievable in a single session and immediately testable/committable without breaking the build / tests / etc.

## Task Management & Current Focus

**Current Task Prompt**: See `prompts/current-task.prompt.md` for detailed context on what to work on next.

**Task Completion Workflow**:
1. Read `prompts/current-task.prompt.md` for current context and priorities
2. Complete the specified task with testing and validation
3. Update both `prompts/current-task.prompt.md` and this roadmap file with ✅ completion markers
4. Update the current task prompt with the next priority task
5. Commit changes with clear description of what was accomplished

**Documentation Updates**: When tasks are completed, both the roadmap and current task prompt should be updated to reflect progress and re-prioritize remaining work.

## Technology Strategy Decision 🎯

**Architecture Choice**: WebXR-First with Progressive Enhancement
**Research Documents**: 
- `docs/webxr-research-findings.md` - WebXR feasibility analysis
- `docs/webxr-multiplatform.md` - Multi-platform deployment research  
- `docs/alternatives/desktop-vr.research.md` - Electron+WebXR alternative analysis

**Key Decision Factors**:
1. **Cross-Platform Reach**: WebXR works on Meta Quest browsers, desktop VR, and mobile
2. **Development Speed**: Web technologies enable rapid iteration vs. native VR engines
3. **Future-Proof**: WebXR standard adoption growing across all VR platforms
4. **Zero Custom Engine Work**: Three.js + WebXR handles all VR complexity
5. **Progressive Enhancement**: Start with web PWA, add Electron packaging as needed

**Deployment Strategy**:
- **Phase 1**: WebXR PWA hosted with HTTPS (immediate VR headset access)
- **Phase 2**: Electron desktop apps for Windows/Mac/Linux (direct Steam launching)  
- **Phase 3**: VR headset optimization and app store distribution

**Alternative Approaches Considered**:
- SteamVR+VScript+IPC: Complex file-based communication, limited to SteamVR ecosystem
- Native OpenXR: 20+ weeks development time, platform-specific builds
- Unity/Godot VR: Good engines but less cross-platform web deployment flexibility

**Technology Stack**:
- **VR Runtime**: WebXR API (browser-native VR support)
- **3D Engine**: Three.js (mature WebGL library with WebXR integration)
- **Physics**: Cannon.js (plug-and-play physics, integrated with Three.js)
- **Asset Pipeline**: Blender → GLTF → Three.js GLTFLoader

## Final Technology Decision (CONFIRMED) ✅

After completing comprehensive research across multiple approaches, **WebXR-first with Electron enhancement** is confirmed as the optimal path:

### Selected: WebXR + Three.js + Electron
**Rationale**: Best balance of development speed, cross-platform reach, and deployment flexibility.

**Implementation Path**:
1. **Immediate**: Pure WebXR PWA (works on any WebXR browser)
2. **Enhanced**: Electron wrapper for local file system access and Steam launching
3. **Optimized**: Platform-specific builds if performance requires

**Research Validation**:
- ✅ Cross-platform deployment paths documented (`docs/webxr-multiplatform.md`)
- ✅ Technical feasibility confirmed (`docs/webxr-research-findings.md`)
- ✅ Alternative architectures evaluated and timeline-compared (`docs/alternatives/`)
- ✅ Risk mitigation strategies identified for CORS/launching challenges

**Timeline**: 2-3 months for MVP vs 6+ months for native alternatives.
- **Desktop Packaging**: Electron + electron-builder (when needed)
- **Deployment**: Web hosting + Progressive Web App + optional native installers

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

## Milestone 3: Steam API Integration
*Goal: External tool can fetch and process Steam game library*

### Feature 3.1: Steam Web API Client
**Context**: Fetch user's Steam library and download game assets

#### Story 3.1.1: Basic Node.js Environment + Steam Protocol Testing
- **Task 3.1.1.1**: Create package.json for Node.js dependencies ✅
- **Task 3.1.1.2**: Add Node.js Dockerfile ✅
- **Task 3.1.1.3**: Update docker-compose.yml with nodejs service ✅
- **Task 3.1.1.4**: Test Node.js environment setup ✅
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

### Feature 3.2: Steam Integration for WebXR
**Context**: Direct Steam Web API integration and browser-based game launching

#### Story 3.2.1: Browser-Based Game Launching
- **Task 3.2.1.3**: Execute Steam protocol URLs (`steam://run/<appid>`) from browser
- **Task 3.2.1.4**: Add logging and error handling for launch attempts
- **Task 3.2.1.6**: ⭐ **PRIORITY**: Test game launch timing and browser transition UX
- **Task 3.2.1.7**: Research browser security requirements for protocol handling
- **Task 3.2.1.8**: Implement user education for enabling Steam protocol handlers

**Acceptance**: Browser can successfully launch Steam games with good user experience

---

## Milestone 4: WebXR Cross-Platform Implementation 🚧
*Goal: Multi-platform VR library browser using WebXR-first strategy*

**Architecture**: WebXR + Three.js core with progressive enhancement to Electron desktop apps
**Deployment Strategy**: Web-first PWA → Desktop packaging → VR headset optimization

### Feature 4.1: WebXR Foundation (Phase 1: Web-First Deployment)
**Context**: Core VR capabilities with maximum cross-platform reach

#### Story 4.1.1: Three.js WebXR Core
- **Task 4.1.1.1**: Create Three.js WebXR scene with VR session management
- **Task 4.1.1.2**: Implement WebXR controller input and hand tracking
- **Task 4.1.1.3**: Test VR session lifecycle (enter/exit VR mode)
- **Task 4.1.1.4**: Add basic 3D environment and lighting setup
- **Task 4.1.1.5**: Test on Chrome desktop with VR headset connected
- **Task 4.1.1.6**: Test on Meta Quest Browser directly

**Acceptance**: Can enter VR, see hands/controllers, and interact with objects across platforms

#### Story 4.1.2: Progressive Web App Setup
- **Task 4.1.2.1**: Create PWA manifest with VR app metadata
- **Task 4.1.2.2**: Implement service worker for offline asset caching
- **Task 4.1.2.3**: Test PWA installation on desktop browsers
- **Task 4.1.2.4**: Test PWA installation on Meta Quest Browser
- **Task 4.1.2.5**: Add app icons and splash screens for all platforms

**Acceptance**: App installs as PWA on Windows/Mac/Linux/Quest with app-like experience

#### Story 4.1.3: Asset Integration
- **Task 4.1.3.1**: Integrate GLTFLoader for Blender-generated models
- **Task 4.1.3.2**: Load and display shelf geometry in VR space
- **Task 4.1.3.3**: Optimize GLTF assets for web delivery (compression, textures)
- **Task 4.1.3.4**: Implement progressive loading with Three.js TextureLoader

**Acceptance**: Blender shelf models display correctly in WebXR across all platforms

### Feature 4.2: Steam Integration Layer
**Context**: Steam Web API access and game library management

#### Story 4.2.1: CORS Proxy Service
- **Task 4.2.1.1**: Create simple Node.js CORS proxy for Steam Web API
- **Task 4.2.1.2**: Implement GetOwnedGames API endpoint wrapping
- **Task 4.2.1.3**: Add API key management and rate limiting
- **Task 4.2.1.4**: Test proxy service with real Steam accounts

**Acceptance**: Can fetch user's Steam library via JavaScript from any browser

#### Story 4.2.2: Game Data Management
- **Task 4.2.2.1**: Implement browser cache for game library data
- **Task 4.2.2.2**: Create game icon/artwork downloading system
- **Task 4.2.2.3**: Build JSON manifest for VR scene population
- **Task 4.2.2.4**: Add offline capability with cached data

**Acceptance**: Game library persists between sessions, icons load efficiently

### Feature 4.3: VR Interaction & Game Launching
**Context**: Cross-platform 3D shelf interaction and game launching

#### Story 4.3.1: WebXR Interaction System
- **Task 4.3.1.1**: Generate 3D game box props from library data
- **Task 4.3.1.2**: Implement grab/touch interactions using Three.js raycasting
- **Task 4.3.1.3**: Add hover effects and game information display
- **Task 4.3.1.4**: Create spatial audio feedback for interactions

**Acceptance**: Can browse and select games in 3D VR space on all platforms

#### Story 4.3.2: Cross-Platform Game Launching
- **Task 4.3.2.1**: Test steam:// protocol URL launching in desktop browsers
- **Task 4.3.2.2**: Add fallback UI for VR headset browsers (no Steam access)
- **Task 4.3.2.3**: Create user education for enabling protocol handlers
- **Task 4.3.2.4**: Add launch status feedback and error handling

**Acceptance**: Games launch successfully on desktop with clear user feedback

### Feature 4.4: Desktop Enhancement (Phase 2: Desktop Packaging)
**Context**: Electron packaging for native app distribution

#### Story 4.4.1: Electron Integration
- **Task 4.4.1.1**: Create Electron wrapper around WebXR application
- **Task 4.4.1.2**: Configure Electron Builder for Windows/Mac/Linux packaging
- **Task 4.4.1.3**: Test desktop VR functionality via Electron + WebXR
- **Task 4.4.1.4**: Add auto-update capability for desktop apps

**Acceptance**: Desktop apps launch games directly without browser limitations

#### Story 4.4.2: Platform-Specific Distribution
- **Task 4.4.2.1**: Create Windows installer (.exe + NSIS installer)
- **Task 4.4.2.2**: Create macOS disk image (.dmg)  
- **Task 4.4.2.3**: Create Linux packages (AppImage + .deb)
- **Task 4.4.2.4**: Test installation and Steam integration on all platforms

**Acceptance**: Native installers work correctly on Windows/Mac/Linux

### Feature 4.5: VR Headset Optimization (Phase 3: Advanced Features)
**Context**: Headset-specific enhancements and performance optimization

#### Story 4.5.1: Meta Quest Optimization
- **Task 4.5.1.1**: Optimize WebGL rendering for Quest mobile GPU
- **Task 4.5.1.2**: Add Quest-specific hand tracking enhancements
- **Task 4.5.1.3**: Create Quest store listing (if native app route desired)
- **Task 4.5.1.4**: Test performance at 90fps on Quest 2/3

#### Story 4.5.2: Desktop VR Enhancement
- **Task 4.5.2.1**: Add SteamVR-specific features (base stations, room-scale)
- **Task 4.5.2.2**: Optimize for high-resolution headsets (Index, Vive Pro)
- **Task 4.5.2.3**: Add Windows Mixed Reality specific features
- **Task 4.5.2.4**: Implement adaptive quality based on system performance

**Acceptance**: Optimal VR experience across all headset types and platforms

---

## Milestone 5: Dynamic Content System  
*Goal: WebXR environment dynamically populates with user's Steam games*

### Feature 5.1: Dynamic Game Display
**Context**: Spawn game entities in WebXR scene based on Steam library data

#### Story 5.1.1: Basic WebXR Game Entity Creation
- **Task 5.1.1.1**: Create Three.js game box geometry with Steam game textures
- **Task 5.1.1.2**: Test entity positioning on procedural shelf
- **Task 5.1.1.3**: Apply Steam game artwork as box textures
- **Task 5.1.1.4**: Verify WebXR interaction (grab, touch) with game boxes

#### Story 5.1.2: Steam Library Integration
- **Task 5.1.2.1**: Fetch Steam library via CORS proxy service
- **Task 5.1.2.2**: Generate one Three.js mesh per game in library
- **Task 5.1.2.3**: Download and apply game icons as WebGL textures
- **Task 5.1.2.4**: Position games with proper 3D spacing on shelf

#### Story 5.1.3: Dynamic Updates
- **Task 5.1.3.1**: Detect changes in Steam library (new purchases)
- **Task 5.1.3.2**: Update WebXR scene without VR session restart
- **Task 5.1.3.3**: Handle new game additions incrementally
- **Task 5.1.3.4**: Remove games no longer in library (refunds, etc.)

**Acceptance**: WebXR environment shows user's actual Steam games as interactive 3D objects

---

## Milestone 6: Interactive Game Launching
*Goal: Users can interact with games in WebXR to launch them*

### Feature 6.1: WebXR VR Interaction
**Context**: Three.js raycasting interactions trigger game launches

#### Story 6.1.1: Interaction Detection
- **Task 6.1.1.1**: Add WebXR controller raycasting to single test game
- **Task 6.1.1.2**: Test grab/touch event triggering with VR controllers
- **Task 6.1.1.3**: Add visual feedback for interactions (highlighting, haptics)
- **Task 6.1.1.4**: Log interaction events for debugging

#### Story 6.1.2: Direct Launch System
- **Task 6.1.2.1**: Execute Steam protocol URLs on game interaction
- **Task 6.1.2.2**: Test direct browser → Steam launching flow
- **Task 6.1.2.3**: Add user permission guidance for protocol handlers
- **Task 6.1.2.4**: Test end-to-end launch for one game in WebXR

#### Story 6.1.3: Full Launch Integration
- **Task 6.1.3.1**: Apply interaction system to all game entities in scene
- **Task 6.1.3.2**: Add launch confirmation UI within VR space
- **Task 6.1.3.3**: Handle launch failures gracefully with VR feedback
- **Task 6.1.3.4**: Add cooldown to prevent accidental launches

**Acceptance**: Grabbing a game in WebXR VR launches it via Steam protocol

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

### **Steam Protocol URL Testing**

The browser → Steam game launching is **mission-critical** and must be thoroughly tested before building higher-level WebXR features.

#### **Browser Integration Flow:**
1. **WebXR App** → User selects game in VR interface
2. **JavaScript** → Executes `window.open('steam://run/<appid>')` or similar  
3. **Browser** → Prompts user for protocol handler permission (first time)
4. **Steam** → Launches game and takes focus

#### **Cross-Platform Requirements:**
- **Windows**: Steam protocol registration with browser security prompts
- **macOS**: System-level protocol handler confirmation
- **Linux**: Desktop environment protocol association
- **Quest Browser**: May have limitations - needs fallback strategy

#### **Testing Prerequisites:**
```
PRIORITY 1: Steam Protocol Testing
├── ⭐ Test Steam protocol URL execution from browser
├── ⭐ Test cross-platform browser security prompts  
├── ⭐ Test protocol handler setup and user education
└── ⭐ Test fallback strategies for browsers without Steam access

PRIORITY 2: WebXR Foundation  
├── ⭐ Test WebXR session management across platforms
├── ⭐ Test Three.js integration with WebXR
├── ⭐ Test GLTF model loading from Blender assets
└── ⭐ Test VR controller interaction basics
```

### **Browser → Steam Transition Strategy**

#### **Current Reality: Browser Security Limitations**
- Browsers **cannot directly launch and transition to games** without user permission
- **Protocol handler prompts** are unavoidable but acceptable with good UX
- **Priority**: Minimize friction and provide clear user guidance

#### **Transition Options:**

**Option A: Direct Protocol Launch** *(Recommended)*
```javascript
// WebXR approach: Direct Steam protocol execution
function launchGame(appid) {
    // 1. Show user confirmation UI in VR
    showLaunchConfirmation(appid);
    
    // 2. Execute Steam protocol URL
    window.open(`steam://run/${appid}`);
    
    // 3. Provide user feedback about next steps
    showLaunchInstructions("Check your desktop - Steam is starting the game");
}
```

**Option B: Electron Enhanced** *(Future Enhancement)*
```javascript
// Electron wrapper: Enhanced desktop integration
function launchGameElectron(appid) {
    // 1. Direct Steam execution without browser prompts
    require('child_process').exec(`steam://run/${appid}`);
    
    // 2. Monitor Steam process if needed
    // 3. Optional: minimize Electron window during gameplay
}
```

#### **Implementation Strategy:**
1. **Start with Option A** (direct protocol launch) - most reliable and simple
2. **Add user education and clear UX** - guide users through protocol setup  
3. **Implement Option B** (Electron enhancement) - for users wanting seamless experience
4. **Provide choice** - let users pick web vs desktop app based on preference

#### **WebXR App Responsibilities:**
```javascript
// Game launch orchestration for WebXR
async function launchGame(appid, gameTitle) {
    // 1. Show VR confirmation dialog
    const confirmed = await showVRDialog(`Launch ${gameTitle}?`);
    if (!confirmed) return;
    
    // 2. Attempt Steam protocol launch
    try {
        window.open(`steam://run/${appid}`);
        
        // 3. Show success feedback in VR
        showVRNotification("Game launching! Check your desktop.");
        
        // 4. Optional: track launch success/failure
        setTimeout(() => checkLaunchSuccess(appid), 5000);
        
    } catch (error) {
        // 5. Handle launch failures gracefully
        showVRError("Could not launch game. Make sure Steam is installed.");
    }
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