# Tech Debt Backlog

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