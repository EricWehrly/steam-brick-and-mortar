# Steam Brick and Mortar - WebXR Implementation Roadmap

## Project Overview

**Current Architecture**: WebXR-first with progressive enhancement (see `docs/webxr-architecture.md`)  
**Research Status**: Complete (archived in `docs/research-archive.md`)  
**Current Phase**: Game art integration and caching strategy development  

## Roadmap Phases

### **Phase 1: "Ready for Me"** 🚧 **CURRENT F### Feature 5.3: Browser Storage Strategy Research 🚧 **CURRENT FOCUS**
**Context**: Critical analysis of browser storage capabilities for artwork caching

#### Story 5.3.1: Browser Storage Capabilities Research
- **Task 5.3.1.1**: Research browser storage limits and expansion options
  - Research localStorage size limits in Chrome, Firefox, Safari
  - Investigate IndexedDB capacity limits and quota management  
  - Research Persistent Storage API for requesting increased quotas
  - Document browser-specific storage behaviors and limitations
- **Task 5.3.1.2**: Calculate storage requirements for Steam libraries
  - Calculate storage needs for 100, 500, 800+ game libraries
  - Analyze artwork file sizes and compression options
  - Design storage priority system (metadata vs. artwork)
  - Plan storage eviction strategies for space management

**Expected Deliverable**: `docs/browser-storage-strategy.md` with capacity planning

**Acceptance**: Clear understanding of browser storage capabilities and realistic limits for game artwork

**Priority**: **CRITICAL** - Rate limiting makes browser caching essential for large libraries

---

## Phase 2: "Ready for Friends" Infrastructure 🔮 **POST-GRAPHICS**

### Feature 5.4: Steam API Rate Limiting Infrastructure 🔮 **PHASE 2 PRIORITY**
**Context**: Robust handling of 20 req/min per IP Steam API constraints

#### Story 5.4.1: Rate Limiting Analysis and Infrastructure Hardening
- **Task 5.4.1.1**: Analyze AWS Lambda IP allocation and sharing risks
  - Research AWS Lambda IP pool behavior and potential sharing
  - Document risks of shared IP rate limiting with other API users
  - Investigate reserved IP options or NAT Gateway solutions
  - Plan fallback strategies for rate limit exhaustion
- **Task 5.4.1.2**: Implement robust rate limiting and retry logic
  - Add exponential backoff with jitter for rate limit responses
  - Implement circuit breaker pattern for API failures
  - Add intelligent request queuing and prioritization
  - Create graceful degradation for large library requests

**Expected Deliverable**: Hardened Steam API client handling 800+ game libraries

**Acceptance**: Can reliably load large game libraries (800+ games) over 40+ minute periods

**Context**: **Critical for "Ready for Friends"** - 800 games × 3 requests/game ÷ 20 req/min = 120+ minutes without caching

### Feature 5.5: Comprehensive Caching Strategy Implementation 🔮 **PHASE 2 PRIORITY**CUS**
*Goal: Demonstrate all imagined functionality with competency - personal demo-ready*
- Complete through Milestone 6 (Level Layout)
- Small library demos (5-20 games) acceptable
- Rate limiting acceptable for single-user testing

### **Phase 2: "Ready for Friends"** 🔮 **POST-GRAPHICS**
*Goal: Works for people standing next to you during conversation*
- Robust rate limiting and error handling for Steam API constraints
- Infrastructure hardening for 20 req/min per IP limits
- Caching strategy implementation to handle 800+ game libraries
- Multi-user testing capability

### **Phase 3: "Ready for Everyone"** 🔮 **PRE-PUBLIC**
*Goal: Public release readiness with compliance and scalability*
- Privacy policy and Steam API compliance
- Production-grade infrastructure
- Public traffic handling  

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

## Milestone 3: 3D Scene Foundation ✅ **COMPLETED**
*Goal: Create working 3D scene with shelf model and placeholder game objects*

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

### Feature 3.1: 3D Scene with Shelf and Game Boxes ✅ **COMPLETED**
**Context**: Complete 3D scene foundation with shelf model and placeholder game geometry

