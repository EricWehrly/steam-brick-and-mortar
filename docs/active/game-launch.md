# Steam Game Launch Implementation Plan

## Research Summary

Based on research into Steam APIs and browser capabilities, this document outlines the options and recommended approach for implementing game launching from our WebXR Steam Brick and Mortar application.

## Available Game Launch Options

### Option 1: Steam Browser Protocol (`steam://` URLs) 🎯 **RECOMMENDED**

**How it works:**
- Use Steam's built-in browser protocol handler
- Direct URL navigation: `steam://run/{appid}`
- Browser handles protocol registration with OS
- Steam client launches game if installed and Steam is running

**Example Implementation:**
```javascript
// Launch Hexcells Infinite (AppID: 304410)
window.location.href = 'steam://run/304410'
// Alternative: window.open('steam://run/304410', '_blank')
```

**Pros:**
- ✅ **Simple implementation** - Single line of code
- ✅ **No API keys required** - Uses Steam client directly
- ✅ **Works in all browsers** - Standard protocol handling
- ✅ **No authentication needed** - Relies on local Steam login
- ✅ **Reliable** - Official Steam protocol, won't break
- ✅ **Handles game installation** - Steam will prompt to install if needed
- ✅ **Respects Steam settings** - Launch options, family sharing, etc.

**Cons:**
- ❌ **Requires Steam client** - Won't work if Steam not installed
- ❌ **No feedback** - Can't detect if launch succeeded/failed
- ❌ **Security prompts** - Browser may ask user permission for protocol

**Browser Support:**
- ✅ Chrome: Full support with user permission
- ✅ Firefox: Full support with user permission  
- ✅ Edge: Full support with user permission
- ✅ Safari: Full support with user permission

### Option 2: Steam Web API Integration 🤔 **FUTURE ENHANCEMENT**

**Available APIs:**
- `IPlayerService/GetOwnedGames` - Check if user owns game
- `IPlayerService/GetRecentlyPlayedGames` - Track launches
- No direct launch API exists

**Pros:**
- ✅ Can verify game ownership before launch attempt
- ✅ Can track user play patterns
- ✅ Can show installation status

**Cons:**
- ❌ **Cannot actually launch games** - API is read-only
- ❌ Still requires `steam://` protocol for actual launching
- ❌ Requires API key and authentication complexity
- ❌ Rate limiting concerns

**Verdict:** Useful for enhanced UX, but cannot replace protocol approach

### Option 3: Desktop Application Integration ⚙️ **LAST RESORT**

**How it works:**
- Convert to Electron app with system access
- Direct file system access to Steam installation
- Execute Steam.exe with command line parameters
- Parse Steam's local VDF files for game library

**Pros:**
- ✅ Complete control over launch process
- ✅ Can detect launch success/failure
- ✅ Access to local Steam data without APIs
- ✅ No rate limiting or authentication

**Cons:**
- ❌ **Abandons web-first architecture** - Major paradigm shift
- ❌ Complex deployment and installation
- ❌ Platform-specific implementations required
- ❌ Requires elevated permissions on some systems
- ❌ Distribution complexity (app stores, signing, etc.)

**Verdict:** Reserve as final option if web approach fails

### Option 4: Manual Launch Instructions 📝 **FALLBACK**

**How it works:**
- Display game name and Steam AppID to user
- Provide instructions for manual Steam launching
- Show Steam store link as backup

**Pros:**
- ✅ **Always works** - No technical dependencies
- ✅ Simple implementation
- ✅ No security concerns

**Cons:**
- ❌ Poor user experience - Manual effort required
- ❌ Defeats purpose of immersive 3D interface
- ❌ Not suitable as primary approach

## Implementation Plan

### Phase 1: Basic Steam Protocol Implementation ⭐ **IMMEDIATE**

**Test Game Selection:**
- **Primary:** Hexcells Infinite (AppID: 304410) - Perfect choice!
  - Small, lightweight game
  - Simple graphics - easy to verify launch
  - Quick startup time for testing
  - Common in Steam libraries

**Implementation Steps:**

1. **Add diagnostic button to Debug Panel**
   ```typescript
   // In DebugPanel template
   <button id="test-steam-launch" class="debug-button">
       🎮 Test Game Launch (Hexcells Infinite)
   </button>
   ```

