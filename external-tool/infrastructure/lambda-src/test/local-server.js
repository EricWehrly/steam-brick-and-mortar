// Local Express server to mimic API Gateway
require('./setup');
const express = require('express');
const { handler } = require('../index');

const app = express();
const PORT = 3001;

// Middleware to parse JSON
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Convert Express request to Lambda event
function expressToLambdaEvent(req) {
  return {
    requestContext: {
      http: {
        method: req.method,
        path: req.path
      }
    },
    headers: req.headers,
    queryStringParameters: req.query,
    body: req.body ? JSON.stringify(req.body) : null
  };
}

// Route all requests through the Lambda handler
app.all('*', async (req, res) => {
  try {
    console.log(`${req.method} ${req.path}`);
    
    const lambdaEvent = expressToLambdaEvent(req);
    const result = await handler(lambdaEvent, {});
    
    // Set response headers
    Object.keys(result.headers || {}).forEach(key => {
      res.setHeader(key, result.headers[key]);
    });
    
    // Send response
    res.status(result.statusCode);
    
    if (result.headers['Content-Type'] === 'application/json') {
      res.json(JSON.parse(result.body));
    } else {
      res.send(result.body);
    }
  } catch (error) {
    console.error('Lambda handler error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local Steam API proxy running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  GET  http://localhost:${PORT}/test`);
  console.log(`  GET  http://localhost:${PORT}/games/{steamid}`);
  console.log(`  GET  http://localhost:${PORT}/resolve/{vanityurl}`);
  console.log('\nTest with curl:');
  console.log(`  curl http://localhost:${PORT}/health`);
  console.log(`  curl http://localhost:${PORT}/test`);
  console.log('\nPress Ctrl+C to stop');
});