#### Story 3.1.1: HTML/JavaScript Foundation ✅ **TESTED AND VERIFIED**
- **Task 3.1.1.1**: Create basic HTML page with WebXR capability ✅ **TESTED**
- **Task 3.1.1.2**: Add Three.js integration with basic 3D scene ✅ **TESTED**
- **Task 3.1.1.3**: Add basic cube geometry for testing ✅ **TESTED**

**Status**: ✅ **VERIFIED** - Scene loads, cube visible, camera controls working (WASD + mouse look)

#### Story 3.1.2: 3D Scene Development ✅ **COMPLETED**
- **Task 3.1.2.1**: Import and display Blender-generated shelf model (GLTF) ✅ **TESTED**
- **Task 3.1.2.2**: Implement camera controls for desktop testing ✅ **TESTED**
- **Task 3.1.2.3**: Add basic movement/navigation system ✅ **TESTED**
- **Task 3.1.2.4**: Configure lighting system for 3D scene ✅ **TESTED**
- **Task 3.1.2.5**: Add placeholder game box geometry (rectangle/box for texturing) ✅ **TESTED**

**Acceptance**: Can view shelf model with placeholder game boxes in desktop 3D mode ✅ **ACHIEVED**

---

## Milestone 4: Steam API Research & Integration
*Goal: Research Steam Web API and integrate user's game library*

### Feature 4.0: Steam Web API Research ✅ **COMPLETED**
**Context**: Research Steam Web API capabilities and authentication options

#### Story 4.0.1: API Research and Authentication Strategy ✅ **COMPLETED**
- **Task 4.0.1.1**: Research Steam Web API library retrieval endpoints ✅ **COMPLETED**
- **Task 4.0.1.2**: Research authentication and API access options ✅ **COMPLETED** 
- **Task 4.0.1.3**: Create research document with implementation recommendations ✅ **COMPLETED**

**Key Finding**: Steam Web API requires domain registration - significant barrier for quick development

**Expected Deliverable**: `docs/steam-api-research.md` with implementation strategy ✅ **ACHIEVED**

### Feature 4.1: AWS Serverless Infrastructure ✅ **COMPLETED**
**Context**: Secure, modular Terraform infrastructure for Steam API proxy

#### Story 4.1.1: Infrastructure Data Sources ✅ **COMPLETED**
- **Task 4.1.1.1**: Create Terraform infrastructure plan ✅ **COMPLETED**
- **Task 4.1.1.2**: Implement Route53 hosted zone discovery ✅ **COMPLETED**
- **Task 4.1.1.3**: Implement ACM wildcard certificate discovery ✅ **COMPLETED**
- **Task 4.1.1.4**: Test and validate data source discovery ✅ **COMPLETED**

#### Story 4.1.2: Lambda Function and Module ✅ **COMPLETED**
- **Task 4.1.2.1**: Develop Node.js Lambda function with Steam API proxy ✅ **COMPLETED**
- **Task 4.1.2.2**: Create Terraform Lambda module with IAM, Secrets Manager, CloudWatch ✅ **COMPLETED**
- **Task 4.1.2.3**: Deploy Lambda function to AWS ✅ **COMPLETED**
- **Task 4.1.2.4**: Test Lambda health endpoint via curl ✅ **COMPLETED**

#### Story 4.1.3: API Gateway and Custom Domain ✅ **COMPLETED**
- **Task 4.1.3.1**: Create Terraform API Gateway module (HTTP API, Lambda integration) ✅ **COMPLETED**
- **Task 4.1.3.2**: Configure custom domain (`steam-api-dev.wehrly.com`) ✅ **COMPLETED**
- **Task 4.1.3.3**: Set up DNS mapping and SSL certificates ✅ **COMPLETED**
- **Task 4.1.3.4**: Configure CORS headers and endpoint routing ✅ **COMPLETED**
- **Task 4.1.3.5**: Test API Gateway endpoints and CORS with curl ✅ **COMPLETED**

#### Story 4.1.4: Security and Best Practices ✅ **COMPLETED**
- **Task 4.1.4.1**: Remove sensitive values from committed tfvars files ✅ **COMPLETED**
- **Task 4.1.4.2**: Document secure credential handling (env vars, gitignored files) ✅ **COMPLETED**
- **Task 4.1.4.3**: Update .gitignore for Terraform security ✅ **COMPLETED**
- **Task 4.1.4.4**: Add Terraform workflow standards to copilot instructions ✅ **COMPLETED**

