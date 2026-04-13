const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const axios = require('axios');
const { gunzipSync, gzipSync } = require('zlib');

const s3Client = new S3Client({});
const CACHE_BUCKET_NAME = process.env.CACHE_BUCKET_NAME;
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : 100;
// We enforce 1.1s minimum delay between SteamSpy API requests
const STEAMSPY_DELAY_MS = 1100;

// Singleton lock key
const LOCK_KEY = 'hydrator_state/lock.json';

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchSteamSpyData(appid, retryCount = 0, maxRetries = 3) {
  try {
    const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(`[AppID ${appid}] Rate limited by SteamSpy (429). Retrying...`);
      if (retryCount < maxRetries) {
        // Exponential backoff with a base of 2 seconds
        const delay = Math.pow(2, retryCount + 1) * 1000;
        await sleep(delay);
        return fetchSteamSpyData(appid, retryCount + 1, maxRetries);
      }
    }
    throw error;
  }
}

async function getBaseDataFromS3(appid) {
  const sourceKey = `appdetails/${appid}.json.gz`;
  try {
    const getCommand = new GetObjectCommand({
      Bucket: CACHE_BUCKET_NAME,
      Key: sourceKey,
    });
    const { Body } = await s3Client.send(getCommand);
    const compressedData = await streamToBuffer(Body);
    return JSON.parse(gunzipSync(compressedData).toString('utf-8'));
  } catch (err) {
    console.error(`[AppID ${appid}] Failed to read base data from S3 (${sourceKey}):`, err);
    throw err;
  }
}

async function writeHydratedDataToS3(appid, finalData) {
  const hydratedPrefix = process.env.HYDRATED_PREFIX || 'appDetailsWithTags/';
  const targetKey = `${hydratedPrefix}${appid}.json.gz`;
  const compressedFinalData = gzipSync(JSON.stringify(finalData));
  
  const putCommand = new PutObjectCommand({
    Bucket: CACHE_BUCKET_NAME,
    Key: targetKey,
    Body: compressedFinalData,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  });
  
  await s3Client.send(putCommand);
  console.log(`[AppID ${appid}] Finished. Wrote to ${targetKey}`);
  return targetKey;
}

function mergeData(baseData, steamSpyData) {
  const targetMerge = baseData.data && baseData.data.full_data ? baseData.data.full_data : baseData;
  
  // Prioritize Steam data over SteamSpy data.
  // This logically follows the `const finalData = steamSpyData && baseData` fallback approach.
  const mergedFullData = {
    ...steamSpyData,
    ...targetMerge
  };

  if (baseData.data && baseData.data.full_data) {
    return {
      ...baseData,
      data: {
        ...baseData.data,
        full_data: mergedFullData
      }
    };
  }
  return mergedFullData;
}

async function processAppId(appid) {
  // 1. Read base data from S3
  const baseData = await getBaseDataFromS3(appid);

  // 2. Fetch SteamSpy Data
  let steamSpyData = null;
  let mergeFailed = false;
  try {
    steamSpyData = await fetchSteamSpyData(appid);
    if (!steamSpyData || !steamSpyData.appid || steamSpyData.appid === 0) {
      mergeFailed = true;
    }
  } catch (err) {
    mergeFailed = true;
  }

  // 3. Merge Succeeded/Failed Data
  let finalData = baseData;
  if (!mergeFailed && steamSpyData) {
    finalData = mergeData(baseData, steamSpyData);
  }

  // 4. Write back to S3 hydrated path
  const targetKey = await writeHydratedDataToS3(appid, finalData);
  return { success: true, appid, targetKey, merged: !mergeFailed };
}

async function acquireLock() {
  try {
    const getCmd = new GetObjectCommand({ Bucket: CACHE_BUCKET_NAME, Key: LOCK_KEY });
    const { Body, LastModified } = await s3Client.send(getCmd);
    const lockData = JSON.parse((await streamToBuffer(Body)).toString('utf-8'));
    
    // If the lock is older than 6 minutes, consider it stale/dead and steal it
    // (Lambda timeout is 5 mins, so 6 is safe)
    const lockedAt = new Date(lockData.lockedAt).getTime();
    
    if (lockedAt > 0 && Date.now() - lockedAt < 6 * 60 * 1000) {
      return false; // Lock is currently active
    }
    console.log("Found stale or released lock. Overriding.");
  } catch (err) {
    // NoSuchKey means lock doesn't exist, which is fine
    if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404 && !err.message?.includes('NoSuchKey')) {
      throw err;
    }
  }

  // Write new lock
  const putCmd = new PutObjectCommand({
    Bucket: CACHE_BUCKET_NAME,
    Key: LOCK_KEY,
    Body: JSON.stringify({ lockedAt: new Date().toISOString() }),
    ContentType: 'application/json'
  });
  await s3Client.send(putCmd);
  return true;
}

