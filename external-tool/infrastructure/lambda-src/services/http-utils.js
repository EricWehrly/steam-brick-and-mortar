/**
 * HTTP utilities for CORS and response formatting
 */
const { ALLOWED_ORIGINS } = require('./config');

/**
 * Generate CORS headers for cross-origin requests
 * 
 * @param {string} origin - The origin header from the incoming request
 * @returns {Object} CORS headers object
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
 * @param {number} statusCode - HTTP status code (200, 404, 500, etc.)
 * @param {Object} body - Response body object (will be JSON.stringify'd)
 * @param {string|null} origin - Origin for CORS headers (optional)
 * @param {Object} headers - Additional headers to include (optional)
 * @returns {Object} Lambda proxy response object
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
 * @param {string} steamId - The Steam ID to validate
 * @returns {boolean} True if the Steam ID is a valid 17-digit number
 */
function isValidSteamId(steamId) {
  return /^\d{17}$/.test(steamId);
}

module.exports = {
  getCorsHeaders,
  createResponse,
  isValidSteamId
};
