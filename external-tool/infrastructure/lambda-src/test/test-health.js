// Test the health endpoint locally
require('./setup');
const { handler } = require('../index');

async function testHealth() {
  console.log('🏥 Testing Health Endpoint...\n');
  
  const event = {
    requestContext: {
      http: {
        method: 'GET',
        path: '/health'
      }
    },
    headers: {
      origin: 'http://localhost:3000'
    }
  };
  
  try {
    const result = await handler(event, {});
    
    console.log('✅ Health Test Results:');
    console.log('Status Code:', result.statusCode);
    console.log('Headers:', JSON.stringify(result.headers, null, 2));
    
    const body = JSON.parse(result.body);
    console.log('Response Body:', JSON.stringify(body, null, 2));
    
    if (result.statusCode === 200 && body.status === 'healthy') {
      console.log('\n🎉 Health test PASSED!');
      return true;
    } else {
      console.log('\n❌ Health test FAILED!');
      return false;
    }
  } catch (error) {
    console.error('❌ Health test ERROR:', error);
    return false;
  }
}

// Run the test
testHealth().then(success => {
  process.exit(success ? 0 : 1);
});
