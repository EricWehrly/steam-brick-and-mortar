# Tech Debt Backlog

## Critical Issues

### ✅ FIXED: Fix Duplicated Console Logs on Application Startup
**Priority**: High  
**Effort**: 1-2 hours  
**Status**: **COMPLETED**

**Issue Identified**: The problem was in `main.ts` lines 57-64 where the application could potentially be initialized twice:
1. Once via the `DOMContentLoaded` event listener 
2. Once immediately if the DOM was already loaded when the script executed

**Root Cause**: The original logic had a race condition:
```typescript
// Original problematic code
document.addEventListener('DOMContentLoaded', initializeApp)
if (document.readyState === 'loading') {
    // DOM is still loading, event listener will handle it
} else {
    // DOM is already loaded
    initializeApp()  // Could execute along with event listener
}
```

**Solution Implemented**:
1. **Added deduplication logic** in `initializeApp()` function using state flags (`isInitializing`, `isInitialized`)
2. **Fixed DOM ready check logic** to be more explicit: `if (document.readyState !== 'loading')`
3. **Added proper error handling** that resets flags on failure to allow retry
4. **Exported `initializeApp`** for testing purposes

**Code Changes**:
- ✅ Modified `client/src/main.ts` with deduplication logic
- ✅ Created comprehensive tests in `client/test/unit/core/console-log-duplication.test.ts`
- ✅ Created integration tests in `client/test/unit/core/duplicate-initialization.test.ts`
- ✅ Added missing `CacheManagementUI.mock.ts` test dependency

**Verification**:
- ✅ Unit tests confirm single initialization even with multiple `init()` calls
- ✅ App already had proper `isInitialized` state management in `SteamBrickAndMortarApp.ts`
- ✅ Tests demonstrate the fix prevents duplicate console logs during startup
- ✅ Error handling preserves ability to retry after failed initialization

**Expected Resolution**: ✅ **ACHIEVED**
- Clean, single console output during startup
- Verification that managers are only initialized once  
- Clear initialization flow without redundant operations

## Testing Infrastructure

### Review and Reclassify Existing Tests for Performance Testing
**Priority**: Medium  
**Effort**: 2-3 hours  
**Context**: After establishing our new performance testing framework with `vitest.performance.config.ts`, we need to audit existing tests to identify any that are actually performance tests disguised as unit tests.

**Tasks**:
1. Scan all existing test files in `test/unit/`, `test/integration/`, and `test/live/` directories
2. Look for tests that:
   - Measure execution time or timing-sensitive operations
   - Test memory usage, allocation, or cleanup
   - Verify rendering performance or frame rates
   - Test large data sets or stress scenarios
   - Use `setTimeout`, `setInterval`, or measure async operation duration
   - Test resource loading/caching performance
   - Verify optimization effectiveness

3. Extract identified performance tests into dedicated `.perf.test.ts` files
4. Update test configurations to run performance tests separately
5. Ensure performance tests use appropriate thresholds and benchmarking

**Benefits**:
- Proper separation of concerns between unit and performance tests
- Better CI/CD pipeline optimization (performance tests can run separately)
- More accurate performance regression detection
- Cleaner, faster unit test suite

**Files to Review**:
- `test/unit/core/steam-brick-and-mortar-app.test.ts` - Check for timing-sensitive tests
- `test/unit/scene/` - Look for rendering performance tests
- `test/unit/steam-integration/` - Check for API response time tests
- `test/integration/` - Look for end-to-end performance scenarios
- `test/live/` - Check for real-world performance measurements

**Reference**: Performance test framework established in commit `4d48180`