# Steam API Lambda Proxy Infrastructure Plan

## Project Overview

Build a serverless Steam Web API proxy using AWS Lambda, API Gateway, and Terraform for infrastructure as code. This approach provides a scalable, secure, and cost-effective solution for Steam API integration without requiring dedicated server management.

## Architecture Overview

### High-Level Architecture
```
[WebXR Client] → [API Gateway] → [Lambda Function] → [Steam Web API]
```

### Components
1. **AWS Lambda Function**: Serverless proxy for Steam Web API calls
2. **API Gateway**: HTTP API endpoint with CORS and rate limiting
3. **Route 53**: Domain management for API endpoint
4. **Secrets Manager**: Secure Steam API key storage
5. **CloudWatch**: Logging and monitoring
6. **Terraform**: Infrastructure as Code (IaC)

## Infrastructure Design

### AWS Lambda Function
**Runtime**: Node.js 18.x or 20.x
**Memory**: 256 MB (adjustable based on performance)
**Timeout**: 30 seconds
**Environment**: 
- Production and Development stages

**Function Responsibilities**:
- Accept incoming HTTP requests from API Gateway
- Validate request parameters (Steam ID format, etc.)
- Retrieve Steam API key from Secrets Manager
- Make authenticated requests to Steam Web API
- Transform and enhance response data (add artwork URLs)
- Return JSON response with CORS headers
- Log requests for monitoring and debugging

### API Gateway Configuration
**Type**: HTTP API (lower cost than REST API)
**Endpoints**:
- `GET /games/{steamid}` - Get owned games for Steam user
- `GET /resolve/{vanityurl}` - Resolve vanity URL to Steam ID
- `GET /health` - Health check endpoint
- `GET /test` - Test connectivity with known public profile

**Features**:
- CORS configuration for WebXR client domains
- Rate limiting (1000 requests per minute per IP)
- Request validation and parameter constraints
- Custom domain mapping
- API key authentication (optional, for rate limiting)

### Domain Configuration
**Primary Domain**: Use existing domain in AWS account
**Subdomain Strategy**: `steam-api.{existing-domain}.com`
**SSL Certificate**: AWS Certificate Manager (ACM)
**DNS**: Route 53 hosted zone

### Security & Secrets Management
**Steam API Key Storage**: AWS Secrets Manager
- Encrypted at rest and in transit
- IAM role-based access for Lambda function only
- Automatic rotation capability (if needed)
- Version management for key updates

**IAM Roles**:
- Lambda execution role with minimal permissions
- Secrets Manager read access
- CloudWatch Logs write access
- No unnecessary permissions

### Monitoring & Logging
**CloudWatch Logs**: All Lambda function logs
**CloudWatch Metrics**: 
- Request count
- Error rates
- Response times
- Steam API success/failure rates

**Alarms**:
- High error rate (>5% over 5 minutes)
- High latency (>10 seconds average)
- Steam API connectivity issues

## Terraform Infrastructure

### Directory Structure
```
terraform/
├── main.tf                 # Main Terraform configuration
├── variables.tf           # Input variables
├── outputs.tf            # Output values
├── versions.tf           # Provider versions
├── modules/
│   ├── lambda/
│   │   ├── main.tf       # Lambda function configuration
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── api-gateway/
│   │   ├── main.tf       # API Gateway configuration
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── domain/
│       ├── main.tf       # Domain and certificate configuration
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   ├── dev.tfvars        # Development environment variables
│   └── prod.tfvars       # Production environment variables
└── lambda-src/
    ├── index.js          # Lambda function source code
    ├── package.json      # Dependencies
    └── utils/
        └── steam-api.js  # Steam API utility functions
```

### Key Terraform Resources

**Lambda Function**:
```hcl
resource "aws_lambda_function" "steam_proxy" {
  filename         = "steam-proxy.zip"
  function_name    = "steam-api-proxy-${var.environment}"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      STAGE = var.environment
      STEAM_API_SECRET_ARN = aws_secretsmanager_secret.steam_api_key.arn
    }
  }
}
```

**API Gateway**:
```hcl
resource "aws_apigatewayv2_api" "steam_api" {
  name          = "steam-api-${var.environment}"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["content-type", "x-amz-date", "authorization"]
  }
}
```

**Secrets Manager**:
```hcl
resource "aws_secretsmanager_secret" "steam_api_key" {
  name = "steam-api-key-${var.environment}"
  description = "Steam Web API key for game library retrieval"
}
```

### Environment Variables
**Development**:
- Domain: `dev-steam-api.{domain}`
- Rate limit: 100 req/min
- CORS origins: `["http://localhost:3000", "http://localhost:5173"]`

**Production**:
- Domain: `steam-api.{domain}`
- Rate limit: 1000 req/min
- CORS origins: `["https://{production-domain}"]`

## Lambda Function Implementation

### Core Function Structure
```javascript
// index.js
const AWS = require('aws-sdk');
const https = require('https');

const secretsManager = new AWS.SecretsManager();

exports.handler = async (event) => {
  try {
    // Extract route and parameters
    const { httpMethod, path, pathParameters, queryStringParameters } = event;
    
    // Get Steam API key from Secrets Manager
    const steamApiKey = await getSteamApiKey();
    
    // Route to appropriate handler
    switch (path) {
      case '/games/{steamid}':
        return await handleGetGames(pathParameters.steamid, steamApiKey);
      case '/resolve/{vanityurl}':
        return await handleResolveVanity(pathParameters.vanityurl, steamApiKey);
      case '/health':
        return await handleHealth();
      case '/test':
        return await handleTest(steamApiKey);
      default:
        return createResponse(404, { error: 'Endpoint not found' });
    }
  } catch (error) {
    console.error('Lambda error:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
```