2. **Implement launch function**
   ```typescript
   private testSteamLaunch(): void {
       const appid = 304410; // Hexcells Infinite
       const steamUrl = `steam://run/${appid}`;
       
       console.log(`🎮 Attempting to launch Steam game: ${appid}`);
       
       try {
           window.open(steamUrl, '_blank');
           console.log('✅ Steam protocol URL opened');
       } catch (error) {
           console.error('❌ Failed to open Steam protocol:', error);
       }
   }
   ```

3. **Add user feedback**
   ```typescript
   private testSteamLaunch(): void {
       // Show loading state
       this.showLaunchFeedback('Launching Hexcells Infinite...');
       
       // Launch game
       window.open(`steam://run/304410`, '_blank');
       
       // Show completion (can't detect actual success)
       setTimeout(() => {
           this.showLaunchFeedback('Launch command sent to Steam');
       }, 1000);
   }
   ```

4. **Error handling and fallbacks**
   ```typescript
   private async testSteamLaunch(): Promise<void> {
       const appid = 304410;
       const steamUrl = `steam://run/${appid}`;
       const storeUrl = `https://store.steampowered.com/app/${appid}`;
       
       try {
           // Attempt protocol launch
           window.open(steamUrl, '_blank');
           this.showFeedback('Launch command sent to Steam');
       } catch (error) {
           // Fallback to Steam store page
           console.warn('Steam protocol failed, opening store page');
           window.open(storeUrl, '_blank');
           this.showFeedback('Opened Steam store page');
       }
   }
   ```

### Phase 2: Enhanced Launch System 🚀 **FOLLOW-UP**

1. **Generic launch function**
   ```typescript
   export class SteamLauncher {
       static async launchGame(appid: number, gameName?: string): Promise<boolean> {
           const steamUrl = `steam://run/${appid}`;
           
           try {
               window.open(steamUrl, '_blank');
               console.log(`🎮 Launched: ${gameName || appid}`);
               return true;
           } catch (error) {
               console.error(`❌ Launch failed: ${appid}`, error);
               return false;
           }
       }
   }
   ```

2. **Integration with 3D game boxes**
   ```typescript
   // In game box interaction handler
   onGameBoxClick(gameData: SteamGame): void {
       if (gameData.appid) {
           SteamLauncher.launchGame(gameData.appid, gameData.name);
       }
   }
   ```

3. **User preferences**
   - Setting to enable/disable direct launching
   - Option to always show confirmation dialog
   - Fallback behavior preferences (store page vs. manual instructions)

### Phase 3: Advanced Features 🔧 **FUTURE**

1. **Steam Web API integration**
   - Check game ownership before showing launch option
   - Track launch history and statistics
   - Show installation status if available

2. **Protocol detection**
   ```typescript
   // Check if Steam protocol is available
   private async checkSteamProtocolSupport(): Promise<boolean> {
       try {
           // Use navigator.registerProtocolHandler to test availability
           // Or attempt a test launch with feedback monitoring
           return true;
       } catch {
           return false;
       }
   }
   ```

3. **Enhanced feedback system**
   - Integration with Steam Web API to verify launch
   - Launch history tracking
   - User analytics (which games launched most, success rates)

## Testing Strategy

### Development Testing

1. **Environment Setup**
   - Ensure Steam client installed and logged in
   - Have Hexcells Infinite in library (or use free game for testing)
   - Test in multiple browsers (Chrome, Firefox, Edge)

2. **Test Cases**
   - ✅ Steam running, game owned → Should launch successfully  
   - ❌ Steam not running → Should prompt to start Steam
   - ❌ Game not owned → Should show Steam store page or error
   - ❌ Steam not installed → Should handle gracefully
   - 🔄 Various browser security settings → Should respect user permissions

3. **Fallback Testing**
   - Disable Steam protocol handling in browser
   - Test with Steam client closed
   - Test on system without Steam installed

### User Testing

1. **Debug Panel Integration**
   - Clear button labeling: "🎮 Test Steam Launch"
   - Immediate feedback: "Launching game..." → "Command sent"
   - Error messaging: "Steam not available, opening store page"

2. **Success Criteria**
   - User clicks button → Steam opens → Game launches (if owned)
   - Clear feedback provided at each step
   - Graceful fallback if Steam unavailable
   - No browser crashes or security warnings

## Implementation Location

### Target Files for Changes

1. **Debug Panel Enhancement**
   ```
   client/src/ui/pause/panels/DebugPanel.ts
   client/src/templates/pause-menu/debug-panel.html
   client/src/styles/pause-menu/debug-panel.css
   ```

2. **Steam Launcher Utility** (new)
   ```
   client/src/steam/SteamLauncher.ts
   ```

3. **Integration Points**
   - Main application for global launch handling
   - Game interaction system for 3D box clicks
   - Menu system for launch options

## Risk Mitigation

### Security Considerations
- ✅ Steam protocol is safe - official Steam feature
- ✅ No sensitive data exposure - only public app IDs
- ⚠️ Browser may show security prompts - document in user guide

### Compatibility Issues  
- ✅ All modern browsers support custom protocols
- ⚠️ User must grant permission for protocol handling
- ✅ Graceful fallback to Steam store page

### User Experience Risks
- ⚠️ No way to detect actual launch success - set user expectations
- ✅ Clear messaging about Steam client requirement
- ✅ Fallback options if Steam unavailable

## Success Metrics

### Technical Success
- [ ] Button click successfully triggers Steam protocol
- [ ] Steam client responds and launches target game
- [ ] Error handling works for edge cases
- [ ] No browser security warnings or crashes

### User Experience Success  
- [ ] User understands what will happen when clicking launch
- [ ] Launch process feels responsive and predictable
- [ ] Clear feedback provided at each step
- [ ] Fallback options work when expected

## Next Steps

1. **Review this plan** - Confirm approach and test game selection
2. **Implement Phase 1** - Add test button to Debug Panel  
3. **Test thoroughly** - Verify protocol works in development environment
4. **Iterate based on results** - Refine UX and error handling
5. **Integrate with main application** - Connect to 3D game interaction system

---

**Document Status:** ✅ Ready for Review  
**Target Test Game:** Hexcells Infinite (AppID: 304410)  
**Recommended Approach:** Steam Browser Protocol (`steam://run/{appid}`)  
**Fallback Strategy:** Steam Store Page + Manual Instructions