# Phase 1: "Ready for Me" - Personal Demo Readiness

## Phase Overview

**Goal**: Demonstrate all imagined functionality with competency - personal demo-ready

**Scope**: Complete through Milestone 6 (Level Layout)

**Acceptable Limitations**:
- Small library demos (5-20 games) acceptable
- Rate limiting acceptable for single-user testing
- Basic error handling sufficient

**Phase 1 Completion Status**: ~80% complete - solid foundation, working Steam integration with caching, pause menu system functional, moving to visual enhancements and game population

---

## ✅ Milestone 1: Foundation & Development Environment
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

## ✅ Milestone 2: 3D Asset Generation
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

## ✅ Milestone 3: 3D Scene Foundation
*Goal: Create working 3D scene with shelf model and placeholder game objects*

### Feature 3.0: TypeScript Build System ✅
**Context**: Modern TypeScript workflow with fast development iteration

#### Story 3.0.1: Development Environment ✅
- **Task 3.0.1.1**: Create `client/` folder with TypeScript configuration ✅
- **Task 3.0.1.2**: Set up Vite for fast development and building ✅
- **Task 3.0.1.3**: Configure Vitest for unit testing ✅
- **Task 3.0.1.4**: Add ESLint configuration focused on issue-catching 🔄 **IMPLEMENTED** (not tested)
- **Task 3.0.1.5**: Create Yarn PnP setup for package management ✅
- **Task 3.0.1.6**: Add build scripts (`yarn build`, `yarn serve`, `yarn test`) ✅

**Acceptance**: `yarn serve` starts development server, `yarn build` creates production bundle, `yarn test` runs tests ✅

### Feature 3.1: 3D Scene with Shelf and Game Boxes ✅
**Context**: Complete 3D scene foundation with shelf model and placeholder game geometry

#### Story 3.1.1: HTML/JavaScript Foundation ✅
- **Task 3.1.1.1**: Create basic HTML page with WebXR capability ✅
- **Task 3.1.1.2**: Add Three.js integration with basic 3D scene ✅
- **Task 3.1.1.3**: Add basic cube geometry for testing ✅

#### Story 3.1.2: 3D Scene Development ✅
- **Task 3.1.2.1**: Import and display Blender-generated shelf model (GLTF) ✅
- **Task 3.1.2.2**: Implement camera controls for desktop testing ✅
- **Task 3.1.2.3**: Add basic movement/navigation system ✅
- **Task 3.1.2.4**: Configure lighting system for 3D scene ✅
- **Task 3.1.2.5**: Add placeholder game box geometry (rectangle/box for texturing) ✅

**Acceptance**: Can view shelf model with placeholder game boxes in desktop 3D mode ✅

---

## ✅ Milestone 4: Steam API Research & Integration
*Goal: Research Steam Web API and integrate user's game library*

### Feature 4.0: Steam Web API Research ✅
#### Story 4.0.1: API Research and Authentication Strategy ✅
- **Task 4.0.1.1**: Research Steam Web API library retrieval endpoints ✅
- **Task 4.0.1.2**: Research authentication and API access options ✅
- **Task 4.0.1.3**: Create research document with implementation recommendations ✅

**Key Finding**: Steam Web API requires domain registration - significant barrier for quick development

### Feature 4.1: AWS Serverless Infrastructure ✅
#### Story 4.1.1: Infrastructure Data Sources ✅
- **Task 4.1.1.1**: Create Terraform infrastructure plan ✅
- **Task 4.1.1.2**: Implement Route53 hosted zone discovery ✅
- **Task 4.1.1.3**: Implement ACM wildcard certificate discovery ✅
- **Task 4.1.1.4**: Test and validate data source discovery ✅

#### Story 4.1.2: Lambda Function and Module ✅
- **Task 4.1.2.1**: Develop Node.js Lambda function with Steam API proxy ✅
- **Task 4.1.2.2**: Create Terraform Lambda module with IAM, Secrets Manager, CloudWatch ✅
- **Task 4.1.2.3**: Deploy Lambda function to AWS ✅
- **Task 4.1.2.4**: Test Lambda health endpoint via curl ✅

#### Story 4.1.3: API Gateway and Custom Domain ✅
- **Task 4.1.3.1**: Create Terraform API Gateway module (HTTP API, Lambda integration) ✅
- **Task 4.1.3.2**: Configure custom domain (`steam-api-dev.wehrly.com`) ✅
- **Task 4.1.3.3**: Set up DNS mapping and SSL certificates ✅
- **Task 4.1.3.4**: Configure CORS headers and endpoint routing ✅
- **Task 4.1.3.5**: Test API Gateway endpoints and CORS with curl ✅