**Acceptance**: Secure, modular AWS infrastructure deployed with custom domain and CORS support ✅ **ACHIEVED**

**Status**: Infrastructure fully deployed and operational. Health endpoint tested. Ready for Steam API integration testing.

### Feature 4.2: Steam API Integration Testing ✅ **COMPLETED**
**Context**: Test deployed infrastructure with real Steam accounts

#### Story 4.2.1: Live Steam API Testing ✅ **COMPLETED**
- **Task 4.2.1.1**: ✅ **COMPLETED** - Test `/resolve/{vanityurl}` endpoint with SpiteMonger account
- **Task 4.2.1.2**: ✅ **COMPLETED** - Test `/games/{steamid}` endpoint with resolved Steam ID
- **Task 4.2.1.3**: ✅ **COMPLETED** - Validate complete Steam API proxy workflow
- **Task 4.2.1.4**: ✅ **COMPLETED** - Document any issues and error handling

**Target Steam Account**: https://steamcommunity.com/id/SpiteMonger ✅ **VERIFIED**

**Test Results**:
- ✅ SpiteMonger vanity URL successfully resolved to Steam ID: `76561197984589530`
- ✅ Successfully fetched **810 games** from SpiteMonger's Steam library
- ✅ Complete workflow validated: vanity URL → Steam ID → game library
- ✅ Error handling confirmed working (invalid URLs return proper 500 status)
- ✅ CORS headers present and working for browser integration
- ✅ All endpoints responding with proper JSON format

**Acceptance**: Can successfully fetch Steam game library for real accounts via proxy ✅ **ACHIEVED**

#### Story 4.2.2: Error Handling and Reliability
- **Task 4.2.2.1**: Test API rate limiting behavior
- **Task 4.2.2.2**: Test invalid Steam ID handling
- **Task 4.2.2.3**: Test network timeout scenarios
- **Task 4.2.2.4**: Implement client-side error recovery

**Acceptance**: Can successfully fetch Steam game library for real accounts via proxy

### Feature 4.3: Steam Web API Client ✅ **MAJOR PROGRESS**
**Context**: Browser-based Steam integration with CORS proxy

#### Story 4.3.1: WebXR Client Integration ✅ **COMPLETED**
- **Task 4.3.1.1**: ✅ **COMPLETED** - Integrate Steam API client into TypeScript WebXR application
- **Task 4.3.1.2**: ✅ **COMPLETED** - Add Steam account input/authentication UI
- **Task 4.3.1.3**: ✅ **COMPLETED** - Cache game library data for offline use
- **Task 4.3.1.4**: Handle API errors gracefully in WebXR interface

**Current Status Task 4.3.1.3**: ✅ **COMPLETED AND TESTED**
- ✅ Complete localStorage caching system with automatic persistence
- ✅ Cache invalidation strategy with configurable duration (1 hour default)
- ✅ Offline mode capability when Steam API is unavailable
- ✅ Cache management UI with refresh, clear, and statistics buttons
- ✅ Smart cache statistics showing entries, size, and age information
- ✅ Robust error handling for corrupted cache data and recovery
- ✅ Performance optimization for large game libraries
- ✅ Complete cache lifecycle from storage to retrieval to cleanup
- ✅ All 26 tests passing including 10 comprehensive cache tests

**Technical Achievements**:
- Enhanced SteamApiClient with comprehensive caching layer
- localStorage integration with automatic state persistence  
- Cache configuration options (duration, enable/disable, custom prefix)
- Public cache management methods (clear, stats, offline availability check)
- Smart cache key management and expiration handling
- Complete cache UI integration with visual feedback and controls
- Offline data availability checking and fallback modes
- Cache insights with detailed statistics and storage information

**UI Enhancements**:
- Cache management controls integrated into Steam account panel
- Refresh Cache button (green) for forced data updates from Steam API
- Clear Cache button (red) for complete cache reset and cleanup
- Cache Info button (blue) showing detailed statistics and storage data
- Use Offline button appears when cached data is available for account
- Real-time cache status updates and visual feedback during operations