### Steam API Integration
```javascript
async function handleGetGames(steamId, apiKey) {
  // Validate Steam ID format
  if (!/^[0-9]{17}$/.test(steamId)) {
    return createResponse(400, { error: 'Invalid Steam ID format' });
  }
  
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
             `?key=${apiKey}&steamid=${steamId}&include_appinfo=true&format=json`;
  
  const response = await makeHttpRequest(url);
  
  // Enhance response with artwork URLs
  if (response.response && response.response.games) {
    response.response.games = response.response.games.map(game => ({
      ...game,
      artwork_urls: {
        library_600x900: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`,
        header: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        capsule: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/capsule_231x231.jpg`
      }
    }));
  }
  
  return createResponse(200, response);
}
```

## Deployment Strategy

### Development Workflow
1. **Local Development**: Test Lambda function locally with SAM CLI
2. **Terraform Plan**: Review infrastructure changes
3. **Terraform Apply**: Deploy to development environment
4. **Integration Testing**: Test API endpoints with WebXR client
5. **Production Deployment**: Deploy to production environment

### CI/CD Pipeline (Future Enhancement)
1. **GitHub Actions** or **AWS CodePipeline**
2. **Automated Testing**: Unit tests and integration tests
3. **Terraform Validation**: Plan and apply on merge
4. **Blue/Green Deployment**: Zero-downtime updates

## Cost Estimation

### AWS Lambda
- **Requests**: 1M requests/month = $0.20
- **Compute**: 256MB, 1 second average = $0.83
- **Total Lambda**: ~$1.03/month

### API Gateway
- **HTTP API**: 1M requests = $1.00
- **Data Transfer**: Minimal for JSON responses

### Route 53
- **Hosted Zone**: $0.50/month
- **DNS Queries**: $0.40 per million queries

### Secrets Manager
- **Secret Storage**: $0.40/month per secret

**Estimated Total**: $3-5/month for moderate usage

## Security Considerations

### API Security
- Steam API key never exposed to client
- Rate limiting to prevent abuse
- CORS restricted to known origins
- Input validation and sanitization

### AWS Security
- IAM roles with least privilege
- Secrets encrypted at rest and in transit
- VPC configuration (if needed for enhanced security)
- CloudTrail logging for audit trail

## Monitoring & Alerting

### Key Metrics
- **API Response Times**: P50, P95, P99 latencies
- **Error Rates**: 4xx and 5xx error percentages
- **Steam API Health**: Success rate of Steam API calls
- **Rate Limiting**: Requests blocked vs allowed

### Alerts
- **High Error Rate**: >5% errors over 5 minutes
- **High Latency**: >10 second average response time
- **Steam API Down**: >50% Steam API failures
- **Unusual Traffic**: 10x normal request volume

## Steam API Key Management

### Initial Setup
1. **Register Steam API Key**: Use existing domain for registration
2. **Store in Secrets Manager**: Encrypted storage with proper IAM access
3. **Terraform Integration**: Reference secret ARN in Lambda environment

### Key Rotation
- **Manual Process**: Update secret value in AWS console
- **Lambda Auto-Reload**: Function automatically picks up new key value
- **Zero Downtime**: No function redeployment needed

## Client Integration

### WebXR Application Changes
```javascript
// Replace direct Steam API calls with Lambda proxy
const STEAM_API_BASE = 'https://steam-api.{domain}.com';

async function fetchUserGames(steamId) {
  const response = await fetch(`${STEAM_API_BASE}/games/${steamId}`);
  return await response.json();
}
```

### Error Handling
- **Network Errors**: Retry with exponential backoff
- **Rate Limiting**: Display user-friendly message
- **Steam API Errors**: Graceful fallback to manual entry

## Next Steps

### Phase 1: Infrastructure Setup
1. ✅ **Plan Documentation** (this document)
2. 🔧 **Terraform Configuration** - Create all infrastructure modules
3. 🔧 **Lambda Function** - Implement Steam API proxy logic
4. 🔧 **Domain Configuration** - Set up custom domain and SSL
5. 🧪 **Testing** - Validate all endpoints work correctly

### Phase 2: Client Integration
1. 🔧 **Update WebXR Client** - Replace placeholder with Lambda calls
2. 🔧 **Steam ID Input UI** - Allow users to provide Steam information
3. 🔧 **Error Handling** - Robust error handling and user feedback
4. 🧪 **End-to-End Testing** - Full pipeline from UI to Steam API

### Phase 3: Enhancement
1. 🔧 **Caching Layer** - Add ElastiCache for performance
2. 🔧 **Analytics** - Track usage patterns and optimization opportunities
3. 🔧 **Multiple Game Sources** - Support for other gaming platforms
4. 🔧 **Advanced Features** - Game recommendations, library analysis

## Risk Mitigation

### Technical Risks
- **Steam API Changes**: Monitor Steam developer announcements
- **Rate Limiting**: Implement caching and request optimization  
- **Lambda Cold Starts**: Consider provisioned concurrency for production

### Business Risks
- **Cost Overruns**: Set up billing alerts and cost monitoring
- **Security Breaches**: Regular security reviews and penetration testing
- **Service Reliability**: Multi-region deployment for high availability

## Success Metrics

### Technical Metrics
- **API Uptime**: >99.9%
- **Response Time**: <2 seconds P95
- **Error Rate**: <1% overall

### User Experience Metrics
- **Game Library Load Time**: <5 seconds for typical library
- **Success Rate**: >95% successful game retrieval
- **User Satisfaction**: Measured through feedback and usage analytics

---

**Document Status**: ✅ Complete and ready for implementation
**Next Action**: Begin Terraform infrastructure development
**Priority**: High - Foundation for Steam integration