#### Story 4.1.4: Security and Best Practices ✅
- **Task 4.1.4.1**: Remove sensitive values from committed tfvars files ✅
- **Task 4.1.4.2**: Document secure credential handling (env vars, gitignored files) ✅
- **Task 4.1.4.3**: Update .gitignore for Terraform security ✅
- **Task 4.1.4.4**: Add Terraform workflow standards to copilot instructions ✅

**Acceptance**: Secure, modular AWS infrastructure deployed with custom domain and CORS support ✅

### Feature 4.2: Steam API Integration Testing ✅
#### Story 4.2.1: Live Steam API Testing ✅
- **Task 4.2.1.1**: Test `/resolve/{vanityurl}` endpoint with SpiteMonger account ✅
- **Task 4.2.1.2**: Test `/games/{steamid}` endpoint with resolved Steam ID ✅
- **Task 4.2.1.3**: Validate complete Steam API proxy workflow ✅
- **Task 4.2.1.4**: Document any issues and error handling ✅

**Test Results**: Successfully fetched **810 games** from SpiteMonger's Steam library with complete workflow validation

### Feature 4.3: Steam Web API Client ✅
#### Story 4.3.1: WebXR Client Integration ✅
- **Task 4.3.1.1**: Integrate Steam API client into TypeScript WebXR application ✅
- **Task 4.3.1.2**: Add Steam account input/authentication UI ✅
- **Task 4.3.1.3**: Cache game library data for offline use ✅
- **Task 4.3.1.4**: Handle API errors gracefully in WebXR interface

**Key Achievements**:
- Complete localStorage caching system with automatic persistence
- Cache management UI with refresh, clear, and statistics buttons
- Offline mode capability when Steam API is unavailable
- All 26 tests passing including 10 comprehensive cache tests

#### Story 4.3.2: Game Library Integration ✅
- **Task 4.3.2.1**: Implement rate-limited Steam library fetching (max 4 games/sec) ✅
- **Task 4.3.2.2**: Download and cache game icons/artwork
- **Task 4.3.2.3**: Create JSON manifest for WebXR scene population
- **Task 4.3.2.4**: Add offline capability with cached data

**Key Achievements**:
- Progressive loading with configurable rate limiting (4 games/second default)
- Smart cache integration to avoid duplicate API calls
- Real-time progress feedback with visual progress bar and game names
- Playtime-based prioritization for better user experience

#### Story 4.3.3: Code Quality & File Size Management ✅
- **Task 4.3.3.1**: Refactor large files (>500 lines) into focused modules ✅
- **Task 4.3.3.2**: Clean up lint errors and improve code organization ✅
- **Task 4.3.3.3**: Extract main.ts into smaller, focused components ✅

**Acceptance**: All files under 500 lines with clear single responsibilities ✅

---

## 🚧 Milestone 5: Game Art & Visual Integration - **IN PROGRESS**
*Goal: Research Steam metadata, demonstrate game artwork rendering, and establish comprehensive caching strategy*

### Feature 5.1: Steam Game Metadata Research 🚧
**Context**: Deep dive into Steam API responses to understand art assets and display opportunities

#### Story 5.1.1: CDN Access Strategy Research ✅
- **Task 5.1.1.1**: Research Steam CDN and alternative artwork sources ✅
  - Web search Steam CDN rate limiting policies and access patterns ✅
  - Research alternative sources like steamdb.info, steamspy.com for artwork hosting ✅
  - Document rate limits, performance, and availability of different CDN sources ✅
  - Identify which sources provide the best resilience for high-traffic scenarios ✅
- **Task 5.1.1.2**: Test direct CDN access patterns and rate limits - **NEXT TASK**
  - Validate that artwork URLs work without Steam API authentication
  - Test CORS headers and browser access to Steam CDN endpoints
  - Measure CDN response times, reliability, and rate limiting behavior
  - Test alternative sources for performance and availability comparison

**Expected Deliverable**: `docs/cdn-access-strategy.md` with rate limit analysis and source recommendations ✅

**Key Findings**: 
- Steam CDN: ~20 requests/minute rate limit, CORS issues require proxy
- SteamGridDB: 1 req/sec free tier, Pro tier available for higher traffic
- Hybrid strategy recommended: Steam CDN primary + SteamGridDB fallback + aggressive caching

#### Story 5.1.2: Steam Categories and User Profile Research ✅
- **Task 5.1.2.1**: Research Steam category systems and user profile data ✅
  - Research what categories/tags can be retrieved from Steam Web API ✅
  - Investigate Steam Store categories vs. user-defined categories vs. community tags ✅
  - Research user profile endpoints for category preferences and library organization ✅
  - Document available categorization options beyond hardcoded categories ✅
