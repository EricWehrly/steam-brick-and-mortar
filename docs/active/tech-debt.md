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