// Test Steam API endpoints locally
require('./setup');
const { handler } = require('../index');

async function testSteamAPI() {
  console.log('🎮 Testing Steam API Endpoints...\n');
  
  const baseEvent = {
    headers: {
      origin: 'http://localhost:3000'
    }
  };
  
  // Test 1: Test endpoint
  console.log('1. Testing /test endpoint...');
  try {
    const testEvent = {
      ...baseEvent,
      requestContext: {
        http: {
          method: 'GET',
          path: '/test'
        }
      }
    };
    
    const result = await handler(testEvent, {});
    const body = JSON.parse(result.body);
    
    console.log('   Status:', result.statusCode);
    console.log('   Steam API Connected:', body.steam_api_connected);
    console.log('   Test Profile:', body.test_profile);
    console.log('   Games Count:', body.games_count);
    
    if (result.statusCode === 200) {
      console.log('   ✅ Test endpoint PASSED\n');
    } else {
      console.log('   ❌ Test endpoint FAILED\n');
      console.log('   Error:', body.error);
    }
  } catch (error) {
    console.log('   ❌ Test endpoint ERROR:', error.message, '\n');
  }
  
  // Test 2: Resolve vanity URL
  console.log('2. Testing /resolve/{vanityurl} endpoint...');
  try {
    const resolveEvent = {
      ...baseEvent,
      requestContext: {
        http: {
          method: 'GET',
          path: '/resolve/gabelogannewell'
        }
      }
    };
    
    const result = await handler(resolveEvent, {});
    const body = JSON.parse(result.body);
    
    console.log('   Status:', result.statusCode);
    console.log('   Vanity URL:', body.vanity_url);
    console.log('   Steam ID:', body.steamid);
    
    if (result.statusCode === 200) {
      console.log('   ✅ Resolve endpoint PASSED\n');
    } else {
      console.log('   ❌ Resolve endpoint FAILED\n');
      console.log('   Error:', body.error);
    }
  } catch (error) {
    console.log('   ❌ Resolve endpoint ERROR:', error.message, '\n');
  }
  
  // Test 3: Get games for a specific Steam ID
  console.log('3. Testing /games/{steamid} endpoint...');
  try {
    const gamesEvent = {
      ...baseEvent,
      requestContext: {
        http: {
          method: 'GET',
          path: '/games/76561197960287930'  // Gabe Newell's Steam ID
        }
      }
    };
    
    const result = await handler(gamesEvent, {});
    const body = JSON.parse(result.body);
    
    console.log('   Status:', result.statusCode);
    console.log('   Steam ID:', body.steamid);
    console.log('   Game Count:', body.game_count);
    
    if (body.games && body.games.length > 0) {
      console.log('   Sample Game:', body.games[0].name);
      console.log('   Artwork URLs present:', !!body.games[0].artwork);
    }
    
    if (result.statusCode === 200) {
      console.log('   ✅ Games endpoint PASSED\n');
    } else {
      console.log('   ❌ Games endpoint FAILED\n');
      console.log('   Error:', body.error);
    }
  } catch (error) {
    console.log('   ❌ Games endpoint ERROR:', error.message, '\n');
  }
  
  console.log('🎮 Steam API testing complete!');
}

// Run the test
testSteamAPI().catch(console.error);
