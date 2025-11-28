/**
 * Secrets management - Steam API key retrieval
 */
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SECRETS_MANAGER_SECRET_NAME, ENVIRONMENT } = require('./config');

const secretsManager = new SecretsManagerClient({});

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
 * @returns {Promise<string>} The Steam Web API key
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

module.exports = { getSteamApiKey };
