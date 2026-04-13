# Phase 2: "Ready for Friends" - Infrastructure Hardening

## Phase Overview

**Pre-Phase-2 Intermission Track:** see docs/roadmaps/intermission-before-phase2.md for transition tasks (lint baseline, tech debt scheduling, branch polish).

**Goal**: Works for people standing next to you during conversation

**Scope**: Infrastructure hardening and multi-user capability

**Key Requirements**:
- Handle 800+ game libraries efficiently (120+ minute loading without caching)
- AWS Lambda IP pool analysis and mitigation
- Comprehensive caching infrastructure (browser + cloud)
- Error recovery and graceful degradation
- Multi-user testing capability

**Entry Criteria**: Phase 1 complete - all imagined functionality demonstrated with personal demo capability

**VR Gate (2026-04-05)**:
- Treat Phase 2 as **desktop/flatscreen-first** by default.
- Defer VR-specific interaction implementation until after Phase 2 core stability milestones (network hardening, caching, UI normalization baseline, and input architecture groundwork) are in place.
- Permit VR work in Phase 2 only as gated spikes or low-risk compatibility checks, not as the primary delivery track.

---

## Feature 5.3: Menu Keyboard Navigation System 🔮
**Context**: Essential UX improvement for accessibility and power user efficiency

### Story 5.3.1: Pause Menu Keyboard Navigation
- **Task 5.3.1.1**: Implement tab navigation for pause menu
  - Add keyboard focus management system for pause menu tabs
  - Implement Tab/Shift+Tab cycling through all interactive elements
  - Add visual focus indicators for keyboard navigation
  - Ensure proper focus restoration when opening/closing pause menu
- **Task 5.3.1.2**: Add keyboard shortcuts for common pause menu actions
  - Implement number keys (1-5) for direct tab switching
  - Add Enter/Space key activation for buttons and options
  - Include Escape key for closing menus and returning to game
  - Add Arrow key navigation within individual tab panels
- **Task 5.3.1.3**: Settings panel keyboard navigation
  - Enable keyboard navigation for all settings controls
  - Add proper focus management for dropdowns and sliders
  - Implement keyboard shortcuts for toggling settings
  - Ensure screen reader compatibility for accessibility

**Expected Deliverable**: Fully keyboard-navigable pause menu system

**Acceptance**: All pause menu functionality accessible via keyboard without mouse dependency

### Story 5.3.2: Steam UI Panel Keyboard Navigation
- **Task 5.3.2.1**: Steam ID input keyboard enhancements
  - Add proper keyboard focus management for Steam ID input field
  - Implement Enter key submission for Steam ID lookup
  - Add keyboard shortcuts for cache management buttons
  - Include Tab navigation through all Steam UI controls
- **Task 5.3.2.2**: Steam library keyboard navigation
  - Add keyboard navigation for game selection and browsing
  - Implement arrow keys for game grid navigation
  - Add keyboard shortcuts for game launching and actions
  - Include search functionality with keyboard input

**Expected Deliverable**: Keyboard-accessible Steam integration interface

**Acceptance**: Complete Steam functionality available via keyboard navigation

**Context**: **High Priority for "Ready for Friends"** - Essential accessibility feature for power users and inclusive design

---

## Feature 5.4: Network Request Management & Rate Limiting Infrastructure 🔮 **LATE PHASE 2 (PRE-FRIENDS SIGN-OFF)**
**Context**: Comprehensive network traffic optimization and rate limiting before any multi-user testing

**Sequencing (2026-04-05)**:
- Defer active implementation until **late Phase 2** (after core Input/UX stabilization work in Milestones 7/8)
- Execute before Phase 2 exit/sign-off so friends/family usage is still protected by robust rate limiting
- Treat this as a **late-phase hardening pass**, not an early Phase 2 blocker

### Story 5.4.1: Network Traffic Audit and Optimization Analysis
- **Task 5.4.1.1**: Audit all network calls and patterns
  - Document every API endpoint called (Steam Web API, Steam Store API, Steam CDN)
  - Measure request volumes per game/library load cycle
  - Identify parallelization bottlenecks and opportunities for batching
  - Analyze cache hit/miss patterns and effectiveness
  - Document current network behavior under various scenarios (small/large libraries, cache states)
