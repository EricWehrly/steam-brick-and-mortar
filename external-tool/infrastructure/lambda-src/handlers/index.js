/**
 * Request handlers for different endpoints
 */
const axios = require('axios');
const { getSteamApiKey } = require('../services/secrets');
const { getAppDetails } = require('../services/steam-api');
const { getFromCache } = require('../services/cache');
const { isValidSteamId } = require('../services/http-utils');
const { STEAM_API_BASE_URL } = require('../services/config');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({});
const HYDRATOR_LAMBDA_NAME = process.env.HYDRATOR_LAMBDA_NAME;

/**
 * Trigger the background hydrator lambda asynchronously
 */
async function triggerHydrator() {
  if (!HYDRATOR_LAMBDA_NAME) {
    console.log('HYDRATOR_LAMBDA_NAME not set, skipping background hydration trigger');
    return;
  }
  
  try {
    console.log(`Triggering background hydrator: ${HYDRATOR_LAMBDA_NAME}`);
    const command = new InvokeCommand({
      FunctionName: HYDRATOR_LAMBDA_NAME,
      InvocationType: 'Event', // Asynchronous execution
      Payload: JSON.stringify({}) // Empty payload triggers the automated sweep
    });
    await lambdaClient.send(command);
  } catch (error) {
    // We swallow this error because we don't want to break the main user response
    // if the background hydrator trigger fails
    console.error('Failed to trigger background hydrator:', error.message);
  }
}

/**
 * Handle health check endpoint (/health)
 */
async function handleHealth() {
  return {
    status: 'healthy',
    environment: process.env.ENVIRONMENT || 'dev',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
}

/**
 * Handle test endpoint (/test) - validates Steam API connectivity
 */
async function handleTest() {
  try {
    const apiKey = await getSteamApiKey();
    
    // Test Steam API connectivity with a simple request
    const response = await axios.get(`${STEAM_API_BASE_URL}/ISteamWebAPIUtil/GetSupportedAPIList/v1/`, {
      params: { key: apiKey },
      timeout: 5000
    });

    if (response.status === 200) {
      return {
        status: 'success',
        message: 'Steam API connectivity verified',
        timestamp: new Date().toISOString()
      };
    }

    return {
      status: 'error',
      message: 'Steam API returned unexpected status',
      details: response.status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to connect to Steam API',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Handle vanity URL resolution (/resolve/{vanityurl})
 */
async function handleResolveVanityUrl(vanityUrl) {
  if (!vanityUrl) {
    throw new Error('Vanity URL parameter is required');
  }

  const apiKey = await getSteamApiKey();

  try {
    const response = await axios.get(`${STEAM_API_BASE_URL}/ISteamUser/ResolveVanityURL/v1/`, {
      params: {
        key: apiKey,
        vanityurl: vanityUrl
      },
      timeout: 10000
    });

    const data = response.data.response;

    if (data.success === 1) {
      return {
        success: true,
        steamid: data.steamid,
        message: data.message || 'Vanity URL resolved successfully'
      };
    }

    return {
      success: false,
      message: data.message || 'Failed to resolve vanity URL'
    };
  } catch (error) {
    throw new Error(`Steam API error: ${error.message}`);
  }
}

/**
 * Handle owned games request (/games/{steamid})
 */
async function handleGetOwnedGames(steamId) {
  if (!steamId) {
    throw new Error('Steam ID parameter is required');
  }

  if (!isValidSteamId(steamId)) {
    throw new Error('Invalid Steam ID format (must be 17-digit Steam ID)');
  }

  const apiKey = await getSteamApiKey();

  try {
    const response = await axios.get(`${STEAM_API_BASE_URL}/IPlayerService/GetOwnedGames/v1/`, {
      params: {
        key: apiKey,
        steamid: steamId,
        include_appinfo: 1,
        include_played_free_games: 1
      },
      timeout: 15000
    });

    const gamesData = response.data.response;

    if (!gamesData.games || gamesData.games.length === 0) {
      return {
        success: true,
        game_count: 0,
        games: [],
        message: 'No games found or profile is private'
      };
    }

    return {
      success: true,
      game_count: gamesData.game_count,
      games: gamesData.games
    };
  } catch (error) {
    throw new Error(`Steam API error: ${error.message}`);
  }
}

/**
 * Handle batch app details request (/batch-appdetails)
 * Optimized for cache: checks ALL games against cache first, then only rate-limits uncached API calls
 */
async function handleBatchAppDetails(event) {
  let appids = [];

  // Try to get appids from query parameters first
  if (event.queryStringParameters?.appids) {
    const appidsParam = event.queryStringParameters.appids;
    appids = appidsParam.split(',').map(id => id.trim()).filter(id => id);
  }
  // If not in query params, try JSON body
  else if (event.body) {
    try {
      const body = JSON.parse(event.body);
      appids = body.appids || [];
    } catch (error) {
      throw new Error('Invalid JSON body');
    }
  }

  if (!appids || appids.length === 0) {
    throw new Error('appids parameter is required (comma-separated list or JSON array)');
  }

  console.log(`Processing batch of ${appids.length} appids`);

  // PHASE 1: Check cache for ALL games in parallel (fast, no rate limiting needed)
  const cacheCheckPromises = appids.map(appid => 
    getFromCache(parseInt(appid, 10))
      .then(cached => ({ appid: parseInt(appid, 10), cached }))
      .catch(err => ({ appid: parseInt(appid, 10), cached: null }))
  );
  
  const cacheResults = await Promise.all(cacheCheckPromises);
  
  // Separate cached from uncached
  const cachedGames = [];
  const uncachedAppids = [];
  
  for (const { appid, cached } of cacheResults) {
    if (cached) {
      cachedGames.push(cached);
    } else {
      uncachedAppids.push(appid);
    }
  }
  
  console.log(`Cache: ${cachedGames.length} hits, ${uncachedAppids.length} misses`);

  // PHASE 2: Fetch uncached games with rate limiting (10 at a time)
  const STEAM_API_BATCH_SIZE = 10; // Only rate-limit actual Steam API calls
  const uncachedResults = [];
  
  if (uncachedAppids.length > 0) {
    console.log(`Fetching ${uncachedAppids.length} uncached games from Steam API`);
    
    // Fire-and-forget the hydrator logic in the background if we're fetching new data
    // It'll sweep S3 after we write the cache out
    triggerHydrator();

    for (let i = 0; i < uncachedAppids.length; i += STEAM_API_BATCH_SIZE) {
      const batch = uncachedAppids.slice(i, i + STEAM_API_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(appid => getAppDetails(appid))
      );
      uncachedResults.push(...batchResults);
    }
  }

  // PHASE 3: Combine results
  const successful = [...cachedGames]; // Cached games are already successful
  const failed = [];

  // Add freshly fetched games
  uncachedResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // Remove from_cache flag before returning
      const { from_cache, ...cleanResult } = result.value;
      successful.push(cleanResult);
    } else {
      failed.push({
        appid: uncachedAppids[index],
        error: result.reason.message
      });
    }
  });

  const response = {
    success: true,
    total_requested: appids.length,
    total_successful: successful.length,
    total_failed: failed.length,
    cache_hits: cachedGames.length,
    cache_misses: uncachedAppids.length,
    results: successful,
    failed: failed.length > 0 ? failed : undefined,
    timestamp: new Date().toISOString()
  };
  
  console.log(`Batch complete: ${successful.length} successful, ${failed.length} failed`);
  return response;
}

module.exports = {
  handleHealth,
  handleTest,
  handleResolveVanityUrl,
  handleGetOwnedGames,
  handleBatchAppDetails
};