- **Task 5.1.2.2**: Create categorization strategy document ✅
  - Present summary of available category systems in markdown document ✅
  - Recommend approach for dynamic category generation from Steam data ✅
  - Plan integration with existing game loading workflow ✅
  - Design fallback strategies for games without category data ✅

**Expected Deliverable**: `docs/steam-categorization-research.md` with implementation recommendations ✅

**Key Findings**:
- **Steam Store API**: Provides official genres and categories (200 req/5min limit)
- **Community Tags**: Most nuanced categorization reflecting actual player perception
- **Recommended Approach**: Phased implementation starting with Steam Store genres/categories
- **Rate Limit Strategy**: Integrate with existing game loading API calls to avoid additional limits

#### Story 5.1.3: Steam Metadata Structure Analysis **LOWER PRIORITY**
- **Task 5.1.3.1**: Research Steam game metadata structure from API responses
  - Document complete game object structure from Steam API
  - Identify all available image/artwork fields (icon, header, capsule, etc.)
  - Research image URLs, formats, sizes, and CDN patterns
  - Create sample metadata document with real game examples
- **Task 5.1.3.2**: Analyze artwork URL patterns and CDN infrastructure
  - Identify Steam CDN endpoints and URL construction patterns
  - Research image size variants available (small, medium, large, original)
  - Document artwork types: game icons, header images, capsule art, screenshots
  - Map artwork URLs to CDN sources identified in previous research

**Expected Deliverable**: `docs/steam-metadata-research.md` with complete game data structure

### Feature 5.2: Game Art Rendering Demonstration ✅
**Context**: Prove concept by rendering real Steam game artwork on 3D boxes

#### Story 5.2.1: Basic Texture Loading and Application ✅
- **Task 5.2.1.1**: Implement texture loading system for Three.js ✅
  - Create texture loader with error handling and fallbacks ✅
  - Add loading indicators for texture fetch operations ✅
  - Implement texture caching to avoid repeated downloads ✅
  - Handle different image formats and sizes gracefully ✅
- **Task 5.2.1.2**: Apply textures to game box geometry
  - Modify game box creation to accept texture parameters
  - Implement UV mapping for proper artwork display on box faces
  - Add fallback textures for games without artwork
  - Test with variety of image aspect ratios and resolutions

**Expected Deliverable**: Game boxes displaying real Steam artwork

#### Story 5.2.2: Dynamic Art Integration with Steam Data ✅
- **Task 5.2.2.1**: Connect Steam game data to texture rendering ✅
  - Integrate artwork URLs from Steam API responses with texture system ✅
  - Implement progressive artwork loading as games are processed ✅
  - Add visual feedback for artwork loading vs. placeholder states ✅
  - Handle missing or broken artwork URLs gracefully ✅
- **Task 5.2.2.2**: Optimize texture performance for large libraries
  - Implement texture resolution scaling based on viewing distance
  - Add texture memory management and cleanup for large game libraries
  - Implement lazy loading for off-screen game boxes
  - Test performance with 500+ game libraries

**Expected Deliverable**: Seamless integration of Steam artwork with game library loading ✅

**Acceptance**: Steam game library displays with proper artwork in 3D scene

### Feature 5.3: Browser Storage Strategy Research ✅
**Context**: Critical analysis of browser storage capabilities for artwork caching

#### Story 5.3.1: Browser Storage Capabilities Research ✅
- **Task 5.3.1.1**: Research browser storage limits and expansion options ✅
  - Research localStorage size limits in Chrome, Firefox, Safari ✅
  - Investigate IndexedDB capacity limits and quota management ✅
  - Research Persistent Storage API for requesting increased quotas ✅
  - Document browser-specific storage behaviors and limitations ✅
- **Task 5.3.1.2**: Calculate storage requirements for Steam libraries ✅
  - Calculate storage needs for 100, 500, 800+ game libraries ✅
  - Analyze artwork file sizes and compression options ✅
  - Design storage priority system (metadata vs. artwork) ✅
  - Plan storage eviction strategies for space management ✅

**Expected Deliverable**: `docs/browser-storage-strategy.md` with capacity planning

### Feature 5.4: Comprehensive Caching Implementation ✅
**Context**: Robust image caching system with management UI and statistics

#### Story 5.4.1: IndexedDB Image Cache System ✅
- **Task 5.4.1.1**: Implement IndexedDB-based image caching ✅
  - Create ImageManager with IndexedDB storage ✅
  - Add 24-hour expiration and automatic cleanup ✅
  - Implement cache-aware downloading (checks cache before download) ✅
  - Add comprehensive error handling and fallback mechanisms ✅
