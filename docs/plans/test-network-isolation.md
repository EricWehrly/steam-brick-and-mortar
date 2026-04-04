# Test Network Isolation - Tech Debt Item

## Problem Statement
Integration tests can accidentally make external network calls, causing:
- Tests that timeout waiting for external services (5+ second delays)
- Tests that could fail due to network connectivity 
- Tests that might hit real CDNs/APIs in CI/CD environments
- Difficult to debug performance issues in test suite

## Current State
- Manual opt-in mocking via `setupFetchMock()` in individual test files
- Easy to miss when adding new tests or components that make network calls
- `ImageManager.downloadImage()` was causing 5-second timeouts in integration tests
- Fetch calls are mocked but other HTTP mechanisms might not be

## Desired State 
Automatic prevention/detection of external network calls in test environment with one of:

### Option A: Vitest Configuration
```typescript
// vitest.config.ts - global network isolation
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup-network-isolation.ts']
  }
})

// test/setup-network-isolation.ts
beforeEach(() => {
  // Intercept all network calls and throw errors
  global.fetch = vi.fn().mockRejectedValue(new Error('External network calls not allowed in tests'))
  // Also intercept XMLHttpRequest, WebSocket, etc.
})
```

### Option B: ESLint Rules
```javascript
// .eslintrc.js - prevent direct network usage in test files
rules: {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['**/test/**'],
          message: 'Use mocked services in tests, not direct network calls'
        }
      ]
    }
  ]
}
```

### Option C: MSW (Mock Service Worker)
```typescript
// Intercept at network layer, more comprehensive than fetch mocking
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  // Catch-all handler that fails any unmocked requests
  http.all('*', () => {
    throw new Error(`Unexpected network call: ${req.url}`)
  })
)
```

## Acceptance Criteria
1. **Prevention**: Test suite should fail fast if external network calls are attempted
2. **Visibility**: Clear error messages indicating what call was blocked and how to mock it
3. **Selective Allow**: Ability to explicitly allow specific external calls for tests that need them
4. **Performance**: No impact on test execution speed
5. **Maintainable**: Low maintenance overhead, works automatically for new tests

## Implementation Priority
**High** - This is a reliability and performance issue that affects developer productivity

## Investigation Tasks
- [ ] Research vitest configuration options for global network isolation
- [ ] Test MSW setup with current test architecture  
- [ ] Evaluate ESLint rules for static analysis prevention
- [ ] Create proof-of-concept implementation
- [ ] Measure impact on existing test suite

## Related Issues
- ImageManager timeout causing 6+ second test delays
- Potential for tests to hit real Steam CDN or Lambda endpoints
- Test reliability issues in CI/CD environments without internet access