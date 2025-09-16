# Tech Debt Backlog

## Critical Issues

- Remove redundant javadoc comments which are doing little more than costing additional context to read files.
   (But keep comments where they're adding value and cannot be rolled cleanly into method signatures)

## Testing Infrastructure

### Implement Missing Integration Test Coverage
**Priority**: Medium  
**Effort**: 6-8 hours  
**Context**: After improving the Steam texture integration test to use proper public API patterns, we identified significant gaps in integration test coverage that need to be addressed.

**Tasks**:
- See detailed implementation plan in `docs/integration-test-coverage-plan.md`
- Implement component integration tests for Steam API + Integration layer boundaries
- Add texture loading and image cache integration tests  
- Create scene rendering integration tests without WebGL dependency
- Add error handling integration tests for network failures and partial data scenarios
- Implement progressive loading integration tests for callback workflows

**Benefits**:
- Better detection of integration boundary issues
- More comprehensive coverage of user-facing workflows
- Improved confidence in component interactions
- Better separation between unit and integration test concerns

**Reference**: Coverage gap analysis from integration test architecture review

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

## Cache Performance Optimization (Remaining Items)

### Cache Operation Optimizations
**Priority**: Medium  
**Effort**: 3-4 hours  
**Context**: Critical cache performance bottlenecks have been resolved (debounced writes, LRU eviction, user list index). Remaining optimizations provide moderate performance improvements for edge cases and background operations.

**Completed Foundation** ✅:
- Story 1.1: Debounced localStorage writes (eliminates UI blocking)
- Story 1.2: Cached user list index (O(1) user lookup vs O(n×m))  
- Story 1.3: LRU cache size management (prevents memory leaks)

**Remaining Tasks**:

#### **Story 2.1: Optimize hasCachedData()**
**Effort**: 1-2 hours  
**Implementation**:
- Cache resolve lookup result during `hasCachedData()` execution
- Add `getCachedUserData()` that returns both resolve and games in single lookup
- Optimize cache key generation to avoid repeated string operations

#### **Story 2.2: Smart CacheManagementPanel Refresh**
**Effort**: 1-2 hours  
**Implementation**:
- Increase refresh interval from 5s to 8s when panel visible
- Pause refresh when panel not visible 
- Add manual refresh button for immediate updates
- Cache stats between refreshes to avoid repeated computation

**Benefits**:
- Reduced redundant cache lookups
- Better background resource usage
- Improved cache management panel UX
- Minor performance gains for heavy cache users

**Reference**: Detailed analysis in archived `cache-refactor-plan.md` (moved to tech debt after critical items completed)

## Feature 5.5 Backlogged Items

### Story 5.5.1: Dedicated Game List Cache
**Priority**: Low-Medium  
**Effort**: 4-6 hours  
**Context**: Original implementation created data duplication and consistency issues. The performance benefit (reducing 2 cache lookups to 1) was minimal compared to the complexity and memory overhead of storing duplicate game data.

**Original Goal**: Create lightweight app ID + name cache structure for quick "cache available" checks to replace heavy cache inspections in `SteamUIPanel.checkOfflineAvailability()` and `SteamIntegration.hasCachedData()`.

**Problems Identified**:
- Data duplication: Storing same game data in resolve, games, and gamelist caches
- Memory overhead: More cache entries trigger LRU eviction more frequently  
- Data consistency: Gamelist cache could become stale if games data updates
- Questionable benefit: Hash map lookups are already fast, 2 vs 1 lookup not meaningful bottleneck

**Alternative Approaches to Consider**:
1. **Single-pass cache check**: Combine resolve + games lookup into single method
2. **Cache result memoization**: Cache the hasCachedData result temporarily during UI updates
3. **Smart cache key generation**: Optimize key generation to avoid repeated string operations
4. **UI optimization**: Reduce frequency of cache availability checks instead of optimizing the check itself

**Files with potential optimizations**:
- `client/src/steam-integration/SteamIntegration.ts` - `hasCachedData()` method
- `client/src/ui/SteamUIPanel.ts` - `checkOfflineAvailability()` usage patterns
- `client/src/ui/UICoordinator.ts` - Cache availability callback frequency

**Reference**: Reverted after analysis showed data duplication outweighed performance benefits