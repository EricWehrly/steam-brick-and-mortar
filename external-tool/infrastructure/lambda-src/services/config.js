/**
 * Configuration and environment variables
 */

// Environment variables
const SECRETS_MANAGER_SECRET_NAME = process.env.SECRETS_MANAGER_SECRET_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';
const ALLOWED_ORIGINS = JSON.parse(process.env.ALLOWED_ORIGINS || '[]');
const CACHE_BUCKET_NAME = process.env.CACHE_BUCKET_NAME;

// Steam API constants
const STEAM_API_BASE_URL = 'https://api.steampowered.com';

module.exports = {
  SECRETS_MANAGER_SECRET_NAME,
  ENVIRONMENT,
  ALLOWED_ORIGINS,
  CACHE_BUCKET_NAME,
  STEAM_API_BASE_URL
};