- **Task 5.4.1.2**: Design batching and parallelization strategy
  - Plan artwork download batching to avoid slamming CDN
  - Design intelligent request queuing with priority levels
  - Create request deduplication system for concurrent requests
  - Plan progressive loading strategy (e.g., visible games first, background loading for rest)
  - Design request cancellation for games scrolled out of view

**Expected Deliverable**: `docs/network-traffic-audit.md` with comprehensive analysis and optimization plan

**Acceptance**: Complete understanding of network patterns with concrete batching/parallelization improvements identified

**Context**: **CRITICAL - MUST COMPLETE BEFORE FRIENDS RELEASE** - Current behavior acceptable for single-user testing but unsuitable for multi-user scenarios

### Story 5.4.2: Client-Side Rate Limiting Implementation  
- **Task 5.4.2.1**: Implement universal rate limiter for all client network calls
  - Create RateLimiter utility class with configurable limits per endpoint type
  - Add rate limiting for Steam CDN artwork downloads (~50 concurrent max)
  - Add rate limiting for Steam Store API appdetails calls (~200 per 5 min)
  - Implement request queue with priority system (user-visible content prioritized)
  - Add exponential backoff for rate limit responses (HTTP 429)
- **Task 5.4.2.2**: Implement batched artwork loading
  - Replace parallel artwork loading with batched sequential approach
  - Load artwork in chunks (e.g., 10 games at a time) with delays between batches
  - Prioritize visible games based on camera position and viewport
  - Add progress reporting for long-running batch operations
  - Implement cancellable batch operations for user navigation changes

**Expected Deliverable**: Production-ready client-side rate limiting across all network calls

**Acceptance**: No more than 50 concurrent CDN requests, Steam Store API respects 200/5min limit, smooth loading experience with batching

### Story 5.4.3: Lambda Inbound Rate Limiting (Planning Phase)
- **Task 5.4.3.1**: Research AWS API Gateway rate limiting options
  - Document AWS API Gateway throttling capabilities and limits
  - Research usage plans and API keys for per-client rate limiting
  - Investigate AWS WAF for advanced rate limiting rules
  - Compare cost/complexity of different rate limiting approaches
- **Task 5.4.3.2**: Design Lambda rate limiting strategy
  - Plan rate limit tiers (per-IP, per-user, global)
  - Design rate limit response patterns and error messages
  - Plan monitoring and alerting for rate limit breaches
  - Document instrumentation requirements (deferred to later phase)

**Expected Deliverable**: `docs/lambda-rate-limiting-plan.md` with implementation strategy

**Acceptance**: Complete plan for Lambda-side rate limiting ready for implementation in later phase

**Context**: Planning only at this phase - implementation deferred until instrumentation phase

### Story 5.4.4: Steam API Rate Limiting Infrastructure Hardening
- **Task 5.4.4.1**: Analyze AWS Lambda IP allocation and sharing risks
  - Research AWS Lambda IP pool behavior and potential sharing
  - Document risks of shared IP rate limiting with other API users
  - Investigate reserved IP options or NAT Gateway solutions
  - Plan fallback strategies for rate limit exhaustion
- **Task 5.4.4.2**: Implement robust rate limiting and retry logic
  - Add exponential backoff with jitter for rate limit responses
  - Implement circuit breaker pattern for API failures
  - Add intelligent request queuing and prioritization
  - Create graceful degradation for large library requests

**Expected Deliverable**: Hardened Steam API client handling 800+ game libraries

**Acceptance**: Can reliably load large game libraries (800+ games) over 40+ minute periods

**Context**: **Critical for "Ready for Friends"** - 800 games × 3 requests/game ÷ 20 req/min = 120+ minutes without caching

**IMPORTANT**: Stories 5.4.1 and 5.4.2 are **LATE PHASE 2 BLOCKERS** for friends/family release sign-off. Current network behavior is acceptable for solo testing while earlier Phase 2 milestones are in progress, but must be hardened before Phase 2 completion.

---

## Feature 5.5: Comprehensive Caching Strategy Implementation 🔮
**Context**: Implementation of caching architecture to handle rate-limited artwork access

### Story 5.5.1: Infrastructure Caching Options Analysis
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

