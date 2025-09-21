# Pause Menu Template Rendering Strategy

## Problem Analysis

The pause menu template system has three critical issues:

### 1. Template Processing Order (FIXED)
- **Issue**: Generic `{{value}}` interpolation was running FIRST, deleting `{{#if hasImages}}` before conditional logic could process it
- **Solution**: Reordered TemplateEngine to process conditionals BEFORE simple interpolation
- **Status**: ✅ Fixed in TemplateEngine.ts

### 2. Data Timing Issue (TO FIX)
- **Issue**: Template renders before game data loads, so `hasImages: false` shows "no images" UI
- **Impact**: Users see empty state even when images exist
- **Root Cause**: Pause menu initializes immediately, but Steam data loads asynchronously

### 3. No Re-render Mechanism (TO FIX)
- **Issue**: When game data finally loads, pause menu template doesn't update
- **Impact**: UI stays in empty state permanently
- **Root Cause**: No event listener to trigger template re-rendering

## Proposed Solution: Event-Driven Template Rendering

### Strategy
1. **Delay Initial Rendering**: Don't render pause menu templates until game data is ready
2. **Event-Based Updates**: Listen for data load events and re-render templates
3. **Graceful Loading States**: Show loading indicators while data loads

### Implementation Plan

#### Phase 1: Add Event Listeners
- PauseMenuManager listens for `steam-data-loaded` events
- Cache management panel re-renders when cache stats update
- Image previewer initializes only after images are available

#### Phase 2: Template Re-rendering
- Add `updateTemplate()` method to pause menu panels  
- Call template interpolation with fresh data when events fire
- Replace DOM content with newly rendered template

#### Phase 3: Loading States
- Show "Loading..." states in templates initially
- Use `{{#if dataLoaded}}` conditionals for main content
- Add spinner/skeleton UI for better UX

### Event Flow
```
App Start → Pause Menu Init (minimal template)
    ↓
Steam API Loads → Emit 'steam-data-loaded' 
    ↓
Pause Menu Receives Event → Re-render with real data
    ↓
User sees fully populated UI
```

### Benefits
- No more empty states when data exists
- Templates always show current data
- Better user experience with loading indicators
- Follows existing event architecture patterns

## Files to Modify
- `PauseMenuManager.ts`: Add event listeners and re-render logic
- `CacheManagementPanel.ts`: Event-driven template updates  
- `SystemUICoordinator.ts`: Coordinate data loading events
- Steam data loading components: Emit events when ready

## Testing Strategy
- Unit tests for event handling in pause menu
- Integration tests for data load → template render flow
- Visual tests to verify UI updates correctly