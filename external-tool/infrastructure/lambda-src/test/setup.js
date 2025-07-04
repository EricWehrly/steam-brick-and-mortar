// Local environment configuration for testing
require('dotenv').config();

// Mock AWS Secrets Manager for local testing
const mockSecretsManager = {
  send: async (command) => {
    // Mock GetSecretValueCommand
    if (command.input && command.input.SecretId) {
      return {
        SecretString: JSON.stringify({
          steam_api_key: process.env.STEAM_API_KEY || 'mock-api-key'
        })
      };
    }
    throw new Error('Mock Secrets Manager: Invalid command');
  }
};

// Override the AWS SDK for local testing
const originalSecretsManagerClient = require('@aws-sdk/client-secrets-manager').SecretsManagerClient;
require('@aws-sdk/client-secrets-manager').SecretsManagerClient = function() {
  return mockSecretsManager;
};

// Set up environment variables for local testing
process.env.SECRETS_MANAGER_SECRET_NAME = 'mock-secret';
process.env.ENVIRONMENT = 'local';
process.env.ALLOWED_ORIGINS = JSON.stringify([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080'
]);

console.log('Local testing environment configured');
console.log('Steam API Key:', process.env.STEAM_API_KEY ? 'SET' : 'NOT SET');
console.log('Environment:', process.env.ENVIRONMENT);