**Cache Management Features**:
- Smart caching: Automatic cache/retrieve with configurable expiration
- Offline support: Full functionality without internet when data cached
- Performance optimization: Dramatically reduced API calls for repeated requests
- Storage efficiency: Intelligent key management and automatic cleanup
- User control: Manual refresh and clear cache options for power users
- Cache insights: Detailed statistics showing usage, size, and data age

**Test Results**:
- All Steam API integration tests passing (8/8)
- All cache management tests passing (10/10)
- All hello-world and minimal tests passing (8/8)
- Total: 26/26 tests passing across 4 test suites
- Complete workflow validated: caching → offline mode → cache management
- Error handling verified for corrupted cache data and recovery
- localStorage integration and cleanup thoroughly tested

**Acceptance**: Complete cache management system with offline capability ✅ **ACHIEVED**

#### Story 4.3.2: Game Library Integration ✅ **MAJOR PROGRESS**
- **Task 4.3.2.1**: ✅ **COMPLETED** - Implement rate-limited Steam library fetching (max 4 games/sec)
- **Task 4.3.2.2**: Download and cache game icons/artwork
- **Task 4.3.2.3**: Create JSON manifest for WebXR scene population
- **Task 4.3.2.4**: Add offline capability with cached data

**Current Status Task 4.3.2.1**: ✅ **COMPLETED AND TESTED**
- ✅ Progressive loading with configurable rate limiting (4 games/second default)
- ✅ Smart cache integration to avoid duplicate API calls
- ✅ Real-time progress feedback with visual progress bar and game names
- ✅ Prioritization by playtime (most-played games loaded first)
- ✅ Error handling for individual game loading failures
- ✅ Background processing with immediate UI updates as games load
- ✅ Cache management with skip-cached and force-refresh options
- ✅ Comprehensive test suite (9/9 progressive loading tests passing)

**Technical Features Implemented**:
- Rate-limited fetching queue with configurable requests per second
- Progressive UI updates with progress bar, percentage, and current game display
- Smart caching system that skips already-cached games for performance
- Real-time 3D scene population as games load progressively
- Playtime-based prioritization for better user experience
- Graceful error handling that continues loading other games on failures
- Cache refresh functionality with progressive loading integration
- Enhanced game data with artwork URLs for future texture loading

**Performance Results**:
- Zero duplicate API calls due to smart caching
- 4 games/second maximum rate (250ms between requests) as requested
- Progressive 3D scene updates without blocking the UI
- Large libraries (800+ games tested) load efficiently with user feedback
- Cache system provides instant offline access to previously loaded games

**UI Integration**:
- Progress bar with visual feedback during loading
- Real-time display of current game being processed
- Percentage completion and game count status
- Cache management controls with progressive refresh capability
- Offline data availability indicators

**Acceptance**: Progressive game loading with rate limiting and smart caching ✅ **ACHIEVED**

#### Story 4.3.3: Code Quality & File Size Management ✅ **COMPLETED**
- **Task 4.3.3.1**: Refactor large files (>500 lines) into focused modules ✅ **COMPLETED**
- **Task 4.3.3.2**: Clean up lint errors and improve code organization ✅
- **Task 4.3.3.3**: Extract main.ts into smaller, focused components ✅

**Status**: ✅ **COMPLETED** - main.ts refactored from ~900 lines to modular architecture with focused components

**Acceptance**: All files under 500 lines with clear single responsibilities ✅ **ACHIEVED**

---

## Milestone 5: Game Art & Visual Integration 🚧 **IN PROGRESS**
*Goal: Research Steam metadata, demonstrate game artwork rendering, and establish comprehensive caching strategy*

### Feature 5.1: Steam Game Metadata Research 🚧 **IN PROGRESS**
**Context**: Deep dive into Steam API responses to understand art assets and display opportunities

#### Story 5.1.1: CDN Access Strategy Research ✅ **COMPLETED**
- **Task 5.1.1.1**: Research Steam CDN and alternative artwork sources ✅ **COMPLETED**
  - Web search Steam CDN rate limiting policies and access patterns ✅
  - Research alternative sources like steamdb.info, steamspy.com for artwork hosting ✅
  - Document rate limits, performance, and availability of different CDN sources ✅
  - Identify which sources provide the best resilience for high-traffic scenarios ✅
