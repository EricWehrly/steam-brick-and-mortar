// Run all tests
require('./setup');

async function runAllTests() {
  console.log('🧪 Running all Lambda tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Health check
  console.log('='.repeat(50));
  try {
    require('./test-health');
    passed++;
  } catch (error) {
    console.error('Health test failed:', error);
    failed++;
  }
  
  // Test 2: Steam API endpoints
  console.log('='.repeat(50));
  try {
    await require('./test-steam-api');
    passed++;
  } catch (error) {
    console.error('Steam API tests failed:', error);
    failed++;
  }
  
  console.log('='.repeat(50));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Lambda code is ready for deployment.');
  } else {
    console.log('❌ Some tests failed. Please fix issues before deploying.');
  }
  
  return failed === 0;
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runAllTests;