- **Task 5.4.1.2**: Integrate caching with progressive loading ✅
  - Connect image downloads to Steam game loading workflow ✅
  - Download artwork in background during game processing ✅
  - Add cache statistics and quota monitoring ✅
  - Implement storage quota detection and warnings ✅

#### Story 5.4.2: Cache Management UI ✅
- **Task 5.4.2.1**: Create cache management interface ✅
  - Build collapsible cache management panel ✅
  - Display cache size, item count, and storage quota usage ✅
  - Add visual quota bar with warning states (yellow/red) ✅
  - Include refresh and clear cache controls ✅
- **Task 5.4.2.2**: Integrate UI with main application ✅
  - Add cache UI to main app lifecycle ✅
  - Wire up cache statistics and management methods ✅
  - Implement auto-refresh when panel is expanded ✅
  - Add proper disposal and cleanup ✅

**Expected Deliverable**: Full-featured caching system with user-friendly management UI ✅

**Acceptance**: Image caching works seamlessly with UI for monitoring and management ✅

### Feature 5.5: Enhanced Game Library Caching & UI ✅ **ANALYSIS COMPLETE - READY FOR IMPLEMENTATION**
**Context**: Improved caching strategy with user-friendly cache loading and development controls

**Implementation Plan**: See [`docs/active/feature-5.5-implementation-plan.md`](./active/feature-5.5-implementation-plan.md) for detailed implementation plan.

**Key Findings from Analysis**:
- ✅ **Excellent cache infrastructure** already in place (IndexedDB image cache, localStorage Steam data cache)
- ✅ **Robust progressive loading** with rate limiting and error handling  
- ✅ **Comprehensive cache management UI** via pause menu system
- 🔄 **Missing UI enhancements**: "Load from Cache" button and workflow
- 🔄 **Missing optimization**: Lightweight game list cache for quick availability checks
- 🔄 **Optional enhancement**: Development mode toggle (current 30-game limit is reasonable)

#### Story 5.5.1: Dedicated Game List Cache 🔄 **READY FOR IMPLEMENTATION**
- **Task 5.5.1.1**: Create lightweight game list cache entry *(4-6 hours estimated)*
  - Implement cache entry with app ID + name + playtime for quick lookups
  - Add hasGameListInCache() method for fast availability checks
  - Integrate with existing SimpleCacheManager infrastructure
- **Task 5.5.1.2**: Integrate game list cache with loading workflow
  - Update loadGamesForUser to populate lightweight cache
  - Connect cache availability checks to UI button logic
  - Maintain cache consistency between game list and detailed data

**Expected Deliverable**: Lightweight game list cache supporting quick app ID/name lookups

#### Story 5.5.2: Load from Cache UI Enhancement 🔄 **HIGH PRIORITY - READY FOR IMPLEMENTATION**
- **Task 5.5.2.1**: Add "Load from Cache" button to Steam Account panel *(3-4 hours estimated)*
  - Create conditional button that appears when game list cache is populated  
  - Add cache-based loading workflow that bypasses Steam API calls
  - Implement progress feedback for cache vs API loading states
  - Design button visibility logic using game list cache availability checks
- **Task 5.5.2.2**: Integrate cache loading with game population
  - Connect "Load from Cache" to existing shelf population system
  - Use cached data with fallback to Steam API for missing detailed data
  - Add user feedback distinguishing cache vs API loading

**Expected Deliverable**: User-friendly cache loading interface with progress feedback

#### Story 5.5.3: Development Safety Controls 🔄 **OPTIONAL ENHANCEMENT**
- **Task 5.5.3.1**: Add simple development mode toggle *(1-2 hours estimated)*
  - Create "🔧 Development Mode" checkbox in Steam UI (checked by default)
  - Apply reasonable game limiting when enabled (keep current 30-game limit or reduce to 15-20)
  - Add clear user feedback about game limitation status
  - Avoid complex dev vs prod environment detection (unnecessary scope creep)
- **Task 5.5.3.2**: Implement smart game limiting logic
  - Ensure game limiting applies to both Steam API and cache loading workflows  
  - Use existing playtime-based sorting for most relevant games
  - Provide clear feedback: "Showing 15 of 850 games (development mode)"

**Expected Deliverable**: Simple development mode toggle for safer testing workflows

### Feature 5.6: Settings Menu Polish & Functionality Review 🔄 **DEFERRED TO PHASE 2**
**Context**: Polish pause menu settings UI and connect disconnected functionality from pause menu system implementation

**Rationale**: Focus on environment rendering and core functionality first. Settings menu polish is better appreciated when the overall experience is more complete.