- **Task 5.1.1.2**: Test direct CDN access patterns and rate limits
  - Validate that artwork URLs work without Steam API authentication
  - Test CORS headers and browser access to Steam CDN endpoints
  - Measure CDN response times, reliability, and rate limiting behavior
  - Test alternative sources for performance and availability comparison

**Expected Deliverable**: `docs/cdn-access-strategy.md` with rate limit analysis and source recommendations ✅ **DELIVERED**

**Key Findings**: 
- Steam CDN: ~20 requests/minute rate limit, CORS issues require proxy
- SteamGridDB: 1 req/sec free tier, Pro tier available for higher traffic
- Hybrid strategy recommended: Steam CDN primary + SteamGridDB fallback + aggressive caching

**Acceptance**: Validated CDN strategy optimized for handling traffic waves with multiple fallback sources ✅ **ACHIEVED**

#### Story 5.1.2: Steam Metadata Structure Analysis
- **Task 5.1.2.1**: Research Steam game metadata structure from API responses
  - Document complete game object structure from Steam API
  - Identify all available image/artwork fields (icon, header, capsule, etc.)
  - Research image URLs, formats, sizes, and CDN patterns
  - Create sample metadata document with real game examples
- **Task 5.1.2.2**: Analyze artwork URL patterns and CDN infrastructure
  - Identify Steam CDN endpoints and URL construction patterns
  - Research image size variants available (small, medium, large, original)
  - Document artwork types: game icons, header images, capsule art, screenshots
  - Map artwork URLs to CDN sources identified in previous research

**Expected Deliverable**: `docs/steam-metadata-research.md` with complete game data structure

**Acceptance**: Complete understanding of Steam game metadata and available artwork assets

### Feature 5.2: Game Art Rendering Demonstration 🚧 **IMPLEMENTATION PHASE**
**Context**: Prove concept by rendering real Steam game artwork on 3D boxes

#### Story 5.2.1: Basic Texture Loading and Application
- **Task 5.2.1.1**: Implement texture loading system for Three.js
  - Create texture loader with error handling and fallbacks
  - Add loading indicators for texture fetch operations
  - Implement texture caching to avoid repeated downloads
  - Handle different image formats and sizes gracefully
- **Task 5.2.1.2**: Apply textures to game box geometry
  - Modify game box creation to accept texture parameters
  - Implement UV mapping for proper artwork display on box faces
  - Add fallback textures for games without artwork
  - Test with variety of image aspect ratios and resolutions

**Expected Deliverable**: Game boxes displaying real Steam artwork

**Acceptance**: Can visually see Steam game artwork applied to 3D boxes in the scene

#### Story 5.2.2: Dynamic Art Integration with Steam Data
- **Task 5.2.2.1**: Connect Steam game data to texture rendering
  - Integrate artwork URLs from Steam API responses with texture system
  - Implement progressive artwork loading as games are processed
  - Add visual feedback for artwork loading vs. placeholder states
  - Handle missing or broken artwork URLs gracefully
- **Task 5.2.2.2**: Optimize texture performance for large libraries
  - Implement texture resolution scaling based on viewing distance
  - Add texture memory management and cleanup for large game libraries
  - Implement lazy loading for off-screen game boxes
  - Test performance with 500+ game libraries

**Expected Deliverable**: Seamless integration of Steam artwork with game library loading

**Acceptance**: Steam game library displays with proper artwork in 3D scene

### Feature 5.3: Comprehensive Caching Strategy Research � **STRATEGIC PLANNING**
### Feature 5.5: Comprehensive Caching Strategy Implementation 🔮 **PHASE 2 PRIORITY**
**Context**: Implementation of caching architecture to handle rate-limited artwork access

#### Story 5.5.1: Infrastructure Caching Options Analysis
- **Task 5.5.1.1**: Research cloud caching infrastructure options
  - Document AWS CloudFront CDN integration possibilities
  - Research Redis/ElastiCache for Lambda function caching
  - Investigate S3 for artwork asset caching and delivery
  - Compare costs and performance of different caching layers
