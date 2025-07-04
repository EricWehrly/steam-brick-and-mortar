# Local Lambda Testing Environment

This directory contains tools for testing the Lambda function locally before deploying to AWS.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create local environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your Steam API key
   ```

3. Run local tests:
   ```bash
   npm test
   npm run test:health
   npm run test:steam-api
   ```

## Testing Strategy

- **Unit Tests**: Test individual functions without AWS dependencies
- **Integration Tests**: Test full handler with mocked AWS services
- **Manual Tests**: Test specific endpoints with real Steam API key
- **Local Server**: Run Express server that mimics API Gateway

## Environment Variables for Local Testing

```bash
# .env file
STEAM_API_KEY=your_steam_api_key_here
ENVIRONMENT=local
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:5173"]
```
