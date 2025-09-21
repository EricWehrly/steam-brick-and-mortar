# Tech Debt Backlog

## Intake Queue
*New items requiring triage and prioritization*

<!-- Add new tech debt items here for processing -->

---

## Critical Issues
*Must fix - blocks core functionality or introduces serious bugs*

*No critical issues currently identified*

---

## High Priority
*Should fix soon - impacts user experience or developer productivity*

### User Experience

#### Fix Input Focus Management Conflicts
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: Critical UX issue - typing in input fields triggers camera movement, menu interactions conflict with game controls

**Tasks**:
- Disable WASD/mouse controls when Steam vanity input field has focus
- Disable game controls when pause menu or other UI elements are active
- Implement focus event management in WebXRCoordinator
- Add input field focus detection in SteamUIPanel
- Ensure controls re-enable when focus returns to game area

**Files to Modify**:
- `client/src/webxr/WebXRCoordinator.ts` - Add input focus state management
- `client/src/ui/SteamUIPanel.ts` - Track input field focus states
- `client/src/ui/pause/PauseMenuManager.ts` - Communicate menu focus to input system

**Benefits**: Eliminates control conflicts, prevents accidental camera movement while typing, improved user experience

**Source**: Feature 5.5.4 - marked as critical UX issue during Feature 5.5 implementation

### Code Quality & Documentation

#### Remove Redundant Javadoc Comments
**Priority**: High  
**Effort**: 2-3 hours  
**Context**: Many files have verbose javadoc comments that add little value beyond method signatures

**Tasks**:
- Audit all TypeScript files for redundant comments
- Keep comments only where they add genuine value beyond signatures
- Focus on complex business logic, edge cases, and architectural decisions
- Remove boilerplate documentation that duplicates type information

**Benefits**: Reduced code noise, improved readability, less maintenance overhead

---

## Medium Priority  
*Good to fix - improves code quality and maintainability*

### UI Polish & Consistency

#### Standardize Cache Management UI Styling
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Cache scrolling view buttons/inputs inconsistent with main UI styling

**Tasks**:
- Apply consistent button styling from main UI components
- Standardize input field appearance and behavior
- Ensure hover states and focus indicators match UI system
- Test styling across different viewport sizes

**Benefits**: More polished user experience, consistent visual design

**Status**: Deferred from Phase 1 - suitable for UI polish phase

#### Improve Preview Button State Management
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: "Initialize preview" button should change state after initialization

**Tasks**:
- Change button text/appearance after preview initialization
- Add onMenuClose event handler to reset button state
- Consider "Close Preview" functionality vs simple state reset
- Ensure consistent behavior across menu open/close cycles

**Benefits**: Better UI feedback, clearer interaction state

**Status**: Deferred from Phase 1 - non-essential functionality

### Performance & Architecture

#### Input Management Simplification
**Priority**: Medium  
**Effort**: 3-4 hours  
**Context**: InputManager has complex callback chains that could be simplified

**Tasks**:
- Review camera update flow for over-engineering
- Consider direct method calls vs callbacks for simple updates
- Streamline movement update callback chains
- Maintain flexibility while reducing complexity

**Benefits**: Simpler input handling, easier debugging, reduced callback overhead

#### WebXR Manager Callback Streamlining
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: WebXR state changes passed through multiple callback layers unnecessarily

**Tasks**:
- Identify simple state updates that could use direct method calls
- Review session state change propagation
- Simplify supported/session active flag management
- Maintain event system for complex state changes

**Benefits**: Reduced WebXR state management complexity, clearer data flow

### Cache Performance (Remaining Optimizations)

#### Optimize hasCachedData() Method
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Minor optimization for frequent cache lookups

**Tasks**:
- Cache resolve lookup result during execution
- Add `getCachedUserData()` combining resolve + games lookup
- Optimize cache key generation to reduce string operations

**Benefits**: Reduced redundant cache lookups, minor performance improvement

#### Smart Cache Management Panel Refresh
**Priority**: Medium  
**Effort**: 1-2 hours  
**Context**: Current 5-second refresh can be optimized

**Tasks**:
- Increase refresh interval to 8s when panel visible
- Pause refresh when panel not visible
- Add manual refresh button
- Cache stats between automatic refreshes

**Benefits**: Better background resource usage, improved panel UX

---

## Low Priority
*Nice to have - minimal impact on core functionality*

### Testing Infrastructure

#### Implement Missing Integration Test Coverage
**Priority**: Low  
**Effort**: 6-8 hours  
**Context**: Identified gaps in integration test coverage

**Tasks**:
- See detailed plan in `docs/integration-test-coverage-plan.md`
- Add Steam API + Integration layer boundary tests
- Implement texture loading integration tests
- Create scene rendering tests without WebGL dependency
- Add progressive loading integration tests

**Benefits**: Better integration boundary coverage, improved confidence in workflows

#### Review and Reclassify Performance Tests
**Priority**: Low  
**Effort**: 2-3 hours  
**Context**: Some unit tests may actually be performance tests

**Tasks**:
- Audit existing tests for timing/performance measurements
- Extract performance tests to `.perf.test.ts` files
- Update test configurations for separate performance runs
- Ensure proper benchmarking thresholds

**Benefits**: Cleaner test separation, better performance regression detection

---

## Archived/Completed

### Feature 5.5.1: Dedicated Game List Cache
**Status**: **Cancelled** - Data duplication outweighed performance benefits  
**Original Effort**: 4-6 hours  
**Context**: Analysis showed minimal performance gain vs complexity and memory overhead

**Analysis Results**:
- Hash map lookups already fast (2 vs 1 lookup not meaningful bottleneck)
- Data duplication created consistency issues
- Memory overhead triggered LRU eviction more frequently
- Alternative optimizations provide better ROI

**Alternative Solutions Applied**:
- Debounced localStorage writes ✅
- Cached user list index ✅  
- LRU cache size management ✅

---

## Priority Definitions

- **Critical**: Blocks core functionality, introduces serious bugs, or security issues
- **High**: Significantly impacts user experience, developer productivity, or code quality
- **Medium**: Moderate improvements to performance, maintainability, or user experience  
- **Low**: Minor enhancements, nice-to-have features, or preparatory work for future changes

## Workflow

1. **Intake**: New items added to Intake Queue
2. **Triage**: Regular review to assign priority and effort estimates
3. **Planning**: High/Critical items planned into development cycles
4. **Implementation**: Items moved to appropriate project milestones
5. **Completion**: Items moved to Archived section with status notes