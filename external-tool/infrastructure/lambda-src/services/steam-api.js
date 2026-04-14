/**
 * Steam API integration - App details fetching with rate limiting
 */
const axios = require('axios');
const RateLimiter = require('./RateLimiter');
const { getFromCache, saveToCache } = require('./cache');

const rateLimiter = new RateLimiter(5, 200); // Max 5 concurrent, 200ms between requests

/**
 * Get app details from Steam Store API with caching and retry logic
 * 
 * @param {string|number} appid - Steam application ID
 * @param {number} retryCount - Current retry attempt (internal use)
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} Game details object
 */
async function getAppDetails(appid, retryCount = 0, maxRetries = 3) {
  if (!appid) {
    throw new Error('App ID is required');
  }

  // Validate appid is numeric
  const numericAppid = parseInt(appid, 10);
  if (isNaN(numericAppid) || numericAppid <= 0) {
    throw new Error('Invalid App ID format');
  }

  // Check cache first
  const cached = await getFromCache(numericAppid);
  if (cached) {
    return cached;
  }

  // Acquire rate limiter permit
  await rateLimiter.acquire();

  try {
    // Call Steam Store API (no auth required)
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: {
        appids: numericAppid
      },
      timeout: 15000
    });

    // Response format: { "[appid]": { success: true/false, data: {...} } }
    const appData = response.data[numericAppid];

    if (!appData) {
      throw new Error('No data returned from Steam Store API');
    }

    if (!appData.success) {
      // Create a negative shell for delisted/hidden games
      const negativeResult = {
        success: false,
        appid: numericAppid,
        unlisted: true,
        data: {
          name: "Unknown Game",
          type: "game",
          artwork: {
            header: null,
            capsule: null,
            capsule_v5: null,
            background: null,
            background_raw: null
          },
          full_data: {}
        },
        retrieved_at: new Date().toISOString()
      };
      
      // Cache the negative result so we stop hitting Steam API for it
      await saveToCache(numericAppid, negativeResult);
      
      return negativeResult;
    }

    // Extract useful artwork URLs for easier client consumption
    const artworkUrls = {
      header: appData.data.header_image || null,
      capsule: appData.data.capsule_image || null,
      capsule_v5: appData.data.capsule_imagev5 || null,
      background: appData.data.background || null,
      background_raw: appData.data.background_raw || null
    };

    // Exclude heavy fields to reduce payload size
    const { detailed_description, about_the_game, ...cleanData } = appData.data;

    // Flatten key fields to top level for easier client access
    const result = {
      success: true,
      appid: numericAppid,
      data: {
        name: cleanData.name,
        type: cleanData.type,
        is_free: cleanData.is_free,
        short_description: cleanData.short_description,
        artwork: artworkUrls,
        // Lift commonly-used fields to top level
        categories: cleanData.categories || [],
        genres: cleanData.genres || [],
        developers: cleanData.developers || [],
        publishers: cleanData.publishers || [],
        release_date: cleanData.release_date || null,
        metacritic: cleanData.metacritic || null,
        // Keep full_data for anything else clients might need
        full_data: cleanData
      },
      retrieved_at: new Date().toISOString()
    };

    // Cache the result
    await saveToCache(numericAppid, result);

    return result;
  } catch (error) {
    // Handle rate limiting with exponential backoff
    if (error.response?.status === 429 && retryCount < maxRetries) {
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000); // Max 8 seconds
      console.log(`Rate limited for appid ${numericAppid}, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await rateLimiter.delay(backoffDelay);
      return getAppDetails(appid, retryCount + 1, maxRetries);
    }
    
    // Preserve error details for debugging
    if (error.response?.status === 429) {
      throw new Error('Steam Store API rate limit exceeded (HTTP 429)');
    }
    if (error.response?.status === 403) {
      throw new Error('Request failed with status code 403');
    }
    throw new Error(`Steam Store API error: ${error.message}`);
  } finally {
    rateLimiter.release();
  }
}

module.exports = {
  getAppDetails
};
