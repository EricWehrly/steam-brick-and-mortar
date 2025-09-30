/**
 * AWS Lambda handler for Steam API proxy
 * 
 * This function serves as a CORS-enabled proxy for the Steam Web API,
 * enabling browser-based applications to access Steam data.
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const axios = require('axios');

// Initialize AWS clients
const secretsManager = new SecretsManagerClient({});

// Environment variables
const SECRETS_MANAGER_SECRET_NAME = process.env.SECRETS_MANAGER_SECRET_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const ALLOWED_ORIGINS = JSON.parse(process.env.ALLOWED_ORIGINS || '[]');

// Steam API constants
const STEAM_API_BASE_URL = 'https://api.steampowered.com';

// Cache for Steam API key (in-memory for Lambda container reuse)
let steamApiKey = null;

/**
 * Get Steam API key from environment or AWS Secrets Manager
 * 
 * For local development, reads from STEAM_API_KEY environment variable.
 * For AWS deployment, retrieves from AWS Secrets Manager using the configured secret name.
 * 
 * Uses in-memory caching to avoid repeated API calls within the same Lambda container lifecycle.
 * 
 * AWS Secrets Manager documentation:
 * https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
 * 
 * Parameters: None
 * 
 * Returns:
 * @returns {Promise<string>} The Steam Web API key
 * 
 * Throws:
 * - Error if STEAM_API_KEY environment variable is missing in local environment
 * - Error if unable to retrieve secret from AWS Secrets Manager
 */
async function getSteamApiKey() {
  if (steamApiKey) {
    return steamApiKey;
  }

  // Check if we're running locally (ENVIRONMENT=local)
  if (ENVIRONMENT === 'local' || process.env.ENVIRONMENT === 'local') {
    console.log('Local environment detected, using environment variable for Steam API key');
    steamApiKey = process.env.STEAM_API_KEY;
    
    if (!steamApiKey) {
      throw new Error('STEAM_API_KEY environment variable is not set for local development');
    }
    
    return steamApiKey;
  }

  // AWS environment - use Secrets Manager
  try {
    const command = new GetSecretValueCommand({
      SecretId: SECRETS_MANAGER_SECRET_NAME
    });
    
    const response = await secretsManager.send(command);
    const secret = JSON.parse(response.SecretString);
    steamApiKey = secret.steam_api_key;
    
    return steamApiKey;
  } catch (error) {
    console.error('Failed to retrieve Steam API key from Secrets Manager:', error);
    throw new Error('Unable to retrieve Steam API key');
  }
}

/**
 * Generate CORS headers for cross-origin requests
 * 
 * Enables browser-based applications to access the Lambda API from different domains.
 * Validates the origin against the ALLOWED_ORIGINS environment variable.
 * 
 * CORS specification:
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 * 
 * Parameters:
 * @param {string} origin - The origin header from the incoming request
 * 
 * Returns:
 * @returns {Object} CORS headers object containing:
 *   - Access-Control-Allow-Origin: Allowed origin or fallback
 *   - Access-Control-Allow-Headers: Permitted request headers
 *   - Access-Control-Allow-Methods: Allowed HTTP methods
 *   - Access-Control-Max-Age: Preflight cache duration (300 seconds)
 */
function getCorsHeaders(origin) {
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*');
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : ALLOWED_ORIGINS[0] || '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '300'
  };
}

/**
 * Create standardized HTTP response for Lambda API Gateway integration
 * 
 * Formats responses according to AWS Lambda Proxy Integration requirements.
 * Automatically includes CORS headers and JSON content-type.
 * 
 * AWS Lambda Proxy Integration:
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/lambda-proxy-integration.html
 * 
 * Parameters:
 * @param {number} statusCode - HTTP status code (200, 404, 500, etc.)
 * @param {Object} body - Response body object (will be JSON.stringify'd)
 * @param {string|null} origin - Origin for CORS headers (optional)
 * @param {Object} headers - Additional headers to include (optional)
 * 
 * Returns:
 * @returns {Object} Lambda proxy response object with:
 *   - statusCode: HTTP status code
 *   - headers: Combined CORS and custom headers
 *   - body: JSON stringified response body
 */
function createResponse(statusCode, body, origin = null, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
      ...headers
    },
    body: JSON.stringify(body)
  };
}

