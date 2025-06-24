# SteamVR Blockbuster Shelf - Project Roadmap

## Project Structure Overview
- **Tasks**: Smallest unit of work that can be committed without breaking the build
- **Stories**: Smallest grouping of acceptance criteria intended to ship together
- **Features**: Documentation grouping providing shared context for related stories
- **Milestones**: User-noticeable functionality groupings

---

## Milestone 1: Foundation & Development Environment
*Goal: Establish project structure and development toolchain*

### Feature 1.1: Project Infrastructure
**Context**: Basic project setup, tooling, and development environment

#### Story 1.1.1: Project Scaffolding
- **Task 1.1.1.1**: Create directory structure per project spec
- **Task 1.1.1.2**: Initialize git repository with .gitignore
- **Task 1.1.1.3**: Create package.json for Node.js dependencies
- **Task 1.1.1.4**: Create requirements.txt for Python dependencies
- **Task 1.1.1.5**: Add README.md with setup instructions

#### Story 1.1.2: Development Environment Setup
- **Task 1.1.2.1**: Document Blender 4.x installation requirements
- **Task 1.1.2.2**: Document SteamVR Workshop Tools setup
- **Task 1.1.2.3**: Document VS Code extensions for Lua/VScript
- **Task 1.1.2.4**: Create development environment validation script

**Acceptance**: `npm install` and `pip install -r requirements.txt` complete successfully

---

## Milestone 2: Steam API Integration
*Goal: External tool can fetch and process Steam game library*

### Feature 2.1: Steam Web API Client
**Context**: Fetch user's Steam library and download game assets

#### Story 2.1.1: Steam Library Fetching
- **Task 2.1.1.1**: Implement Steam Web API authentication
- **Task 2.1.1.2**: Create GetOwnedGames API client
- **Task 2.1.1.3**: Add error handling for API failures
- **Task 2.1.1.4**: Add rate limiting and retry logic

#### Story 2.1.2: Asset Download System
- **Task 2.1.2.1**: Download game icons from Steam CDN
- **Task 2.1.2.2**: Create local asset storage in `steamvr-addon/art/`
- **Task 2.1.2.3**: Implement file caching and validation
- **Task 2.1.2.4**: Generate JSON manifest with game metadata

**Acceptance**: Running `node external-tool/fetch_library.js` creates JSON file with game data

### Feature 2.2: File System Monitoring
**Context**: Watch for VR interaction signals and launch games

#### Story 2.2.1: Launch Signal Watcher
- **Task 2.2.1.1**: Implement file system watcher with chokidar
- **Task 2.2.1.2**: Parse launch signal files for game AppIDs
- **Task 2.2.1.3**: Execute Steam protocol URLs (`steam://run/<appid>`)
- **Task 2.2.1.4**: Add logging and error handling

**Acceptance**: Writing a signal file triggers game launch via Steam

---

## Milestone 3: 3D Asset Generation
*Goal: Procedurally generate shelf models using Blender CLI*

### Feature 3.1: Blender Automation Pipeline
**Context**: CLI-driven 3D model generation for VR environment

#### Story 3.1.1: Shelf Geometry Generation
- **Task 3.1.1.1**: Create main shelf (rectangular cube) mesh
- **Task 3.1.1.2**: Generate bracket supports (triangular prisms)
- **Task 3.1.1.3**: Create backing plane/pegboard geometry
- **Task 3.1.1.4**: Add crown/topper (cylindrical ovoid)

#### Story 3.1.2: Export Pipeline
- **Task 3.1.2.1**: Configure FBX export settings
- **Task 3.1.2.2**: Generate Source engine compatible assets
- **Task 3.1.2.3**: Create material assignment system
- **Task 3.1.2.4**: Validate exports in SteamVR Workshop Tools

**Acceptance**: `blender --background --python blender/gen_shelf.py` produces importable 3D assets

---

## Milestone 4: VR Environment Core
*Goal: Basic VR environment loads and displays static shelf*

### Feature 4.1: SteamVR Addon Structure
**Context**: Basic VR environment with static 3D models

#### Story 4.1.1: Environment Setup
- **Task 4.1.1.1**: Create SteamVR addon manifest
- **Task 4.1.1.2**: Import generated shelf models
- **Task 4.1.1.3**: Setup basic lighting and materials
- **Task 4.1.1.4**: Configure VR spawn point and scale