### Story 5.5.2: Caching Implementation Planning
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

### Story 5.5.3: Caching Infrastructure Implementation
- **Task 5.5.3.1**: Implement multi-layer caching system
  - Browser-level caching (localStorage/IndexedDB)
  - Lambda function caching layer
  - CloudFront CDN integration for artwork delivery
  - S3 backing store for cached artwork assets
- **Task 5.5.3.2**: Implement cache warming and preloading
  - Background cache warming for popular games
  - Intelligent preloading based on user library analysis
  - Cache sharing between users for common artwork
  - Automated cache maintenance and cleanup

**Expected Deliverable**: Production-ready multi-layer caching system

**Acceptance**: Can handle traffic waves of 500+ concurrent users with minimal origin requests

---

## Feature 5.6: Enhanced Store Signage System 🔮
**Context**: Immersive 3D signage elements to organize and highlight game content sections

### Story 5.6.1: "New Releases" 3D Signage
- **Task 5.6.1.1**: Implement 3D blocky letter signage system
  - Create 3D text geometry using THREE.js TextGeometry or ExtrudeGeometry
  - Design chunky, blockbuster-style letterforms with depth and dimension
  - Implement configurable text depth, bevel, and styling options
  - Add proper material handling for 3D text surfaces (front, back, sides)
- **Task 5.6.1.2**: Position "NEW RELEASES" sign with angled mounting
  - Position sign on designated wall section (likely back wall or prominent side wall)
  - Implement 15-degree rotation for dynamic, eye-catching angle
  - Calculate proper positioning relative to game shelves and store layout
  - Ensure sign visibility from multiple viewing angles in VR space
- **Task 5.6.1.3**: Integrate with existing signage system
  - Extend SignageRenderer to support both 2D canvas signs and 3D blocky text
  - Maintain compatibility with existing flat signage for category markers
  - Add configuration options to choose between 2D and 3D signage styles
  - Implement consistent styling and color schemes across signage types

**Expected Deliverable**: 3D "NEW RELEASES" signage with angled wall mounting

**Acceptance**: Prominent 3D letterforms visible at 15-degree angle, integrated with store layout

**Context**: **Medium Priority** - Enhances store atmosphere and visual organization. Should be implemented alongside game content population features for cohesive store experience.

---

## Milestone 7: Input Systems and User Controls 🔮
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

### Feature 7.3: Advanced Camera Control Options
**Context**: Enhanced camera controls with configurable options for improved user experience

#### Story 7.3.1: Camera Roll Control System
- **Task 7.3.1.1**: Implement Q/E roll control toggle system
  - Add settings panel option to enable/disable Q/E camera roll controls
  - Default to disabled for simplified control scheme
  - Provide easy restoration of functionality via boolean toggle
  - Include clear labeling and help text for roll controls
- **Task 7.3.1.2**: Add camera roll acceleration and speed limiting
  - Implement configurable maximum roll speed setting
  - Add floating-point acceleration value towards max roll speed
  - Create smooth acceleration curve for responsive but controlled rolling
  - Include settings panel controls for roll speed customization

**Expected Deliverable**: Configurable camera roll system with smooth acceleration

**Acceptance**: Users can toggle roll controls on/off and customize roll speed/acceleration

#### Story 7.3.2: Movement Speed and Acceleration System
- **Task 7.3.2.1**: Implement configurable movement acceleration
  - Add acceleration system for WASD movement controls
  - Implement configurable maximum movement speeds per direction
  - Create smooth acceleration curves for all movement types
  - Plan architecture to support future vertical movement controls
- **Task 7.3.2.2**: Add movement speed customization options
  - Include movement speed settings in controls panel
  - Provide separate speed controls for different movement types
  - Add preset options (Slow/Normal/Fast) with custom override
  - Include real-time preview of movement speed changes

**Expected Deliverable**: Comprehensive movement speed and acceleration system

**Acceptance**: Users can customize movement speeds and acceleration for all control types

#### Story 7.3.3: Camera Reset and Player Positioning
- **Task 7.3.3.1**: Implement camera view reset functionality
  - Add hotkey to reset camera orientation to default view
  - Include "Reset Camera" button in pause menu controls section
  - Preserve player position while resetting camera orientation only
  - Add smooth transition animation for camera reset
