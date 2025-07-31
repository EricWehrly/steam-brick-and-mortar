# Links and References

## Blender Python API Documentation
- **Blender Python API Overview**: https://docs.blender.org/api/current/info_overview.html
  - *Note: Documentation for Blender's Python scripting capabilities, module system, class registration, and best practices. Shows that Blender supports normal Python imports and module organization.*

- **Blender Python API Quickstart**: https://docs.blender.org/api/current/info_quickstart.html
  - *Note: Getting started guide for Blender Python scripting, including running scripts and module organization patterns.*

## Steam API Documentation
https://partner.steamgames.com/doc/webapi/ISteamUser#getownedgames

## SteamVR Documentation
https://steamcommunity.com/sharedfiles/filedetails/?id=2914155613&utm_source=chatgpt.com

https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting?utm_source=chatgpt.com

### Official SteamVR Development Resources
- **SteamVR Environment Scripting**: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting
  - *Note: Main documentation for SteamVR scripting system, covers VScript/Lua integration, entity manipulation, and VR-specific APIs.*

- **SteamVR VScript API Reference**: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting/API
  - *Note: Complete API reference for all VScript functions, classes, and enumerations available in SteamVR environments. Critical for entity creation, physics, audio, and VR interaction.*

- **SteamVR Map Scripts**: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting/Map_Scripts
  - *Note: Documentation for map-specific scripts, callback functions (OnInit, OnPlayerSpawned, etc.), and script system integration.*

- **SteamVR Lua Scripting Intro**: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Scripting/Lua_Scripting_Intro
  - *Note: Tutorial covering Lua scripting basics in SteamVR, addon structure, debugging, and practical examples.*

- **SteamVR Environment Getting Started**: https://developer.valvesoftware.com/wiki/SteamVR/Environments/Getting_Started
  - *Note: Tutorial for creating SteamVR environments, Hammer editor usage, and addon development workflow.*

### Key Implementation Insights from Research
- **Entity Creation**: Use `SpawnEntityFromTableSynchronous()` for immediate prop creation
- **File I/O**: `FileToString()` and `StringToFile()` for JSON manifest integration  
- **VR Interaction**: `CDestinationsPropItemPhysics` class for grabbable game props
- **Physics Props**: `prop_destinations_item_physics` classname for VR-interactive objects
- **Sound System**: `EmitSoundOn()` and `StartSoundEvent()` for 3D positioned audio
- **Hand Tracking**: `CPropVRHand` class and `OnPickedUp`/`OnDropped` entity hooks
- **Debugging**: Console log filtering to "VScript" channel for development

## WebXR Development Resources

### Core WebXR APIs
- [WebXR Device API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
- [WebXR Fundamentals](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Fundamentals)
- [WebXR Input and Input Sources](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs)
- [WebXR Performance Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Performance)

### Three.js WebXR Integration
- [Three.js WebXRManager](https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager)
- [Three.js WebXR Examples](https://threejs.org/examples/?q=webxr)
- [GLTFLoader Documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [PositionalAudio for VR](https://threejs.org/docs/#api/en/audio/PositionalAudio)

### Browser Protocol Handling
- [Custom Protocol Handler Registration](https://web.dev/custom-handlers/)
- [Steam Protocol URLs Documentation](https://developer.valvesoftware.com/wiki/Steam_browser_protocol)

### CORS Solutions
- [Understanding CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Steam Web API Documentation](https://steamcommunity.com/dev)