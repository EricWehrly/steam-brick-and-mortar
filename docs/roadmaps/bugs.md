# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

### Shelf end-cap labels
**Priority**: High (do soon)
**Context**: Shelf units should have small label planes at each end cap (front + back per shelf board,
one per shelf unit). Uses the existing `SceneSignManager` / `SignStyles.ShelfEndLabel`.
The diagnostic scaffolding already exists in `GameBoxSpawner.spawnGamesOnShelf` (commit 7e2be41)
but needs proper text content (e.g. category name or orientation marker), correct sizing,
and visual polish. The subagent task is to finish and clean up that implementation.
**Files**: `src/scene/spawning/GameBoxSpawner.ts`, `src/scene/SceneSignManager.ts`
**Source**: 2026-04-08 session


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