- **Task 7.3.3.2**: Add player position reset features
  - Implement "Return to Origin" functionality in help menu
  - Add hotkey to teleport player back to initial spawn location
  - Include confirmation dialog for position reset to prevent accidents
  - Reset both camera position and orientation to initial state
- **Task 7.3.3.3**: Enhanced camera reset options
  - Add partial reset options (orientation only vs. full reset)
  - Implement "Reset to Last Safe Position" for error recovery
  - Include settings to customize default camera position and orientation
  - Add visual feedback during reset operations

**Expected Deliverable**: Comprehensive camera and position reset system

**Acceptance**: Users can easily reset camera view and return to spawn with clear controls and feedback

---

## Milestone 7.5: UI System Redesign 🔮
*Goal: Consistent, scalable UI design system ready for VR implementation*

### Feature 7.5.1: UI Design System Consolidation
**Context**: Create unified UI design language that works across desktop and VR

#### Story 7.5.1: Base UI Optimization and Standardization
- **Task 7.5.1.1**: In-scene game search/omnibar
  - Omnibar-like search interface that appears in place of the Steam profile UI, once there are games to search
  - Design 3D box element with hourglass icon and omnibar appearance
  - Implement game search functionality using GameFinder utility
  - Enable spotlight highlighting of search results in scene
  - Support search by game name or Steam appid
  - Provide visual feedback for found/not-found games
  - Make recognizable and accessible in 3D space
- **Task 7.5.1.2**: Steam profile input design refinement
  - Reduce default width footprint for better screen utilization
  - Enhanced expand-on-interaction behavior for better UX
  - Consistent styling with other UI components
- **Task 7.5.1.3**: Convert 2D signage to 3D elements
  - Replace signs as planes with 3d rectangular cubes with some 'depth' to them in the world. They mainly should stop getting "backface culled".
  - Enhance visual depth and spatial integration in the scene
  - Improve readability and immersion with proper 3D typography
  - Maintain performance while adding dimensional detail
- **Task 7.5.1.4**: UI component standardization
  - Establish consistent color scheme, typography, and spacing
  - Standardize button sizes, input fields, and panel layouts
  - Create reusable UI component library
- **Task 7.5.1.5**: VR-ready UI architecture planning
  - Design UI components that can adapt to 3D spatial layout
  - Plan transition strategy from 2D overlay to 3D spatial UI
  - Consider interaction patterns for touch/controller input

**Expected Deliverable**: Unified UI design system with VR-ready architecture

**Acceptance**: All UI components follow consistent design language and are prepared for VR transition

---

## Milestone 8: User Experience Options 🔮
*Goal: Comprehensive graphics, audio, and accessibility options*

### Feature 8.1: Graphics and Performance Options
**Context**: Configurable graphics settings for different VR hardware capabilities

**NOTE**: Phase 1 defaults to enhanced/high-quality textures at 2048x2048 resolution for development testing. User toggles will allow optimization for different hardware in Phase 2.

#### Story 8.1.1: Graphics Configuration System
- **Task 8.1.1.1**: Implement quality presets (Low/Medium/High/Ultra)
- **Task 8.1.1.2**: Add texture quality and resolution scaling options
  - **Include**: Performance/Quality toggle for procedural textures (basic vs enhanced)
  - **Include**: Texture resolution scaling (512px/1024px/2048px/4096px options)
  - **Current Default**: 2048x2048 enhanced textures (Phase 1 high-fidelity approach)
- **Task 8.1.1.3**: Create lighting and shadow quality controls
- **Task 8.1.1.4**: Add performance monitoring and auto-adjustment features

**Expected Deliverable**: Comprehensive graphics options menu

**Acceptance**: Users can optimize performance for their VR hardware

#### Story 8.1.2: Controls and Interaction Settings Panel
- **Task 8.1.2.1**: Implement dedicated controls settings section
  - Create organized controls panel within settings menu
  - Include movement speed, camera sensitivity, and input options
  - Integrate camera roll controls toggle and speed settings
  - Add keybinding configuration interface for future expansion
- **Task 8.1.2.2**: Add interaction and accessibility controls
  - Include interaction sensitivity and timing controls
  - Add accessibility options for movement and camera controls
  - Implement preset control schemes for different user preferences
  - Include preview/test area for trying control changes

