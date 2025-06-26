# Research Prompt: Alternative Technology Approaches for SteamVR Blockbuster Shelf

## Context & Current Approach

We're building a "SteamVR Blockbuster Shelf" - a VR environment where users can browse their Steam game library in a 3D video store setting and launch games by grabbing them in VR.

**Current Approach**: SteamVR Environment + VScript (Lua) + External Node.js Tool
- VScript handles VR interaction and 3D environment
- External tool handles Steam Web API and game launching
- Communication via file-based IPC (JSON files + signal files)
- Requires complex testing of file system communication

**Key Question**: Are there alternative technological approaches that could simplify development, improve iteration speed, or provide better features?

## Requirements Analysis

### Must-Have Features:
1. **3D VR Environment**: Display Steam games as interactive 3D objects on virtual shelves
2. **VR Interaction**: Grab/touch games in VR to select and launch them
3. **Steam Integration**: Fetch user's game library via Steam Web API
4. **Game Launching**: Launch selected Steam games via Steam protocol URLs
5. **Cross-Platform**: Windows primary, with potential Linux/Mac support

### Nice-to-Have Features:
1. **Auto-Start Capability**: Launch as "desktop replacement" when VR headset connects
2. **Seamless Transitions**: Launch games without exposing desktop/breaking VR immersion
3. **SteamVR Ecosystem Integration**: Workshop sharing, social features
4. **3D Audio**: Spatial audio for immersive video store atmosphere
5. **Customization**: User-configurable shelf layouts, themes

### Development Constraints:
1. **Rapid Iteration**: Minimize time between code change and testable result
2. **CLI-Driven Development**: Reduce "human-in-the-middle" feedback loops
3. **Docker/Containerization**: Consistent development environment
4. **Minimal Complexity**: Avoid unnecessary IPC, file watching, etc.

## Research Task

For each alternative approach, create two documents:

### 1. `{alternative}.research.md` - Detailed Research
Include:
- **Technology Overview**: What is this approach and how does it work?
- **VR Capabilities**: Native VR support, OpenXR/SteamVR integration, hand tracking
- **Steam Integration**: How to access Steam Web API, launch games, detect Steam state
- **Development Workflow**: IDE support, debugging, hot reload, CLI tools
- **Deployment**: Distribution methods, installation requirements, auto-start capabilities  
- **Ecosystem**: Community, documentation, plugin/extension systems
- **Limitations**: Known constraints, performance considerations, platform restrictions
- **Examples**: Existing VR applications using this approach
- **Learning Curve**: Developer onboarding time and complexity

### 2. `{alternative}.estimates.md` - Implementation Timeline
Include:
- **Phase 1: Basic VR Environment** (3D space, basic interaction)
- **Phase 2: Steam Integration** (API calls, game data display)
- **Phase 3: Game Launching** (Launch games, handle transitions)
- **Phase 4: Polish & Features** (Audio, effects, customization)
- **Time Estimates**: Realistic development time for each phase
- **Risk Factors**: Potential blockers or unknown complexity areas
- **Comparison**: How this compares to current SteamVR approach timeline

## Alternative Approaches to Research

### 1. Standalone VR Application (Godot)
- **Focus**: Godot Engine with OpenXR/SteamVR support
- **Key Questions**: 
  - How easy is Steam Web API integration in Godot?
  - Can Godot launch external applications (Steam games)?
  - What's the development iteration speed?
  - Can it auto-start as VR desktop replacement?

### 2. Standalone VR Application (Unity)
- **Focus**: Unity with XR Toolkit
- **Key Questions**:
  - Unity's Steam integration capabilities
  - VR development workflow and iteration speed
  - Deployment and auto-start options
  - Licensing and cost considerations

### 3. SteamVR Dashboard Overlay
- **Focus**: Native C++ SteamVR overlay application
- **Key Questions**:
  - SteamVR Dashboard API capabilities
  - Can overlays launch games seamlessly?
  - Development complexity vs. current approach
  - Auto-start and integration possibilities

### 4. Desktop VR Launcher Application
- **Focus**: Traditional desktop app that switches to VR mode
- **Key Questions**:
  - How to seamlessly transition desktop → VR?
  - Steam integration from desktop applications
  - Can it replace SteamVR Home when in VR mode?
  - Development tools and iteration speed

### 5. WebXR + Progressive Web App
- **Focus**: Browser-based VR using WebXR APIs
- **Key Questions**:
  - Can WebXR access Steam Web API (CORS issues)?
  - How to launch desktop applications from browser?
  - VR performance and feature completeness
  - Installation and auto-start capabilities

### 6. Unreal Engine VR Application
- **Focus**: Unreal Engine with VR template
- **Key Questions**:
  - Unreal's Steam integration and external app launching
  - Blueprint vs. C++ for rapid iteration
  - VR development workflow efficiency
  - Deployment and auto-start options

## Research Methodology

For each approach:

1. **Official Documentation Review**: Read official docs, tutorials, API references
2. **Community Research**: Forums, Reddit, Discord, GitHub issues for real-world experiences
3. **Prototype Feasibility**: Can you build a minimal "Hello VR + Steam API" example?
4. **Performance Considerations**: VR rendering requirements, memory usage, frame rates
5. **Integration Testing**: How easy is it to call Steam Web API and launch Steam games?
6. **Development Tooling**: Debugging, hot reload, CLI automation, Docker support

## Success Criteria

The research should help us answer:

1. **Is there a simpler approach** than our current SteamVR VScript + IPC architecture?
2. **Which approach offers the fastest development iteration speed?**
3. **Which approach best supports the "auto-start VR desktop replacement" nice-to-have?**
4. **What are the trade-offs** between development speed, feature completeness, and ecosystem integration?
5. **Should we continue with SteamVR VScript approach or pivot to an alternative?**

## Output Format

Create these files in `docs/alternatives/`:
- `godot.research.md` + `godot.estimates.md`
- `unity.research.md` + `unity.estimates.md`
- `steamvr-overlay.research.md` + `steamvr-overlay.estimates.md`
- `desktop-vr.research.md` + `desktop-vr.estimates.md`
- `webxr.research.md` + `webxr.estimates.md`
- `unreal.research.md` + `unreal.estimates.md`

Plus a final comparison document:
- `alternatives-comparison.md` - Side-by-side comparison with recommendations

The goal is to make an informed decision about whether to continue with our current approach or pivot to a potentially better alternative before investing more development time.
