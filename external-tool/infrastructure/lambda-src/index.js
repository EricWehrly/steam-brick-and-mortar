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
 * Generate CORS headers
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
 * Create HTTP response
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
 */
function isValidSteamId(steamId) {
  return /^\d{17}$/.test(steamId);
}

/**
 * Handle health check
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
 * Handle test endpoint with known public profile
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
 * Main Lambda handler
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