**Expected Deliverable**: Comprehensive controls settings panel integrated with graphics options

**Acceptance**: Users can access and modify all movement, camera, and interaction settings from unified interface

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

## Milestone 8.5: Interactive Scene Controls 🔮
*Goal: In-world interactive elements that enhance immersion and usability*

### Feature 8.5.0: Lighting Presets / Atmospheres
**Context**: Lighting system currently has quality levels but no distinct *mood* presets. Different atmospheres should have first-class support.

**Requested presets** (owner-specified, keep separate from additional suggestions):
- **Flat / Wolfenstein-mode**: Uniform ambient, no dynamic lights — like the pre-dynamic-lights era of the codebase. Fast, nostalgic, great fallback.
- **Blacklight room**: UV-style ambient with glowing accent colors. Pairs naturally with the planned basement room variant.

**Tone knob presets (corporate → dank scale):**
A single knob/control with named positions controlling the overall emotional tone of lighting:
- **Corporate**: Bright, even, neutral/cool — high ambient, minimal shadow, productive feel
- **Cheery**: Warm-white, upbeat, slightly directional — old-school store with good bulbs
- **Dim**: Cozy warm, soft shadows, lower ambient — closing-time video store feel
- **Dank**: Very low ambient, strong contrast, cool shadows — sketchy basement vibes

---

### Feature 8.5.1 (revised): Dongle Switch Panel
**Context**: Second lighting control panel design — runs alongside current panel, not replacing it.

**Visual design concept**:
- A row of retro dongle-style rocker switches (on/off positions) — one per light in the scene
- Each switch has a tiny LED indicator at its tip reflecting current light state
- Switches labeled with a strip of hand-torn masking tape (canvas texture)
- Human-readable labels for each light group (not raw WebGL names)
  - Raw WebGL names retained as tooltips for developer context
- A tone knob to one side — rotates through the 4 preset positions (corporate / cheery / dim / dank)

**Implementation note**: This is a design-phase item. Wait until UI normalization baseline (Phase B) is in place before building. Requires the lighting preset system (Feature 8.5.0) to exist first.

**Additional lighting atmosphere ideas** (brainstorm, subject to review):
- **Golden hour / warm close**: Warm directional from low angle, long shadows — cozy evening feel
- **Neon city**: Deep dark ambient, colored point lights (magenta/cyan/green) — cyberpunk
- **Candle / firelight**: Flickering warm orange point lights scattered in scene
- **Museum**: Cool neutral overhead spots, minimal ambient — clean gallery feel

Design note: the lighting preset system and the room variant system (cozy basement, etc.) should be loosely coupled — any lighting preset should work in any room, even if some combos are especially curated.

### Feature 8.5.1: Interactive Lighting Controls
**Context**: Physical interactive elements in the 3D scene for lighting control - UI lighting panel incarnated as interactive 3D objects

#### Story 8.5.1.1: Interactive Light Switch/Dimmer System
- **Task 8.5.1.1**: Design interactive lighting control objects
  - Create 3D light switch and dimmer models as interactive elements
  - Design intuitive interaction patterns for VR and mouse/keyboard
  - Plan integration with existing lighting system and UI controls
  - Research interaction feedback (visual, audio, haptic for VR)
- **Task 8.5.1.2**: Implement switch/dimmer interaction mechanics
  - Add raycasting and collision detection for interactive elements
  - Implement click/touch interaction for light switches
  - Create drag/slide interaction for dimmer controls
  - Add visual feedback for interaction states (hover, active, etc.)
- **Task 8.5.1.3**: Integrate with existing lighting system
  - Connect interactive controls to current lighting panel functionality
  - Maintain synchronization between 3D controls and UI panel
  - Implement smooth lighting transitions triggered by 3D interactions
  - Add persistence for lighting state set via interactive controls
- **Task 8.5.1.4**: Polish and accessibility features
  - Add sound effects for switch clicks and dimmer adjustments
  - Implement visual indicators for control states and ranges
  - Ensure accessibility with keyboard/gamepad fallback controls
  - Add help text or tooltips for discovering interactive elements

**Expected Deliverable**: Interactive 3D lighting controls integrated with scene lighting system

