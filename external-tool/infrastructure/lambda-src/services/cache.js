/**
 * Two-tier caching system: L1 (memory) and L2 (S3)
 */
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { gunzipSync, gzipSync } = require('zlib');
const { CACHE_BUCKET_NAME } = require('./config');

const s3Client = new S3Client({});

// In-memory cache for game data (L1 cache - lasts for Lambda container lifetime)
const memoryCache = new Map();

/**
 * Convert stream to buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Get game data from cache (L1 memory, then L2 S3)
 * 
 * @param {number} appid - Steam application ID
 * @returns {Promise<Object|null>} Cached game data or null if not found
 */
async function getFromCache(appid) {
  // L1: Check memory cache
  if (memoryCache.has(appid)) {
    console.log(`Memory cache HIT for appid ${appid}`);
    return memoryCache.get(appid);
  }

  // L2: Check S3 cache
  if (!CACHE_BUCKET_NAME) {
    console.log('No cache bucket configured, skipping S3 cache');
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: CACHE_BUCKET_NAME,
      Key: `appdetails/${appid}.json.gz`
    });

    const response = await s3Client.send(command);
    const compressed = await streamToBuffer(response.Body);
    const decompressed = gunzipSync(compressed);
    const data = JSON.parse(decompressed.toString('utf-8'));
    
    // Populate memory cache
    memoryCache.set(appid, data);
    console.log(`S3 cache HIT for appid ${appid}`);
    
    return data;
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      console.log(`Cache MISS for appid ${appid}`);
    } else {
      console.error(`S3 cache error for appid ${appid}:`, error.message);
    }
    return null;
  }
}

/**
 * Save game data to S3 cache
 * 
 * @param {string|number} appid - Steam application ID
 * @param {Object} data - Game data to cache
 */
async function saveToCache(appid, data) {
  if (!CACHE_BUCKET_NAME) {
    return;
  }

  try {
    const jsonString = JSON.stringify(data);
    const compressed = gzipSync(jsonString);
    
    const command = new PutObjectCommand({
      Bucket: CACHE_BUCKET_NAME,
      Key: `appdetails/${appid}.json.gz`,
      Body: compressed,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
      CacheControl: 'max-age=86400' // 24 hours
    });

    await s3Client.send(command);
    
    // Also update memory cache
    memoryCache.set(appid, data);
    
    console.log(`Saved appid ${appid} to S3 cache`);
  } catch (error) {
    console.error(`Failed to save appid ${appid} to cache:`, error.message);
  }
}

module.exports = {
  getFromCache,
  saveToCache
};