**Identified Issues** (for future implementation):
- Visual: "Game Settings" tab styling inconsistencies, redundant cache information display
- Functional: Disconnected checkboxes (FPS counter, performance stats), unimplemented controls
- Need to audit and connect all settings controls when UI polish becomes priority

**Moved to Phase 2**: Will address settings menu polish and functionality connections after core environment and user experience is solid.

### Future Enhancements (Roadmap TODOs)
- **Game-level cache optimization**: Check if all artwork for a game is cached before downloading
- **Optional cache UI**: Make cache management UI configurable via user settings
- **Advanced cache management**: Per-image management, FIFO eviction, manual cache policies
- **Steam Categories Implementation**: Implement dynamic categorization system from research findings in `docs/steam-categorization-research.md` (Phase 1 scope for basic genre/category integration, Phase 2 for advanced community tags)

**Acceptance**: Clear understanding of browser storage capabilities and realistic limits for game artwork

**Priority Context**: Rate limiting makes browser caching essential for large libraries

---

## 🔄 Milestone 6: Level Layout and Spatial Design - **PHASE 1 COMPLETION**
*Goal: Design and implement the 3D environment layout for optimal game browsing*

### Feature 6.0: Event-Driven Startup Flow 🔄 
**Context**: Use events to control startup flow and defer model generation until game is ready

#### Story 6.0.1: GameStart Event Implementation 🔄
- **Task 6.0.1.1**: Implement GameStart event emission ✅
  - Add `GameStart` event emission after render loop is established and prerequisites complete ✅
  - Use existing EventManager to emit event when game is ready ✅
  - Ensure render loop startup is one of the checked prerequisites ✅ 
  - Document what constitutes "game ready" state for future expansion ✅
- **Task 6.0.1.2**: Connect model generation to GameStart event
  - Move 3D model generation from initialization to GameStart event handler
  - Leverage existing DataLoaded event where appropriate
  - Keep model loading simple and event-driven without overcomplicating

**Expected Deliverable**: Simple event-driven startup with GameStart event controlling model generation

**Future Enhancement**: Multi-event prerequisite system (series of startup events with GameStart requiring all boxes ticked)

**Acceptance**: GameStart event fires after render loop, triggering deferred model generation

**Context**: **Simple paradigm shift** - Leverage events for better startup flow control without overcomplication

### Feature 6.1: Enhanced Shelf Visuals and Materials 🔄 **HIGH PRIORITY**
**Context**: Convert shelf appearance to realistic MDF veneer look with consistent branding colors

#### Story 6.1.1: Shelf Material System Redesign 🔄
- **Task 6.1.1.1**: Research and implement MDF veneer appearance
  - Research visual characteristics of MDF prefab shelving with veneer
  - Design material system to simulate wood veneer texture and appearance
  - Implement glossy white interior surfaces for shelf compartments
  - Add realistic lighting response for veneer and glossy surfaces
- **Task 6.1.1.2**: Establish brand color system with glossy blue accents
  - Define consistent blue color constant for all project visuals
  - Apply glossy blue material to vertical support posts/brackets
  - Ensure blue color is easily adjustable across all shelf components
  - Document brand color guidelines for future visual consistency

**Expected Deliverable**: Realistic MDF veneer shelves with brand-consistent blue accents

#### Story 6.1.2: Wall-Mounted Shelf Implementation 🔄
- **Task 6.1.2.1**: Design wall-mounted shelf geometry
  - Create single-sided shelf models for wall mounting (no backing)
  - Modify existing Blender shelf generation for wall-mount variants
  - Design wall attachment systems and visual mounting hardware
  - Ensure visual consistency with floor shelves while adapting to wall mounting
- **Task 6.1.2.2**: Evaluate shelf type system architecture
  - Design system to support multiple shelf types (floor, wall, corner, etc.)
  - Plan for parameterized shelf generation based on type and placement
  - Create modular system for future shelf type additions
  - Document shelf type architecture for implementation guidance

**Expected Deliverable**: Wall-mounted shelf system with extensible architecture

unmet prerequisit to 6.2:
Games need to spawn onto shelves before we can "optimize" the process of doing so

### Feature 6.2: Game Population and Dynamic Shelf Generation 🔄 **HIGH PRIORITY**
**Context**: Smart shelf spawning and game placement system for optimal space utilization

#### Story 6.2.1: Smart Shelf Generation 🔄
- **Task 6.2.1.1**: Implement conditional shelf spawning
  - Create system where floor shelves spawn only when games are available to populate them
  - Design shelf capacity calculation (games per shelf based on size/spacing)
  - Implement shelf generation triggered by game loading progress
  - Add visual feedback for shelf generation process
