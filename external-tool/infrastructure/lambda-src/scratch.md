# Lambda Local Testing Scratch Notes

## Issue Found
When running `yarn test:steam-api`, we get:
```
Failed to retrieve Steam API key: ValidationException: 1 validation error detected: Value null at 'secretId' failed to satisfy constraint: Member must not be null
```

## Root Cause
The Lambda code always tries to use AWS Secrets Manager, even locally. But locally we have the Steam API key in `.env` file.

## Solution - IMPLEMENTED
Modified the `getSteamApiKey()` function in `index.js` to:
1. ✅ Check if we're running locally (no SECRETS_MANAGER_SECRET_NAME env var)
2. ✅ If local, use process.env.STEAM_API_KEY directly
3. ✅ If on AWS, use Secrets Manager as before

## Testing
Ran `yarn test:steam-api` - still shows "Steam API Key: NOT SET"

## Test Results (test.log)
```
✅ Health endpoint: Works (doesn't need Steam API key)
❌ Test endpoint: Steam API Connected: false (500 error)
❌ Resolve endpoint: 500 error (can't get Steam API key) 
❌ Games endpoint: 500 error (can't get Steam API key)
```

## Issue: Fix not working yet
The getSteamApiKey() function still not reading from .env file properly.
Need to debug further.

## Local vs AWS Environment Detection
- Local: SECRETS_MANAGER_SECRET_NAME is undefined/null
- AWS: SECRETS_MANAGER_SECRET_NAME is set by Terraform

## Files to modify
- `lambda-src/index.js` - Update getSteamApiKey() function
