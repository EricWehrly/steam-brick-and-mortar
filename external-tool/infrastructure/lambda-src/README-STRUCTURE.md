# Lambda Source Code Structure

Modular architecture for maintainability and testability.

## File Organization

```
lambda-src/
├── index.js                    # Main Lambda handler (102 lines)
├── services/                   # Shared utilities and services
│   ├── RateLimiter.js         # Rate limiting for Steam API calls
│   ├── cache.js               # Two-tier caching (memory + S3)
│   ├── config.js              # Environment configuration
│   ├── http-utils.js          # CORS, responses, validation
│   ├── secrets.js             # Steam API key management
│   └── steam-api.js           # Steam Store API integration
├── handlers/                   # Request handlers by endpoint
│   └── index.js               # All endpoint handlers
└── test/                       # Test files
    └── batch-appdetails.test.js

Total: ~640 lines (down from 858 in monolithic version)
```

## Module Responsibilities

### `index.js` (Main Handler)
- Routes requests to appropriate handlers
- CORS handling
- Error handling and logging
- **Minimal logic** - just routing and response formatting

### `services/RateLimiter.js`
- Controls concurrent Steam API requests
- Enforces delays between calls
- Queue management for pending requests

### `services/cache.js`
- **L1 Cache**: In-memory Map (Lambda container lifetime)
- **L2 Cache**: S3 with gzip compression (persistent)
- Automatic fallback: Memory → S3 → Steam API
- Cache population on successful fetches

### `services/config.js`
- Centralized environment variables
- Single source of truth for configuration
- Easy to mock for testing

### `services/http-utils.js`
- CORS header generation
- Standardized response formatting
- Input validation utilities

### `services/secrets.js`
- AWS Secrets Manager integration
- Local development environment variable fallback
- In-memory caching of API key

### `services/steam-api.js`
- Steam Store API integration
- Exponential backoff retry logic
- Rate limiting integration
- Cache-first data fetching

### `handlers/index.js`
- All endpoint implementations
- Business logic for each route
- Consistent error handling

## Testing

Each module can be tested independently:

```javascript
// Example: Testing rate limiter
const RateLimiter = require('./services/RateLimiter');
const limiter = new RateLimiter(2, 100);

// Example: Testing cache (with mocked S3)
const cache = require('./services/cache');
const mockS3 = jest.mock('@aws-sdk/client-s3');
```

## Deployment

Terraform automatically packages all files:
- `index.js` is the entry point
- All `services/` and `handlers/` modules are included
- Node modules from `package.json` are bundled

## Benefits of Modular Structure

1. **Maintainability**: Each file has a single responsibility (~100-150 lines)
2. **Testability**: Mock individual modules without loading entire app
3. **Reusability**: Utilities can be shared across handlers
4. **Clarity**: Clear separation of concerns (routing vs logic vs infrastructure)
5. **Debugging**: Easier to trace issues to specific modules
6. **Collaboration**: Multiple developers can work on different modules

## Migration Notes

- Old monolithic `index.js` backed up as `index-old.js`
- All functionality preserved
- API contract unchanged
- No deployment changes needed
