# Steam API Lambda Infrastructure

This directory contains Terraform infrastructure as code (IaC) for deploying a serverless Steam Web API proxy using AWS Lambda, API Gateway, and supporting services.

## Architecture Overview

```
[WebXR Client] → [Route 53] → [API Gateway] → [Lambda Function] → [Steam Web API]
                     ↓
                [ACM Certificate]
                     ↓
               [CloudWatch Logs]
                     ↓
               [Secrets Manager]
```

## Components

- **AWS Lambda**: Serverless function handling Steam API requests
- **API Gateway HTTP API**: RESTful endpoint with CORS and rate limiting
- **Route 53 + ACM**: Custom domain with SSL certificate
- **Secrets Manager**: Secure Steam API key storage
- **CloudWatch**: Logging and monitoring

## Quick Start

### Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Terraform >= 1.0** installed
3. **Steam Web API key** from [Steam Dev Portal](https://steamcommunity.com/dev/apikey)
4. **Existing domain** in Route 53 hosted zone

### 1. Configure Variables

**Public Configuration:**
Use the provided test configuration for domain settings:
```bash
# From external-tool/infrastructure/ directory
# test.tfvars contains public domain configuration
```

**Secure Steam API Key (Choose one method):**

**Option A: Environment Variable (Recommended)**
```bash
export TF_VAR_steam_api_key="YOUR_STEAM_API_KEY_HERE"
terraform apply -var-file="test.tfvars"
```

**Option B: Local terraform.tfvars (Gitignored)**
```bash
# Create terraform.tfvars (automatically ignored by git)
echo 'steam_api_key = "YOUR_STEAM_API_KEY_HERE"' > terraform.tfvars
terraform apply -var-file="test.tfvars"
```

**Option C: Command Line**
```bash
terraform apply -var-file="test.tfvars" -var steam_api_key="YOUR_STEAM_API_KEY_HERE"
```

### 2. Initialize and Deploy

```bash
cd external-tool/infrastructure

# Initialize Terraform
terraform init

# Plan deployment (review changes)
terraform plan -var-file="environments/dev.tfvars"

# Apply infrastructure
terraform apply -var-file="environments/dev.tfvars"
```

### 3. Test the API

After deployment, test the endpoints:

```bash
# Get the API URL from Terraform outputs
terraform output api_custom_domain_url

# Test health endpoint
curl https://steam-api-dev.your-domain.com/health

# Test Steam API connectivity
curl https://steam-api-dev.your-domain.com/test
```

## Directory Structure

```
external-tool/infrastructure/
├── main.tf                 # Main configuration
├── variables.tf           # Input variables
├── outputs.tf            # Output values
├── versions.tf           # Provider versions
├── .gitignore           # Git ignore rules
├── README.md            # This file
├── environments/        # Environment-specific configs
│   ├── dev.tfvars      # Development settings
│   └── prod.tfvars     # Production settings
├── modules/            # Terraform modules
│   ├── lambda/         # Lambda function module
│   ├── api-gateway/    # API Gateway module
│   └── domain/         # Domain & SSL module
└── lambda-src/         # Lambda function source code
    ├── index.js        # Main handler
    └── package.json    # Dependencies
```

## Configuration

### Required Variables

These must be set in `terraform.tfvars.local` or environment variables:

- `steam_api_key` - Your Steam Web API key (sensitive)
- `domain_name` - Domain name that exists in your Route 53 hosted zone

### Environment Variables

For CI/CD or automated deployments:

```bash
export TF_VAR_steam_api_key="your_steam_api_key"
export TF_VAR_domain_name="your-domain.com"
```

### Customization

Edit `environments/{env}.tfvars` to customize:

- CORS origins for your WebXR application
- Lambda memory and timeout settings
- API Gateway rate limiting
- CloudWatch log retention
- AWS region

## API Endpoints

The deployed API provides these endpoints:

- `GET /health` - Health check and status
- `GET /test` - Test Steam API connectivity
- `GET /games/{steamid}` - Get owned games for Steam user
- `GET /resolve/{vanityurl}` - Resolve vanity URL to Steam ID

### Example Usage

```javascript
// In your WebXR application
const API_BASE = 'https://steam-api-dev.your-domain.com';

// Get user's game library
const response = await fetch(`${API_BASE}/games/76561197960287930`);
const data = await response.json();

console.log(`User has ${data.game_count} games`);
data.games.forEach(game => {
  console.log(`${game.name} - ${game.playtime_forever} minutes played`);
});
```

## Integration with WebXR Client

Once deployed, update your WebXR client to use the Lambda proxy:

```javascript
// In client/src/main.ts or similar
const STEAM_API_BASE = 'https://steam-api-dev.your-domain.com';

async function loadUserGames(steamId) {
  try {
    const response = await fetch(`${STEAM_API_BASE}/games/${steamId}`);
    const data = await response.json();
    
    // Create game boxes on the shelf
    data.games.forEach(game => {
      createGameBox(game);
    });
  } catch (error) {
    console.error('Failed to load Steam games:', error);
  }
}
```

## Deployment Commands

### Development Environment

```bash
cd external-tool/infrastructure

# Deploy to dev
terraform workspace select dev || terraform workspace new dev
terraform apply -var-file="environments/dev.tfvars"
```

### Production Environment

```bash
cd external-tool/infrastructure

# Deploy to prod
terraform workspace select prod || terraform workspace new prod
terraform apply -var-file="environments/prod.tfvars"
```

## Monitoring & Troubleshooting

### CloudWatch Logs

- Lambda function logs: `/aws/lambda/{project}-{env}-steam-proxy`
- API Gateway logs: `/aws/apigateway/{project}-{env}-steam-api`

### Common Issues

1. **Certificate validation fails**
   - Ensure domain exists in Route 53
   - Check DNS propagation

2. **Lambda timeout errors**
   - Increase `lambda_timeout` in environment config
   - Check Steam API response times

3. **CORS errors in browser**
   - Verify `allowed_origins` includes your client domain
   - Test preflight OPTIONS requests

4. **Steam API key errors**
   - Verify key is correct in Secrets Manager
   - Test key directly with Steam API

### Debugging Commands

```bash
# View Lambda logs
aws logs tail /aws/lambda/steam-brick-and-mortar-dev-steam-proxy --follow

# Test Lambda function directly
aws lambda invoke --function-name steam-brick-and-mortar-dev-steam-proxy \
  --payload '{"requestContext":{"http":{"method":"GET","path":"/health"}},"headers":{}}' \
  response.json
```

## Cost Estimation

### Development Environment (~$4/month)
- Lambda (1M requests, 256MB): ~$2
- API Gateway (1M requests): ~$1
- Route 53 hosted zone: $0.50
- CloudWatch logs: ~$0.50

### Production Environment (~$27.50/month)
- Lambda (10M requests, 512MB): ~$15
- API Gateway (10M requests): ~$10
- Route 53 hosted zone: $0.50
- CloudWatch logs: ~$2

## Lambda Development

### Local Testing

Before deploying to AWS, test the Lambda function locally:

```bash
cd lambda-src

# Install dependencies
yarn install

# Run all tests
yarn test

# Test individual endpoints
yarn test:health          # Test health endpoint
yarn test:steam-api       # Test Steam API integration

# Run local development server
yarn local-server         # Starts Express server on http://localhost:3001
```

### Local Environment Setup

Create a `.env` file in the `lambda-src` directory:

```bash
# lambda-src/.env
STEAM_API_KEY=your_steam_api_key_here
ENVIRONMENT=dev
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:5173"]
```

### Testing Commands

```bash
# Test health endpoint locally
curl http://localhost:3001/health

# Test Steam API connectivity
curl http://localhost:3001/test

# Test getting games for a Steam user
curl http://localhost:3001/games/76561197960287930
```

## Next Steps

After successful deployment:

1. **Test all endpoints** with your Steam API key
2. **Update WebXR client** to use the new API endpoints
3. **Configure production domain** and deploy to prod environment
4. **Set up monitoring** and alarms for production use
5. **Implement caching** if needed for high-traffic scenarios

## Cleanup

To destroy all infrastructure:

```bash
terraform destroy -var-file="environments/dev.tfvars"
```

**Warning**: This will permanently delete all resources including logs and SSL certificates.

## License

This infrastructure code is part of the Steam Brick and Mortar project.