- **Task 6.2.1.2**: Game-to-shelf assignment system
  - Implement algorithm to assign games to shelves based on capacity
  - Create smart spacing system for game placement on shelves
  - Add overflow handling for libraries larger than available shelf space
  - Design for future categorization-based shelf assignment (integrate Steam categories research findings)

**Expected Deliverable**: Dynamic shelf generation that scales with user's game library

#### Story 6.2.2: Game Placement and Positioning 🔄
- **Task 6.2.2.1**: Verify and enhance game spawning on shelves
  - Audit current game spawning behavior to confirm games appear on shelves
  - Implement proper game box positioning relative to shelf geometry
  - Add collision detection to prevent game boxes from overlapping
  - Ensure game boxes respect shelf boundaries and spacing
- **Task 6.2.2.2**: Game organization and layout system
  - Implement consistent game spacing and alignment on shelves
  - Add support for different game box sizes (if artwork aspect ratios vary)
  - Create visual hierarchy system for game placement (featured games, etc.)
  - Plan for future sorting and categorization integration

**Expected Deliverable**: Clean game placement system with proper shelf integration

### Feature 6.2.1: Material Generation Performance Optimization 🔄 **MEDIUM PRIORITY**
**Context**: Optimize procedural texture generation to eliminate main thread blocking

#### Story 6.2.1.1: WebWorker Texture Generation 🔄
- **Task 6.2.1.1.1**: Move procedural texture generation to WebWorkers
  - Refactor WoodTextureGenerator, CarpetTextureGenerator, CeilingTextureGenerator for WebWorker execution
  - Implement async texture creation with Promise-based interface
  - Ensure texture transfer from worker to main thread maintains quality
  - Add proper error handling and fallback mechanisms for WebWorker failures
- **Task 6.2.1.1.2**: Implement texture loading feedback system
  - Add loading indicators during texture generation
  - Implement progress reporting for complex material creation
  - Add user feedback for initial material loading delays
  - Ensure smooth UX during background texture generation

**Expected Deliverable**: Non-blocking texture generation that eliminates frame drops during material creation

**Benefits**: Improved runtime performance, better user experience during material creation, eliminates 6+ second blocking behavior

**Priority Rationale**: While lazy loading solved startup delay, texture generation still blocks main thread during material requests. This optimization improves the user experience significantly.

### Feature 6.3: Advanced Lighting and Graphics Settings 🔄 **FUTURE ENHANCEMENT**
**Context**: Configurable lighting system with performance scaling options

#### Story 6.3.1: Lighting Settings System 🔄
- **Task 6.3.1.1**: Design tiered lighting system
  - Create lighting quality settings from "simple" to "ouch my eyes"
  - Design visual control as notched line (|---|---|) interface
  - Plan lighting feature progression: basic → enhanced → advanced → raytracing
  - Research WebGL pathtracing integration possibilities (THREE.js-PathTracing-Renderer)
- **Task 6.3.1.2**: Implement lighting quality levels
  - Level 1 "Simple": Basic ambient + directional lighting
  - Level 2 "Enhanced": Added point lights for shelf illumination
  - Level 3 "Advanced": Shadows, reflections, enhanced materials
  - Level 4 "Ouch My Eyes": Full pathtracing/raytracing if technically feasible

**Expected Deliverable**: Configurable lighting system with performance-appropriate options

**Note**: Pathtracing research link: https://erichlof.github.io/THREE.js-PathTracing-Renderer/

### Feature 6.4: Environment Layout Research **LOWER PRIORITY**
**Context**: Design spatial organization for large game libraries

#### Story 6.4.1: Spatial Organization Patterns
- **Task 6.4.1.1**: Research VR/3D browsing UX patterns
- **Task 6.4.1.2**: Design shelf arrangement and navigation systems
- **Task 6.4.1.3**: Plan categorization and filtering spatial layouts
- **Task 6.4.1.4**: Design user wayfinding and orientation systems

**Expected Deliverable**: Level layout design document

**Acceptance**: Complete spatial design ready for implementation

**Note**: Advanced lighting research includes WebGL pathtracing investigation

---

## Milestone 6.5: Game Categorization and Shelf Organization 🔮 **NEXT MAJOR FEATURE**
*Goal: Replace hardcoded categories with Steam-native genre/category data, enabling dynamic shelf organization*

**Sequencing note (2026-04-05)**: This is the next major feature after Phase 1 proper work completes. Research is complete in `docs/steam-categorization-research.md`.

