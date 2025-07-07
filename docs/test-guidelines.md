# Test Organization Guidelines

This document explains how tests are organized in the Steam Brick and Mortar project to ensure maintainability, clarity, and appropriate test execution.

## Test Structure

### Directory Organization

```
client/test/
├── unit/                # Isolated unit tests with mocks
│   ├── cache-manager.test.ts
│   └── image-manager.test.ts
├── integration/         # Component integration tests with mocks 
│   └── steam-api-client.test.ts
├── live/               # Real network/API tests
│   ├── steam-api-live.test.ts
│   └── steam-image-live.test.ts
├── utils/              # Test utilities and shared helpers
│   └── test-helpers.ts
├── mocks/              # Mock implementations
│   └── indexeddb.mock.ts
└── setup.ts            # Global test setup
```

## Test Types

### Unit Tests (`test/unit/`)
- **Purpose**: Test individual components in isolation
- **Characteristics**: 
  - Use mocks for all external dependencies
  - Fast execution (< 100ms per test)
  - No network calls
  - Test specific functionality and edge cases
- **Example**: Testing CacheManager with mocked localStorage

### Integration Tests (`test/integration/`)
- **Purpose**: Test how multiple components work together
- **Characteristics**:
  - Mock external services (APIs, browsers APIs)
  - Test realistic scenarios with multiple components
  - Verify proper composition and data flow
- **Example**: Testing SteamApiClient with all its composed dependencies

### Live Tests (`test/live/`)
- **Purpose**: Test against real external services
- **Characteristics**:
  - Make actual network requests
  - Use real API endpoints (Steam CDN, Steam Web API)
  - Longer timeouts (10-30 seconds)
  - Should be minimal but cover critical paths
- **Example**: Downloading actual Steam game images from CDN

## Test Execution

### Default Test Run
```bash
yarn test           # Runs unit and integration tests only
yarn test:watch     # Watch mode, excludes live tests
yarn test:ui        # UI mode, excludes live tests
```

### Live Tests
```bash
yarn test:live      # Runs only live tests
yarn test:all       # Runs all tests including live tests
```

### Configuration
- **Vitest config**: Excludes `**/live/**` and `**/*live*` by default
- **Package.json**: Scripts use `--exclude` flag to filter out live tests
- **Live tests**: Have extended timeouts and are marked with `live` in filename

## Writing Tests

### Unit Test Example
```typescript
// test/unit/my-component.test.ts
import { describe, it, expect, vi } from 'vitest'
import { MyComponent } from '../../src/MyComponent'
import { mockDependency } from '../utils/test-helpers'

describe('MyComponent Unit Tests', () => {
  it('should handle input correctly', () => {
    const component = new MyComponent(mockDependency)
    const result = component.process('input')
    expect(result).toBe('expected')
  })
})
```

### Live Test Example
```typescript
// test/live/my-api-live.test.ts
import { describe, it, expect } from 'vitest'
import { ApiClient } from '../../src/ApiClient'

describe('My API Live Tests', () => {
  it('should connect to real API', async () => {
    const client = new ApiClient()
    const result = await client.fetchData()
    expect(result).toBeDefined()
  }, 10000) // Extended timeout
})
```

## Best Practices

### DRY (Don't Repeat Yourself)
- Use `test/utils/test-helpers.ts` for common mocks and fixtures
- Extract repeated setup into shared functions
- Create reusable mock factories

### Test Naming
- Unit tests: `component-name.test.ts`
- Integration tests: `feature-integration.test.ts` 
- Live tests: `feature-live.test.ts` (must include `live`)

### Mocking Strategy
- Mock at the boundary: HTTP calls, browser APIs, external services
- Keep business logic unmocked to test actual behavior
- Use real implementations for internal component interactions

### Live Test Guidelines
- Keep live tests minimal (only critical happy paths)
- Use real but safe data (e.g., public Steam games)
- Include proper timeout handling
- Handle network failures gracefully
- Document any external dependencies or requirements

## Troubleshooting

### Tests Not Excluding Properly
If live tests are running when they shouldn't:
1. Check filename includes `live`
2. Verify vitest config excludes are correct
3. Ensure you're using the right npm script

### Live Tests Failing
- Check network connectivity
- Verify external service availability
- Review timeout settings
- Check for rate limiting

### Slow Test Suite
- Move slow tests to live category
- Optimize mocks to avoid real operations
- Use `vi.useFakeTimers()` for time-based tests