async function releaseLock() {
  // A simple way to "release" is to just let it expire, or we can overwrite it with an empty state.
  // We'll write an unlocked state so the next run can immediately start.
  const putCmd = new PutObjectCommand({
    Bucket: CACHE_BUCKET_NAME,
    Key: LOCK_KEY,
    Body: JSON.stringify({ lockedAt: new Date(0).toISOString() }), // very old date = unlocked
    ContentType: 'application/json'
  });
  await s3Client.send(putCmd);
}

async function listAllKeys() {
  const keys = new Set();
  let continuationToken;
  do {
    // List everything in the bucket, then we will categorize by prefix locally
    const listCmd = new ListObjectsV2Command({
      Bucket: CACHE_BUCKET_NAME,
      ContinuationToken: continuationToken
    });
    const res = await s3Client.send(listCmd);
    (res.Contents || []).forEach(item => {
      keys.add(item.Key);
    });
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function runAutomatedBatchSweep(context) {
  // 1. Enforce Singleton Execution
  const hasLock = await acquireLock();
  if (!hasLock) {
    console.log("Another hydrator instance is currently running. Exiting to prevent Rate Limit conflicts.");
    return {
      statusCode: 429,
      body: JSON.stringify({ message: "Job is already locked and running." })
    };
  }

  try {
    // 2. Discover missing hydrated apps
    console.log("Listing all keys to find unhydrated apps...");
    const allKeys = await listAllKeys();
    
    const hydratedPrefix = process.env.HYDRATED_PREFIX || 'appDetailsWithTags/';
    const basePrefix = 'appdetails/';

    const baseAppIds = new Set();
    const hydratedAppIds = new Set();

    for (const key of allKeys) {
      if (key.startsWith(basePrefix)) {
        const match = key.match(/(\d+)\.json\.gz$/);
        if (match) baseAppIds.add(match[1]);
      } else if (key.startsWith(hydratedPrefix)) {
        const match = key.match(/(\d+)\.json\.gz$/);
        if (match) hydratedAppIds.add(match[1]);
      }
    }

    console.log(`Found ${baseAppIds.size} base apps and ${hydratedAppIds.size} hydrated apps.`);

    // Set difference: apps in base but not in hydrated
    const missingApps = Array.from(baseAppIds).filter(appid => !hydratedAppIds.has(appid));
    console.log(`Need to hydrate ${missingApps.length} apps.`);

    if (missingApps.length === 0) {
      console.log("Everything is fully hydrated! Exiting.");
      await releaseLock();
      return { statusCode: 200, body: JSON.stringify({ message: "Fully hydrated.", processed: 0 }) };
    }

    // 3. Batch processing loop
    const batch = missingApps.slice(0, BATCH_SIZE);
    console.log(`Starting processing for batch of ${batch.length} apps.`);

    const results = [];
    for (const appid of batch) {
      // Check remaining execution time
      // If we have less than 15 seconds remaining, safely bail out of the loop
      if (context.getRemainingTimeInMillis && context.getRemainingTimeInMillis() < 15000) {
        console.warn("Nearing Lambda timeout. Halting batch loop early.");
        break;
      }

      try {
        const result = await processAppId(appid);
        results.push(result);
      } catch (err) {
        console.error(`Failed to process appid ${appid} during batch loop:`, err);
        results.push({ appid, error: err.message });
      }

      // Enforce the strict minimum 1.1s delay required by SteamSpy rate limits
      await sleep(STEAMSPY_DELAY_MS);
    }

    // 4. Optional recursion trigger (Phase 3 placeholder)
    // If missingApps.length > batch.length, we still have work to do, 
    // but the next cron cycle will pick it up automatically.

    await releaseLock();
    console.log(`Batch finished. Processed ${results.length} apps.`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Batch processed successfully.", 
        processedCount: results.length,
        remainingCount: missingApps.length - results.length
      })
    };

  } catch (err) {
    // Cleanup lock safely on fatal error
    console.error("Critical error in automated sweep:", err);
    await releaseLock();
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}

exports.handler = async (event, context) => {
  console.log("SteamSpy Hydrator Lambda invoked", JSON.stringify(event));

  if (!CACHE_BUCKET_NAME) {
    throw new Error("CACHE_BUCKET_NAME environment variable is not set");
  }

  // Handle Phase 1 MVP Payload: Accept a manual payload { "appid": 10 }
  if (event.appid) {
    try {
      const result = await processAppId(event.appid);
      return {
        statusCode: 200,
        body: JSON.stringify(result)
      };
    } catch (error) {
      console.error(`[AppID ${event.appid}] Hydration failed critically:`, error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: error.message, stack: error.stack })
      };
    }
  }

  // ------------------------------------------
  // Phase 2: Automated Batch Sweep
  // ------------------------------------------
  
  return await runAutomatedBatchSweep(context);
};