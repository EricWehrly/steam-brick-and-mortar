/**
 * AWS Lambda handler for Steam API proxy
 * 
 * This function serves as a CORS-enabled proxy for the Steam Web API,
 * enabling browser-based applications to access Steam data.
 * 
 * Architecture:
 * - Modular structure with separation of concerns
 * - Two-tier caching (memory + S3) for performance
 * - Rate limiting for Steam API calls
 * - CORS support for browser clients
 */

const { createResponse } = require('./services/http-utils');
const {
  handleHealth,
  handleTest,
  handleResolveVanityUrl,
  handleGetOwnedGames,
  handleBatchAppDetails
} = require('./handlers');

/**
 * Main AWS Lambda handler
 * 
 * Supported endpoints:
 * - GET /health - Service health check
 * - GET /test - Steam API connectivity test
 * - GET /games/{steamid} - Get owned games for Steam user
 * - GET /resolve/{vanityurl} - Resolve vanity URL to Steam ID
 * - GET /batch-appdetails?appids=1,2,3 - Batch fetch app details
 * - POST /batch-appdetails with {"appids": [1,2,3]} - Batch fetch app details
 * - OPTIONS * - CORS preflight handling
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
    let result;

    // Route to appropriate handler
    if (path === '/health') {
      result = await handleHealth();
      return createResponse(200, result, origin);
    }

    if (path === '/test') {
      result = await handleTest();
      return createResponse(200, result, origin);
    }

    // Resolve vanity URL
    if (path.startsWith('/resolve/')) {
      const vanityUrl = path.split('/')[2];
      result = await handleResolveVanityUrl(vanityUrl);
      return createResponse(200, result, origin);
    }

    // Get owned games
    if (path.startsWith('/games/')) {
      const steamId = path.split('/')[2];
      result = await handleGetOwnedGames(steamId);
      return createResponse(200, result, origin);
    }

    // Batch app details
    if (path === '/batch-appdetails' || path === '/appdetails') {
      result = await handleBatchAppDetails(event);
      return createResponse(200, result, origin);
    }

    // Unknown endpoint
    return createResponse(404, {
      error: 'Endpoint not found',
      available_endpoints: [
        'GET /health',
        'GET /test',
        'GET /games/{steamid}',
        'GET /resolve/{vanityurl}',
        'GET /batch-appdetails?appids=1,2,3 or POST /appdetails with {"appids": [1,2,3]}'
      ]
    }, origin);

  } catch (error) {
    console.error('Handler error:', error);
    
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, origin);
  }
};