/**
 * Validate Steam ID format (64-bit Steam ID)
 * 
 * Steam uses 64-bit integers for user identification. These are always 17-digit numbers
 * that start with 76561... for individual accounts.
 * 
 * Steam ID documentation:
 * https://developer.valvesoftware.com/wiki/SteamID
 * https://steamapi.xpaw.me/#steamid
 * 
 * Parameters:
 * @param {string} steamId - The Steam ID to validate
 * 
 * Returns:
 * @returns {boolean} True if the Steam ID is a valid 17-digit number, false otherwise
 * 
 * Examples:
 * - Valid: "76561197960287930" (Gabe Newell's public profile)
 * - Invalid: "12345" (too short)
 * - Invalid: "abcd1234567890123" (contains letters)
 */
function isValidSteamId(steamId) {
  return /^\d{17}$/.test(steamId);
}

/**
 * Handle health check endpoint (/health)
 * 
 * Provides basic service health information for monitoring and load balancers.
 * Does not test Steam API connectivity - use /test endpoint for that.
 * 
 * Health check best practices:
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
 * 
 * Parameters: None
 * 
 * Returns:
 * @returns {Promise<Object>} Health status object containing:
 *   - status: "healthy" (always)
 *   - environment: Current deployment environment (dev/prod/local)
 *   - timestamp: ISO timestamp of the check
 *   - version: API version number
 */