**Acceptance**: Users can control lighting by interacting with 3D switches and dimmers in the scene, with full parity to UI panel controls

**Context**: **Advanced Feature for Late Phase 2** - Requires stable input system, lighting system, and interaction framework. Adds significant immersion value.

---

## Phase 2 Error Handling and Reliability

### Story 4.2.2: Enhanced Error Handling and Reliability
**Context**: Robust error handling moved from Phase 1 for infrastructure focus

- **Task 4.2.2.1**: Test API rate limiting behavior
  - Document Steam API rate limiting responses and patterns
  - Test behavior under sustained high-volume requests
  - Validate rate limit detection and backoff strategies
  - Test recovery time and rate limit reset behavior
- **Task 4.2.2.2**: Test invalid Steam ID handling
  - Test error responses for malformed Steam IDs
  - Validate graceful handling of non-existent accounts
  - Test private profile and access denied scenarios
  - Implement user-friendly error messaging
- **Task 4.2.2.3**: Test network timeout scenarios
  - Test behavior under network connectivity issues
  - Validate timeout handling for slow responses
  - Test partial failure scenarios (some endpoints working)
  - Implement intelligent retry with exponential backoff
- **Task 4.2.2.4**: Implement client-side error recovery
  - Add automatic retry logic for transient failures
  - Implement fallback data sources when primary fails
  - Add user notifications for persistent errors
  - Create diagnostic tools for troubleshooting connectivity

**Expected Deliverable**: Production-ready error handling system

**Acceptance**: Can gracefully handle all failure modes without breaking user experience

---

## Infrastructure Monitoring and Observability

### Feature 8.3: Infrastructure Monitoring
**Context**: Production-ready monitoring for multi-user environment

#### Story 8.3.1: Comprehensive Monitoring System
- **Task 8.3.1.1**: Implement Lambda function monitoring
  - CloudWatch metrics for Lambda performance and errors
  - Custom metrics for Steam API response times and rates
  - Alerting for rate limit approaching and Lambda failures
  - Dashboard for real-time infrastructure health
- **Task 8.3.1.2**: Implement client-side telemetry
  - Anonymous usage metrics for feature adoption
  - Performance metrics for large library loading
  - Error reporting for client-side failures
  - User experience metrics (load times, interaction patterns)
- **Task 8.3.1.3**: Implement caching performance monitoring
  - Cache hit/miss ratios across all caching layers
  - Cache size and growth monitoring
  - Cache invalidation and refresh success rates
  - Performance impact measurement of caching layers

**Expected Deliverable**: Complete monitoring and observability system

**Acceptance**: Can detect and diagnose issues before they impact users

---

## Test Infrastructure Hardening

### Feature 8.4: Test Network Isolation and Reliability 🔮
**Context**: Prevent external network calls in tests for reliability and performance

#### Story 8.4.1: Automatic Test Network Isolation
- **Task 8.4.1.1**: Implement global network isolation for test environment
  - Research and implement Vitest configuration for automatic network blocking
  - Add global test setup that intercepts and blocks external network calls
  - Create clear error messages indicating blocked calls and how to mock them
  - Ensure compatibility with existing fetch mocking patterns
- **Task 8.4.1.2**: Implement MSW (Mock Service Worker) for comprehensive network mocking
  - Set up MSW to intercept network calls at the browser/Node level
  - Create catch-all handler that fails unmocked network requests
  - Add ability to selectively allow specific external calls when needed
  - Integrate with existing test architecture and mocking patterns
- **Task 8.4.1.3**: Performance and reliability improvements
  - Eliminate 5+ second timeout delays caused by external network calls
  - Prevent accidental hits to real CDNs or APIs during testing
  - Ensure test suite reliability in CI/CD environments without internet
  - Add performance benchmarking to detect slow tests

**Expected Deliverable**: Automatic network isolation system preventing external calls in tests

**Acceptance**: Test suite fails fast with clear errors for any external network attempts, eliminating timeout delays and improving reliability

**Context**: **High Priority Late Phase 2** - Critical for infrastructure reliability as system scales to multi-user testing. Addresses current 5+ second test delays and prevents production API hits during development.

---

## TBD: Features Under Consideration for Phase 2

