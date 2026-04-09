# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

### Uncached profile first load creates "cursed room"  
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