**Key research findings already available**:
- Steam Store API genres + categories: public, 200 req/5min, accessible via existing app detail calls
- Community tags: most nuanced, user-driven, good for “cozy games”-style groupings
- User-defined library categories: ❌ not available through public API; may exist in local Steam install files — **worth investigating before building API-only solution**
- Rate limiting: batch with existing game-load API calls to avoid extra limits

### Feature 6.5.1: Steam API Categorization 🔮
**Context**: Integrate genre and category data from Steam Store API to replace hardcoded categories

#### Story 6.5.1.1: User-Defined Category Investigation
- **Task 6.5.1.1.1**: Investigate local Steam install for user library categories
  - Check if Steam stores user-defined library categories in local JSON/VDF files (e.g., `userdata/`, `localconfig.vdf`, `sharedconfig.vdf`)
  - Document any accessible user category data and its schema
  - Evaluate whether desktop-only (Electron/local access) or impossible in pure web context
  - **If found**: design integration path; **if not**: document clearly and proceed with API-only approach

**Expected Deliverable**: Definitive answer on user-defined category accessibility; integration plan or clear rationale for API-only approach

#### Story 6.5.1.2: Genre/Category Data Fetching
- **Task 6.5.1.2.1**: Integrate genre/category fetching into game loading workflow
  - Extend existing Steam API calls to capture `genres` and `categories` arrays from app detail responses
  - Add genre/category fields to game data model (`SteamGameData`)
  - Cache category data with 7-day expiration alongside game metadata
  - Handle missing category data gracefully with fallback categorization
- **Task 6.5.1.2.2**: Build category grouping system
  - Implement `CategoryManager` that groups game app IDs by genre/category
  - Design priority system for games with multiple genres (primary genre assignment)
  - Create fallback categories for uncategorized games (playtime-based: “Most Played”, “Recently Added”)

**Expected Deliverable**: Game library with genre/category metadata, `CategoryManager` grouping utility

#### Story 6.5.1.3: Category-Based Shelf Assignment
- **Task 6.5.1.3.1**: Wire categories into shelf layout
  - Use `CategoryManager` output to assign games to category-labelled shelves
  - Update shelf generation to accept category as a first-class parameter
  - Update signage/label system to display category name per shelf section
  - Preserve fallback for games without category (overflow shelf or “Miscellaneous”)
- **Task 6.5.1.3.2**: Category browsing UX
  - Design how categories are navigable in the store layout
  - Plan aisle/spoke arrangement for category groupings (see TBD section in Phase 2 for spoke layout research)
  - Consider wayfinding signals (signs, lighting cues) for category sections

**Expected Deliverable**: VR store where shelves are organized by game genre/category

**Acceptance**: User can walk to a section and see shelves of one genre; no obviously miscategorized games; graceful handling for large libraries

### Feature 6.5.2: Community Tags (Phase 2 candidate) 🔮
**Context**: Richer categorization using Steam community tags. Deferred pending Phase 1 completion, but designed to layer on top of 6.5.1.

- Leverage community tag data from Steam Store API
- Identify top tags across user’s library for dynamic “theme” groupings (e.g., “Cozy”, “Competitive”)
- Allow user to choose preferred grouping: genre-based vs. tag-based vs. playtime-based

**Note**: This may move to Phase 2 depending on timeline pressure.

---

## Milestone 6.6: UI System Normalization and Theming 🔮 **PARALLEL-ELIGIBLE**
*Goal: Establish a consistent, reusable, themeable UI component system before further UI construction*

**Sequencing note (2026-04-05)**: This should happen **before** building any new UI widgets or panels. Normalizing first means all subsequent UI work inherits consistent components. Well-suited for sub-agent parallelization when starting a new work block.

**Rationale**: Current UI has inconsistent styling, disconnected controls, and panels/checkboxes built without shared components. Building more UI on top of this makes the problem bigger. Normalize first.

### Feature 6.6.1: UI Component Audit and Design System 🔮
- **Task 6.6.1.1**: Audit all existing UI elements for inconsistency
  - Inventory all buttons, checkboxes, panels, labels, inputs across pause menu and other panels
  - Document inconsistencies: color, font, padding, border radius, hover/active states
  - Identify which elements are “local one-offs” vs. candidates for shared components
- **Task 6.6.1.2**: Define theme token system
  - Establish CSS custom properties (variables) for: primary/accent colors, background layers, border colors, text colors, spacing scale, radius scale
  - Design for theming: tokens should support future light/dark/custom themes without component rewrites
  - Document token naming convention and usage rules

**Expected Deliverable**: Design token spec (`docs/ui-design-tokens.md`) and audit findings

