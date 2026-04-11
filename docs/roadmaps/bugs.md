# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

### Uncached profile first load creates "cursed room"
**Status**: 🔴 Open  
**Reported**: 2026-01-16  
**Description**: When loading an uncached profile for the first time, the room appears but games don't seem to load properly. A refresh fixes it.
**Steps to Reproduce**:
1. Load a Steam profile that has never been cached
2. Observe the room appears but games may not display correctly
3. Refresh the page
4. Games now load correctly

**Impact**: Critical for first-time user experience  
**Next Steps**: Debug first-load flow, check event timing and state management

---

## Low Priority

### Shelf End-Cap Signs Layout Issue
**Status**: 🔴 Open  
**Reported**: 2026-04-10  
**Description**: Time-bucket signs generated on the ends of shelves have Z-positioning and padding/rotation issues when overlapping with adjacent shelf geometry.  
**Steps to Reproduce**:
1. Render a large game library spanning multiple connected shelves.
2. Observe the end-cap signs on the outer edges of the shelf arc.

**Expected**: Signs should be flush with the shelf end caps without clipping into the wood or floating too far off.  
**Actual**: Padding and rotation are slightly off, causing minor visual overlap or gap issues.  
**Impact**: Minor visual defect on the outer edges of the store layout.  
**Next Steps**: Address sign rotation and Z-offset logic in `SceneSignManager` and/or `SignageRenderer` without breaking the core layout math.

### Unexpected cache clearing
**Status**: 🔴 Open  
**Reported**: 2026-01-16  
**Description**: Something seems to be clearing the Steam cache unexpectedly. Not sure what's triggering it yet.  
**Steps to Reproduce**: Unknown - happens intermittently  
**Impact**: User must reload profiles more often than expected  
**Next Steps**: 
- Add logging to cache clear operations
- Monitor localStorage operations
- Check for unintended clear() calls

---

## Template for New Bugs

```markdown
### [Bug Title]
**Status**: 🔴 Open / 🟡 In Progress / 🟢 Fixed  
**Reported**: YYYY-MM-DD  
**Description**: What's wrong?  
**Steps to Reproduce**:
1. Step one
2. Step two
3. Observe issue

**Expected**: What should happen  
**Actual**: What actually happens  
**Impact**: How bad is this?  
**Next Steps**: What needs to happen to fix it
```

---

## Resolved Bugs

*(Move fixed bugs here with resolution date and fix description)*