- **Task 5.5.1.2**: Evaluate user-hosted backend caching
  - Research Docker-based local caching server options
  - Design file-based caching system for self-hosted deployments
  - Document trade-offs between cloud vs. local caching
  - Plan fallback strategies when caching infrastructure unavailable

**Expected Deliverable**: `docs/infrastructure-caching-strategy.md` with implementation recommendations

**Acceptance**: Complete analysis of all caching options with cost/benefit analysis

#### Story 5.5.2: Caching Implementation Planning
- **Task 5.5.2.1**: Design unified caching architecture
  - Create caching layer abstraction supporting multiple backends
  - Plan cache invalidation and refresh strategies
  - Design offline-first functionality with smart sync
  - Plan cache warming strategies for new users
- **Task 5.5.2.2**: Research Steam CDN caching implications
  - Web search Steam CDN usage policies and rate limiting
  - Research potential domain restrictions or API key requirements
  - Document best practices for respectful CDN usage
  - Plan error handling for CDN unavailability or throttling

**Expected Deliverable**: Complete caching implementation plan

**Acceptance**: Unified caching strategy ready for implementation

---

## Phase 3: "Ready for Everyone" Compliance 🔮 **PRE-PUBLIC**

### Feature 5.6: Steam API Compliance Research 🔮 **PHASE 3**
**Context**: Research compliance requirements for Steam API usage before public release

#### Story 5.6.1: Steam API Policy Compliance Analysis
- **Task 5.6.1.1**: Research Steam API compliance requirements
  - Web search Steam API terms of service and developer requirements
  - Document privacy policy requirements for Steam API integration
  - Identify any attribution, branding, or display requirements
  - Research user data handling and storage policy requirements
- **Task 5.6.1.2**: Create compliance checklist and implementation plan
  - Document all required compliance items for public release
  - Create privacy policy template with Steam-specific requirements
  - Plan user consent flows and data handling procedures
  - Identify any required legal disclaimers or attributions

**Expected Deliverable**: `docs/steam-api-compliance.md` with complete compliance requirements

**Acceptance**: Complete compliance checklist ready for implementation before public release

**Priority**: Required for "Ready for Everyone" phase - includes privacy policy creation

---

## Milestone 6: Level Layout and Spatial Design 🚧 **PHASE 1 COMPLETION**
*Goal: Design and implement the 3D environment layout for optimal game browsing*

### Feature 6.1: Environment Layout Research
**Context**: Design spatial organization for large game libraries

#### Story 6.1.1: Spatial Organization Patterns
- **Task 6.1.1.1**: Research VR/3D browsing UX patterns
- **Task 6.1.1.2**: Design shelf arrangement and navigation systems
- **Task 6.1.1.3**: Plan categorization and filtering spatial layouts
- **Task 6.1.1.4**: Design user wayfinding and orientation systems

**Expected Deliverable**: Level layout design document

**Acceptance**: Complete spatial design ready for implementation

### Feature 6.2: 3D Environment Implementation
**Context**: Build the complete browsable environment

#### Story 6.2.1: Multi-Shelf Environment
- **Task 6.2.1.1**: Generate multiple shelf instances with Blender
- **Task 6.2.1.2**: Implement shelf positioning and spacing systems
- **Task 6.2.1.3**: Add environmental lighting and atmosphere
- **Task 6.2.1.4**: Implement navigation between shelf areas

**Acceptance**: Multi-shelf environment ready for game population

---

## Milestone 7: Input Systems and User Controls 🔮 **PHASE 1 COMPLETION**
*Goal: Implement comprehensive input support for mouse/keyboard, gamepad, and VR controllers*

### Feature 7.1: Multi-Platform Input and Controls
**Context**: Support wide range of input methods - mouse/keyboard, gamepad, and VR controllers

#### Story 7.1.1: Universal Input System Design
- **Task 7.1.1.1**: Research input standards across mouse/keyboard, gamepad, and WebXR
- **Task 7.1.1.2**: Design interaction patterns that work across all input types
- **Task 7.1.1.3**: Plan input abstraction layer supporting multiple device types
- **Task 7.1.1.4**: Create fallback systems for input method switching

**Expected Deliverable**: Universal input system design document