### Feature 6.6.2: Reusable Component Library 🔮
- **Task 6.6.2.1**: Build base component set using theme tokens
  - Implement shared: `Button`, `Checkbox`, `Toggle`, `SliderInput`, `Panel`, `TabBar`, `Label`
  - All components styled from CSS custom properties only — no hardcoded colors/sizes
  - Add hover/active/disabled/focus states consistently
- **Task 6.6.2.2**: Migrate existing UI panels to shared components
  - Replace inline styles and one-off classes in pause menu, settings panels, Steam UI panel
  - Prioritize: settings panel (most visually inconsistent), cache panel (broken preview), lighting panel
  - Verify no visual regressions after migration

**Expected Deliverable**: Component library; migrated panels using shared components

### Feature 6.6.3: Known UI Bugs and Regressions 🔮
**Context**: Fix known broken/disconnected UI before adding more

- **Task 6.6.3.1**: Fix cache previewer (stopped working)
  - Diagnose why preview is broken, restore functionality
- **Task 6.6.3.2**: Move GPU memory estimates from console/logger into Debug tab
  - Surface `GpuMemoryEstimator` output in the Debug panel instead of only the browser console
- **Task 6.6.3.3**: Audit and connect disconnected settings controls
  - FPS counter checkbox, performance stats checkbox, and other settings panel controls that are wired to UI but not functional
  - Connect or clearly mark each as “not yet implemented” in a consistent way

**Expected Deliverable**: Functional, non-broken UI across all panels; GPU memory visible in Debug tab

**Acceptance**: No obviously broken UI; all checkboxes and toggles have visible effect or placeholder state

---
## Phase 1 Deferred Items

### Story 4.2.2: Error Handling and Reliability - **DEFERRED TO PHASE 2**
- **Task 4.2.2.1**: Test API rate limiting behavior
- **Task 4.2.2.2**: Test invalid Steam ID handling
- **Task 4.2.2.3**: Test network timeout scenarios
- **Task 4.2.2.4**: Implement client-side error recovery

**Rationale**: Basic error handling is sufficient for Phase 1 single-user demos

### Story 4.3.4: Restore Offline Steam Data Support - **DEFERRED**
- **Task 4.3.4.1**: Implement offline mode for cached Steam data
- **Task 4.3.4.2**: Enhanced cache management features

**Rationale**: May be redundant to existing caching functionality - re-evaluate when needed

---

## Current Status

**Active Phase**: Phase 1 - "Ready for Me"  
**Current Milestone**: Milestone 5 - Game Art & Visual Integration  
**Current Feature**: Feature 5.5 - Enhanced Game Library Caching & UI  
**Recently Completed**: ✅ Pause Menu Feature System (archived to `docs/archive/pause-menu-feature-plan-COMPLETED.md`)

**Upcoming High-Priority Items** (Post-Pause Menu):
1. **Enhanced Game Library Caching** (Feature 5.5) - Dedicated game list cache with "Load from Cache" UI
2. **Visual Shelf Improvements** (Feature 6.1) - MDF veneer appearance with brand blue accents
3. **Smart Game Population** (Feature 6.2) - Dynamic shelf spawning and game placement
4. **Steam Categories Integration** (Future) - Implement dynamic categorization from research findings

**Recent Completions**:
- ✅ **Steam Categories Research** (Task 5.1.2) - Delivered comprehensive `docs/steam-categorization-research.md`
- ✅ CDN Access Strategy Research (Task 5.1.1.1) - Delivered `docs/cdn-access-strategy.md`
- ✅ Comprehensive Steam API integration with caching and offline capability
- ✅ Progressive game loading with rate limiting (4 games/second)
- ✅ Image caching system with management UI

**Phase 1 Progress**: ~82% complete
- ✅ Solid technical foundation (Milestones 1-4)
- 🚧 Graphics integration and pause menu cleanup in progress (Milestone 5)  
- 🔄 Enhanced visuals and level layout next (Milestone 6)

---

## 📋 Phase 1 Completion Decision Point

**Note for Claude/Development Team**: Before moving from Phase 1 to Phase 2, prioritize clearing High Priority tech debt to avoid building additional complexity on unstable foundations.

**Recommended Pre-Phase-2 Tech Debt Focus** (see `docs/active/tech-debt.md`):
1. **Architecture & Structure**: Panel/Tab refactor (prevents building on incorrect structure)
2. **User Experience**: Input focus management (critical UX issue), fix double scrollbars
3. **Performance & Architecture**: Prevent redundant image downloads
4. **Code Quality**: Javadoc cleanup (improves development experience)

**Rationale**: Phase 2 infrastructure hardening works best with clean architectural foundations. Address structural issues now to prevent compound complexity later.

**Decision Trigger**: Complete remaining Phase 1 features → Tech debt cleanup sprint → Begin Phase 2
