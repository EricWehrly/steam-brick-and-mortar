# WebXR-First Architecture Decision

## Executive Summary

After comprehensive research across multiple VR approaches, **WebXR-first with progressive enhancement** is confirmed as the optimal architecture for the Steam Brick and Mortar project.

**Key Decision**: WebXR + Three.js core with optional Electron packaging for enhanced desktop integration.

## Technology Stack

### Core Technologies
- **VR Runtime**: WebXR API (browser-native VR support)
- **3D Engine**: Three.js (mature WebGL library with WebXR integration)
- **Physics**: Cannon.js (plug-and-play physics, integrated with Three.js)
- **Asset Pipeline**: Blender → GLTF → Three.js GLTFLoader

### Progressive Enhancement Strategy
1. **Phase 1**: Pure WebXR PWA (works on any WebXR browser)
2. **Phase 2**: Electron wrapper for local file system access and Steam launching
3. **Phase 3**: Platform-specific builds if performance requires

## Architecture Overview

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

## Key Benefits

✅ **Cross-Platform by Default**: Works on any VR headset with any OS  
✅ **Fastest Iteration Speed**: Hot reload, browser DevTools, instant testing  
✅ **Universal Distribution**: Share via URL, no installation required  
✅ **Future-Proof**: Web technologies, packageable as native apps later  
✅ **Eliminates IPC Complexity**: No file-based communication needed  
✅ **Keep Blender Pipeline**: Generated 3D assets work perfectly in WebXR  

## Implementation Path

### WebXR Core Workflow
1. **WebXR app** runs in browser with VR session management
2. **Three.js** loads Blender-generated GLTF shelf models
3. **Steam API** fetches user's game library and artwork (via CORS proxy)
4. **WebXR interactions** trigger direct Steam protocol URLs (`steam://run/<appid>`)
5. **Progressive enhancement** via Electron for desktop integration

### Deployment Strategy
- **Immediate**: WebXR PWA hosted with HTTPS (instant VR headset access)
- **Enhanced**: Electron desktop apps for Windows/Mac/Linux (direct Steam launching)  
- **Optimized**: VR headset optimization and app store distribution

## Critical Integration Points

### Steam Protocol URL Integration
- **Browser**: Execute `steam://run/<appid>` via `window.open()`
- **User Education**: Guide users through protocol handler setup
- **Fallback**: Clear instructions for browsers without Steam access
- **Enhancement**: Electron wrapper eliminates browser security prompts

### CORS Proxy Requirements
- **Challenge**: Steam Web API doesn't support CORS for browser requests
- **Solution**: Lightweight Node.js proxy service in Docker container
- **Alternative**: Browser extensions or OAuth flows (research needed)

### Cross-Platform Compatibility
- **Primary**: Windows desktop with Steam installed
- **Secondary**: Meta Quest Browser, macOS, Linux
- **Testing**: Chrome/Firefox desktop VR, Quest Browser direct access

## Performance Targets
- **VR Frame Rate**: 90+ FPS with 100+ games displayed
- **Load Time**: <5 seconds from URL to VR-ready
- **Memory Usage**: <512MB for WebXR scene with assets
- **Asset Size**: GLTF models <10MB total, optimized textures

## Future Enhancement Paths
- **Multi-user Support**: Share shelves between Steam friends
- **Custom Layouts**: User-configurable shelf arrangements  
- **Voice Commands**: "Launch Half-Life" voice interaction
- **Workshop Integration**: Share custom shelf designs
- **VR Store Experience**: Browse Steam store in VR

## Risk Mitigation
- **Steam API Downtime**: Local cache with fallback data
- **VR Hardware Issues**: Graceful fallback to desktop 3D mode
- **Browser Compatibility**: Progressive enhancement with feature detection
- **Performance Issues**: Adaptive quality and LOD systems