*These features were identified during Phase 1 development but deferred pending Phase 2 scope prioritization*

### UI/UX Polish & Consistency
- **Steam Profile Input Refinement**: Reduce input width to 50%, expand on focus with smooth transitions
- **Pause Menu Polish**: Smooth animations, advanced accessibility features, VR-ready UI architecture
- **Design System**: Consistent UI components, theme/customization system, multi-language support
- **Advanced Performance Options**: Hardware-specific graphics presets and auto-detection

### Advanced Store Layout & Categorization
- **Dynamic Shelf Arrangement System**: Organize shelves by game categories with multiple layout patterns
  - **Context**: Arrange shelves as spokes per category, also as giant aisles running past - enhances store navigation and game organization
  - **Priority**: Medium-Low - Enhances user experience after core infrastructure is solid
  - **Dependencies**: Requires stable GPU instancing system, game categorization data from Steam API
  - **Timeline**: Estimated 4-6 days for spoke/aisle layout algorithms after Phase 2 core infrastructure complete
  - **Deferral Reason**: Should wait until after first batch of "Ready for Friends" infrastructure items are complete

### Visual Effects & Immersion

- **Architectural Columns & Decorative Variants**: Add optional in-room decorative columns (including Roman/Corinthian style variants)
  - **Context**: Atmosphere and theme support; can break up long wall runs and frame aisles
  - **Priority**: Low / nice-to-have (late Phase 2)
  - **Dependencies**: Stable room/layout baseline

- **Waist-Height Counter Area**: Add a service counter/check-out zone near front-of-store
  - **Context**: Strong video-store vibe anchor; helps orient player in space
  - **Priority**: Low / nice-to-have (late Phase 2)
  - **Dependencies**: Room zoning/layout pass

- **Working Analog Wall Clock**: In-world analog clock prop with real-time hand movement
  - **Context**: Ambient polish detail; should be inexpensive and highly thematic
  - **Priority**: Low / nice-to-have (late Phase 2)
  - **Dependencies**: Prop/scene update loop hook