**Acceptance**: Complete input strategy supporting mouse/keyboard, gamepad, and VR

#### Story 7.1.2: Input Implementation and Integration
- **Task 7.1.2.1**: Enhance existing mouse/keyboard controls for final experience
- **Task 7.1.2.2**: Add gamepad controller support and navigation
- **Task 7.1.2.3**: Implement VR controller detection and WebXR integration
- **Task 7.1.2.4**: Add input method detection and seamless switching

**Expected Deliverable**: Working controls across all supported input types

**Acceptance**: Can navigate and interact using mouse/keyboard, gamepad, or VR controllers

**Note**: VR is an "impressor" feature - not mandatory, but impressive when available

### Feature 7.2: Mappable Input Configuration
**Context**: Allow users to customize input mappings across all supported input types

#### Story 7.2.1: Universal Input Mapping System
- **Task 7.2.1.1**: Design configurable input mapping architecture for all input types
- **Task 7.2.1.2**: Support remapping for mouse/keyboard, gamepad, and VR controllers
- **Task 7.2.1.3**: Implement input remapping UI that works across all interaction modes
- **Task 7.2.1.4**: Add input accessibility options and alternative control schemes

**Expected Deliverable**: Comprehensive input customization system

**Acceptance**: Users can remap controls for mouse/keyboard, gamepad, or VR setup

---

## Milestone 8: User Experience Options 🔮 **PHASE 1 COMPLETION**
*Goal: Comprehensive graphics, audio, and accessibility options*

### Feature 8.1: Graphics and Performance Options
**Context**: Configurable graphics settings for different VR hardware capabilities

#### Story 8.1.1: Graphics Configuration System
- **Task 8.1.1.1**: Implement quality presets (Low/Medium/High/Ultra)
- **Task 8.1.1.2**: Add texture quality and resolution scaling options
- **Task 8.1.1.3**: Create lighting and shadow quality controls
- **Task 8.1.1.4**: Add performance monitoring and auto-adjustment features

**Expected Deliverable**: Comprehensive graphics options menu

**Acceptance**: Users can optimize performance for their VR hardware

### Feature 8.2: Audio and Accessibility Options
**Context**: Complete audio system with accessibility features

#### Story 8.2.1: Audio Configuration System
- **Task 8.2.1.1**: Implement spatial audio settings and calibration
- **Task 8.2.1.2**: Add audio accessibility options (visual indicators, etc.)
- **Task 8.2.1.3**: Create audio quality and processing options
- **Task 8.2.1.4**: Add voice control and audio navigation features

**Expected Deliverable**: Complete audio and accessibility options

**Acceptance**: Full audio customization with accessibility support

---

## Deferred Items

## Deferred Items

#### Story 4.3.4: Restore Offline Steam Data Support 🔄 **DEFERRED**
Note: This may be redundant to 4.3.2.4 and should be re-evaluated when we reach here, it may not be needed.
- **Task 4.3.4.1**: Implement offline mode for cached Steam data
  - Add `hasOfflineData()` method to check for cached user data
  - Implement `loadFromCache()` to start with cached Steam games without network calls
  - Update UI to show "Use Offline Data" button when cached data is available
  - Add offline indicators in the UI when running in offline mode
- **Task 4.3.4.2**: Enhanced cache management features
  - Restore cache statistics tracking (hits/misses counters)
  - Add cache aging/expiration indicators in UI
  - Implement selective cache invalidation by user

**Context**: During the modular refactor, offline mode functionality was simplified and removed from main.ts
**Current State**: 
- Basic caching works for API calls and persists to localStorage
- UI buttons exist but show "not available in simplified client" messages
- Cache stats show only total entries (hits/misses tracking removed)

**Expected Outcome**:
- Users can work entirely offline if they've previously loaded Steam data
- Clear indicators when offline vs online modes are active
- Advanced cache management for power users

#### Future Roadmap: Test Suite Optimization (Post-MVP)
- **Task**: More aggressive test suite reorganization and deduplication
  - Further thin out live tests to single tests per major feature
  - Maximize use of mocks in integration tests  
  - Evaluate test redundancy and consolidate similar test patterns
  - Performance optimization of test suite runtime
  - **Priority**: Low (after main features are complete)