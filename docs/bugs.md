# Bug Tracker

Active bugs and issues that need investigation or fixing.

## High Priority

### Draw call count regression — ~17 → 50-70 after game detail panel
**Status**: 🔴 Open  
**Reported**: 2026-04-14  
**Description**: Draw calls were ~17 at initial instancing implementation. Now 50-70 in normal use and the count persists elevated after opening the game detail panel. Visible in the perf widget (top-right "DC" counter).  
**Suspected cause**: `.detail-content` has `overflow-y: auto` inside a `position: fixed` panel, which creates a new compositor layer. Firefox composites this layer every frame alongside Three.js's render, inflating the reported draw call count for the duration the panel is open — or permanently if something in the layout isn't being cleaned up on close. CSS note in `binder.css`: `/* TODO: Convert binder to a proper modal (backdrop, focus trap, body scroll-lock) */`  
**Also needed**: Automated test asserting `renderer.info.render.calls <= 25` in idle state (no detail panel). Without this, DC regressions are invisible until noticed manually. See `docs/agent-context/performance-metrics.md`.  
**Steps to Reproduce**: Open `?diagnostics=1`, note DC in perf widget, click any game box, observe DC jump, close panel, observe whether DC returns to baseline.  
**Impact**: Elevated GPU submission cost every frame; masks future regressions.

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
