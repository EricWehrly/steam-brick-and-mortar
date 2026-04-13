# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

*No high-priority bugs currently open.*

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
- **Note**: A deliberate caching strategy review is planned before Act 3 / public release. This bug and the broader cache reliability picture should be evaluated together at that point, ideally with instrumentation and real usage data beyond the dev server.

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

### Uncached profile first load creates "cursed room"
**Status**: 🟢 Fixed  
**Reported**: 2026-01-16  
**Resolved**: ~2026-04 (exact commit not tracked — confirmed resolved during Act 1 work)  
**Description**: When loading an uncached profile for the first time, the room appeared but games didn't load correctly. A refresh fixed it.  
**Resolution**: Event timing and first-load state management corrected during batch/event pipeline refactoring.

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