- **Personalized Store Sign**: Display user's vanity URL (e.g. `SpiteMonger's Steam Library`) as a stylized sign in the store entrance
  - **Context**: `SteamUser.vanity_url` is already available from the API response; signage renderer hookup only
  - **Priority**: Low / nice-to-have (late Phase 2)
  - **Note**: Needs graceful fallback for anonymous/no-vanity-url users

- **Anonymous / "Empty Store" Mode (Dev Utility)**: Pre-populate store with free-to-play games (e.g. TF2 appid 440) when no Steam user is loaded
  - **Context**: Useful as a Playwright/visual debugging baseline so scene contains actual games without API auth
  - **Priority**: Medium for tooling (moves up if Playwright visual tests become meaningful debugging loop), low for user-facing

- **Room Variant — Cozy Basement Gaming Library**: Alternate room style with lower ceilings, warmer lighting, carpet, wood paneling
  - **Priority**: Low / Phase 2 atmosphere pass
  - **Dependencies**: Room variant/style system (same infra as columns etc.)

- **Poster Walls from User Media**: Optional wall posters sourced from user-owned public screenshots/artwork where available
  - **Context**: Atmosphere + personalization; could rotate featured images by category/zone
  - **Priority**: Low / nice-to-have (late Phase 2)
  - **Dependencies**: rights/privacy review, API/source reliability, fallback poster pack

#### Story 6.1.3: Wall/Ceiling Texture Visual Polish 🔮 **POST-PHASE-1 CAPSTONE**
**Context**: Wall and ceiling textures need a second pass before showing to friends. Currently in place but design quality needs improvement. Sequenced after Phase 1 proper work is complete — important for first impressions, but not imperative for core functionality.

- **Task 6.1.3.1**: Revisit wood plank wall texture design
  - Evaluate current plank proportions, color variation, and grain fidelity
  - Improve or replace texture to feel like a real video store back wall
  - Ensure grain direction, plank scale, and tiling read correctly at VR scale
- **Task 6.1.3.2**: Revisit popcorn ceiling texture design
  - Evaluate bumpiness, color, and tiling at ceiling scale
  - Improve or replace texture for natural overhead appearance in VR
- **Task 6.1.3.3**: Evaluate Godot-based procedural texture generation (optional)
  - Investigate using Godot’s material/shader system to generate and export textures
  - If promising: prototype one texture, compare quality vs. current worker-based approach

**Acceptance**: Surfaces don’t visibly read as procedurally generated when standing in the scene

- **Dissolve Animation System**: Implement smooth entrance animations for store geometry
  - **Context**: Eliminate jarring "pop" appearance when scene loads with immersive materialization effects
  - **Research**: See `docs/research/dissolve-animation-research.md` for technical findings and implementation approach
  - **Priority**: Medium - Enhances user experience but not critical for core functionality
  - **Dependencies**: Requires resolution of THREE.js material sharing issues and animation coordination
  - **Timeline**: Estimated 5-7 days for complete implementation after material system refactoring

- **Atmospheric Dust Mote System**: Add floating dust particles throughout store environment
  - **Context**: Enhance immersion and sense of space with subtle animated particles
  - **Tasks**:
    - Implement particle system for dust motes visible in light beams
    - Add dancing particles within diagnostic spotlight columns
    - Create ambient dust throughout store (not just in light)
    - Optimize particle count for VR performance
  - **Priority**: Low - Visual polish/"juice" for later phases
  - **Dependencies**: None - standalone enhancement
  - **Timeline**: 1-2 days for basic implementation

- **Animated Spotlight Effects**: Enhance diagnostic spotlight visual quality with shader effects
  - **Context**: Improve spotlight beam aesthetics from "aging lampshade" to "enchantment"
  - **Status**: Basic improvements completed (narrower beam, warm white color, better falloff)
  - **Future Tasks**:
    - Add animated feathering/edge shimmer to light column (shader-based)
    - Implement subtle pulsing or breathing effect for magical quality
    - Add volumetric light ray rendering for visible beam column
  - **Priority**: Low - Visual enhancement for immersion
  - **Dependencies**: Dust mote system for enhanced light beam visibility
  - **Timeline**: 2-3 days for shader implementation

### Developer Experience & Extensibility
- **Plugin/Extension System**: Community additions and modular panel architecture
- **Enhanced Debug Tools**: Advanced Three.js scene inspection and performance profiling
- **Hot Reload System**: Live preview for UI/content changes during development
- **Automated Testing**: Visual regression testing and performance benchmarking

**Note**: These items will be evaluated against Phase 2 core infrastructure priorities. UX polish items may be deferred to Phase 3 depending on infrastructure complexity and timeline.

---

## Phase 2 Completion Criteria

**Infrastructure Resilience**:
- ✅ Can handle 800+ game libraries without rate limiting issues
- ✅ Graceful degradation when rate limits are hit
- ✅ Multi-layer caching prevents origin server overload
- ✅ Comprehensive error handling and recovery

**Multi-User Capability**:
- ✅ Multiple users can use system simultaneously
- ✅ No shared rate limiting between users
- ✅ Cached content shared efficiently between users
- ✅ Monitoring detects issues before user impact

**Production Readiness**:
- ✅ Comprehensive input support (mouse/keyboard, gamepad, VR)
- ✅ Graphics and performance options for different hardware
- ✅ Audio system with accessibility features
- ✅ Complete monitoring and observability

**Exit Criteria**: System works reliably for multiple concurrent users with large Steam libraries, demonstrating production-level infrastructure without public compliance requirements


---

## Scheduled Inputs from Session Dossier (Apr 6-7)

These items are carried from session-dossier-2026-04-06.md into Phase 2 planning where appropriate:

### Early Phase 2
- Steam user tags pipeline (SteamSpy-backed): Lambda exposure -> client categorization
- Artwork fetch-on-demand policy (game-box art first, detail art deferred)
- Detail-page artwork metadata listing (source + cache)
- "Sort by" in-scene affordance and sort mode switch UI

### Mid / General Phase 2
- SceneManager/DataManager scene access pattern consolidation
- Sort policy ownership fix (off SteamApiClient)
- Generic sort utility (sortByFields)
- Readonly event payload hardening
- SignageRenderer singleton/static-method evaluation

### Deferred beyond current Phase 2 scope
- Physical neon sign mounting hardware pass (ceiling bracket/cable)
- Multi-instance genre sections architecture (same game in multiple thematic views)