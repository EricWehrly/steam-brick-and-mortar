#!/bin/bash

# Test Image Caching - Cleaned Up Version
# Tests the extracted image caching functionality with simplified mocks

echo "🧪 Testing Steam Image Caching (Cleaned Up)"
echo "=============================================="
echo ""

cd "c:/Users/e_weh/Dropbox/Projects/steam-brick-and-mortar/client"

echo "📁 Running image cache tests..."
yarn test steam-image-cache.test.ts > ./test-results/image-cache-clean-test.log 2>&1

echo ""
echo "✅ Test completed! Results saved to:"
echo "    test-results/image-cache-clean-test.log"
echo ""
echo "📊 Test Summary:"
echo "=================="

# Extract key information from the log
if [ -f "./test-results/image-cache-clean-test.log" ]; then
    # Count passing tests
    passing=$(grep -c "✓" ./test-results/image-cache-clean-test.log 2>/dev/null || echo "0")
    # Count failing tests  
    failing=$(grep -c "✗" ./test-results/image-cache-clean-test.log 2>/dev/null || echo "0")
    # Total tests (with safety check)
    total=$((${passing:-0} + ${failing:-0}))
    
    echo "✅ Passing: $passing"
    echo "❌ Failing: $failing"
    echo "📊 Total: $total"
    
    if [ "${failing:-1}" -eq 0 ]; then
        echo ""
        echo "🎉 ALL TESTS PASSING! Image caching implementation ready!"
    else
        echo ""
        echo "⚠️  Some tests failing. Check log for details."
    fi
    
    echo ""
    echo "📋 Recent test output:"
    echo "====================="
    tail -20 ./test-results/image-cache-clean-test.log
else
    echo "❌ Test log not found"
fi