async function handleHealth() {
  return {
    status: 'healthy',
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
}

/**
 * Handle test endpoint (/test) with known public profile
 * 
 * Tests Steam API connectivity using Gabe Newell's public Steam profile.
 * This profile is guaranteed to be public and have games, making it ideal for testing.
 * 
 * Uses the same GetOwnedGames API call as the main /games/{steamid} endpoint
 * to validate end-to-end functionality.
 * 
 * Parameters: None
 * 
 * Returns:
 * @returns {Promise<Object>} Test result object containing:
 *   - status: "test_successful" or "test_failed"
 *   - steam_api_connected: Boolean indicating Steam API reachability
 *   - test_profile: Steam ID used for testing (76561197960287930)
 *   - games_count: Number of games found (on success)
 *   - error: Error message (on failure)
 *   - timestamp: ISO timestamp of the test
 */
async function handleTest() {
  try {
    const apiKey = await getSteamApiKey();
    
    // Use Gabe Newell's public Steam profile for testing
    const testSteamId = '76561197960287930';
    
    const response = await axios.get(`${STEAM_API_BASE_URL}/IPlayerService/GetOwnedGames/v0001/`, {
      params: {
        key: apiKey,
        steamid: testSteamId,
        format: 'json',
        include_appinfo: true,
        include_played_free_games: true
      },
      timeout: 10000
    });

    return {
      status: 'test_successful',
      steam_api_connected: true,
      test_profile: testSteamId,
      games_count: response.data.response?.game_count || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Test failed:', error.message);
    return {
      status: 'test_failed',
      steam_api_connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get owned games for a Steam user
 * 
 * Retrieves the complete game library for a Steam user using the GetOwnedGames API.
 * Enhances the response with artwork URLs for game covers and icons.
 * 
 * Steam Web API - GetOwnedGames:
 * https://steamapi.xpaw.me/#IPlayerService/GetOwnedGames
 * https://wiki.teamfortress.com/wiki/WebAPI/GetOwnedGames
 * 
 * API endpoint: https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/
 * 
 * Parameters:
 * @param {string} steamId - 64-bit Steam ID (17-digit number)
 * 
 * API Parameters sent to Steam:
 * - key: Steam Web API key
 * - steamid: 64-bit Steam ID
 * - format: "json" (response format)
 * - include_appinfo: true (include game names and other app info)
 * - include_played_free_games: true (include free-to-play games)
 * 
 * Returns:
 * @returns {Promise<Object>} Enhanced games object containing:
 *   - steamid: The requested Steam ID
 *   - game_count: Total number of games owned
 *   - games: Array of game objects with enhanced artwork URLs
 *   - retrieved_at: ISO timestamp when data was fetched
 * 
 * Each game object includes:
 *   - appid: Steam application ID
 *   - name: Game title
 *   - playtime_forever: Total minutes played
 *   - artwork: Object with URLs for icon, logo, header, and library images
 * 
 * Throws:
 * - Error if Steam ID format is invalid
 * - Error if Steam profile is private or doesn't exist (403)
 * - Error for other Steam API failures
 */
async function getOwnedGames(steamId) {
  if (!isValidSteamId(steamId)) {
    throw new Error('Invalid Steam ID format');
  }

  const apiKey = await getSteamApiKey();
  
  try {
    const response = await axios.get(`${STEAM_API_BASE_URL}/IPlayerService/GetOwnedGames/v0001/`, {
      params: {
        key: apiKey,
        steamid: steamId,
        format: 'json',
        include_appinfo: true,
        include_played_free_games: true
      },
      timeout: 15000
    });

    const games = response.data.response?.games || [];
    
    // Enhance games with artwork URLs
    const enhancedGames = games.map(game => ({
      ...game,
      artwork: {
        icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
        logo: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
        header: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
      }
    }));

    return {
      steamid: steamId,
      game_count: response.data.response?.game_count || 0,
      games: enhancedGames,
      retrieved_at: new Date().toISOString()
    };
  } catch (error) {
    if (error.response?.status === 403) {
      throw new Error('Steam profile is private or does not exist');
    }
    throw new Error(`Steam API error: ${error.message}`);
  }
}

/**
 * Resolve Steam vanity URL to Steam ID
 * https://steamapi.xpaw.me/#ISteamUser/ResolveVanityURL
 * (from https://wiki.teamfortress.com/wiki/WebAPI/ResolveVanityURL)
 * (via https://stackoverflow.com/a/62142205)
 * 
 * https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/
 * 
 * vanityurl (string) - The vanity URL to get a SteamID for
 * url_type (int) - The type of vanity URL being resolved. Currently, the only supported value is 1, which indicates a Steam Community profile URL.
 * 
 * Response:
 * {
 *   "response": {
 *     "success": 1,
 *     "steamid": "76561197960287930"
 *   }
 */
async function resolveVanityUrl(vanityUrl) {
  const apiKey = await getSteamApiKey();
  
  try {
    const response = await axios.get(`${STEAM_API_BASE_URL}/ISteamUser/ResolveVanityURL/v0001/`, {
      params: {
        key: apiKey,
        vanityurl: vanityUrl,
        format: 'json'
      },
      timeout: 10000
    });

    const result = response.data.response;
    
    if (result.success === 1) {
      return {
        vanity_url: vanityUrl,
        steamid: result.steamid,
        resolved_at: new Date().toISOString()
      };
    } else {
      throw new Error('Vanity URL not found');
    }
  } catch (error) {
    throw new Error(`Failed to resolve vanity URL: ${error.message}`);
  }
}

/**
 * Main AWS Lambda handler for Steam API proxy
 * 
 * Handles HTTP requests routed through AWS API Gateway with Lambda Proxy Integration.
 * Supports CORS preflight requests and routes to appropriate handler functions.
 * 
 * AWS Lambda documentation:
 * https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
 * 
 * API Gateway Lambda Proxy Integration:
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/lambda-proxy-integration.html
 * 
 * Supported endpoints:
 * - GET /health - Service health check
 * - GET /test - Steam API connectivity test
 * - GET /games/{steamid} - Get owned games for Steam user
 * - GET /resolve/{vanityurl} - Resolve vanity URL to Steam ID
 * - OPTIONS * - CORS preflight handling
 * 
 * Parameters:
 * @param {Object} event - API Gateway Lambda Proxy event object containing:
 *   - headers: HTTP headers including origin for CORS
 *   - requestContext.http.method: HTTP method (GET, POST, OPTIONS)
 *   - requestContext.http.path: Request path for routing
 *   - (additional API Gateway event properties)
 * @param {Object} context - Lambda context object (unused but required)
 * 
 * Returns:
 * @returns {Promise<Object>} Lambda Proxy response object with:
 *   - statusCode: HTTP status code
 *   - headers: Response headers including CORS
 *   - body: JSON stringified response body
 */
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const origin = event.headers?.origin;
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;
  
  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight successful' }, origin);
  }

  try {
    // Route handling
    if (path === '/health') {
      const result = await handleHealth();
      return createResponse(200, result, origin);
    }
    
    if (path === '/test') {
      const result = await handleTest();
      return createResponse(200, result, origin);
    }
    
    if (path.startsWith('/games/')) {
      const steamId = path.split('/')[2];
      const result = await getOwnedGames(steamId);
      return createResponse(200, result, origin);
    }
    
    if (path.startsWith('/resolve/')) {
      const vanityUrl = path.split('/')[2];
      const result = await resolveVanityUrl(vanityUrl);
      return createResponse(200, result, origin);
    }
    
    // Route not found
    return createResponse(404, { 
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      available_endpoints: ['/health', '/test', '/games/{steamid}', '/resolve/{vanityurl}']
    }, origin);
    
  } catch (error) {
    console.error('Handler error:', error);
    
    return createResponse(500, {
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, origin);
  }
};