#### Story 4.1.2: Basic VScript Integration
- **Task 4.1.2.1**: Create VScript entry point
- **Task 4.1.2.2**: Implement JSON file reading
- **Task 4.1.2.3**: Add basic error handling and logging
- **Task 4.1.2.4**: Test file I/O limitations and workarounds

**Acceptance**: Environment loads in SteamVR Home with visible shelf model

---

## Milestone 5: Dynamic Content System
*Goal: VR environment dynamically populates with user's Steam games*

### Feature 5.1: Dynamic Game Display
**Context**: Spawn game entities based on Steam library data

#### Story 5.1.1: Game Entity Creation
- **Task 5.1.1.1**: Spawn `prop_physics` entities per game
- **Task 5.1.1.2**: Apply game icons as textures/materials
- **Task 5.1.1.3**: Position games on shelf with proper spacing
- **Task 5.1.1.4**: Add game metadata display (tooltips/UI)

#### Story 5.1.2: Game Library Updates
- **Task 5.1.2.1**: Detect changes in JSON manifest
- **Task 5.1.2.2**: Update VR environment without restart
- **Task 5.1.2.3**: Handle new game additions
- **Task 5.1.2.4**: Remove games no longer in library

**Acceptance**: VR environment shows user's actual Steam games on shelf

---

## Milestone 6: Interactive Game Launching
*Goal: Users can interact with games in VR to launch them*

### Feature 6.1: VR Interaction System
**Context**: Touch/grab interactions trigger game launches

#### Story 6.1.1: Game Interaction Hooks
- **Task 6.1.1.1**: Add interaction detection to game entities
- **Task 6.1.1.2**: Implement grab/touch event handlers
- **Task 6.1.1.3**: Write launch signal files on interaction
- **Task 6.1.1.4**: Add visual feedback for interactions

#### Story 6.1.2: Launch System Integration
- **Task 6.1.2.1**: Connect VScript interactions to file watcher
- **Task 6.1.2.2**: Test end-to-end game launching
- **Task 6.1.2.3**: Add launch confirmation UI
- **Task 6.1.2.4**: Handle launch failures gracefully

**Acceptance**: Grabbing a game in VR launches it via Steam

---

## Milestone 7: Audio & Polish
*Goal: Enhanced VR experience with 3D audio and visual polish*

### Feature 7.1: 3D Audio System
**Context**: Spatial audio enhances VR immersion

#### Story 7.1.1: Environmental Audio
- **Task 7.1.1.1**: Create `.vsndevts` audio event files
- **Task 7.1.1.2**: Attach 3D sound emitters to shelf
- **Task 7.1.1.3**: Trigger audio on game interactions
- **Task 7.1.1.4**: Add ambient environment sounds

#### Story 7.1.2: Visual Polish
- **Task 7.1.2.1**: Improve shelf materials and textures
- **Task 7.1.2.2**: Add proper lighting setup
- **Task 7.1.2.3**: Optimize game icon display quality
- **Task 7.1.2.4**: Add particle effects for interactions

**Acceptance**: VR environment has immersive audio and polished visuals

---

## Milestone 8: Performance & Reliability
*Goal: System runs reliably in production VR use*

### Feature 8.1: Performance Optimization
**Context**: Ensure smooth VR performance

#### Story 8.1.1: VR Performance
- **Task 8.1.1.1**: Profile VR frame rate performance
- **Task 8.1.1.2**: Optimize game entity LOD system
- **Task 8.1.1.3**: Implement culling for off-screen games
- **Task 8.1.1.4**: Test with large game libraries (500+ games)

#### Story 8.1.2: Error Recovery
- **Task 8.1.2.1**: Handle Steam API downtime gracefully
- **Task 8.1.2.2**: Recover from VR disconnection
- **Task 8.1.2.3**: Add comprehensive logging system
- **Task 8.1.2.4**: Create diagnostic tools for troubleshooting

**Acceptance**: System maintains 90+ FPS in VR with 100+ games displayed

---

## Future Considerations
- **Multi-user support**: Share shelves between Steam friends
- **Custom shelf layouts**: User-configurable shelf arrangements  
- **Game metadata**: Display playtime, achievements, reviews
- **Voice commands**: "Launch Half-Life" voice interaction
- **Workshop integration**: Share custom shelf designs