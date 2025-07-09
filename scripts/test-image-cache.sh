#!/bin/bash

# Test Image Cache Script
# =======================
# 
# This script runs the Steam image caching tests and captures the output
# for review. The tests can take time due to async operations and timeouts.
# 
# Usage:
#   1. Run this script: ./scripts/test-image-cache.sh
#   2. Wait for completion (may take 1-2 minutes due to test timeouts)
#   3. Review the output in: client/test-results/image-cache-test.log
#   4. Check for specific failures and timing issues
# 
# The script will:
# - Run only the image caching tests (steam-image-cache.test.ts)
# - Capture both stdout and stderr
# - Include timestamps for debugging
# - Show a summary at the end

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Starting Steam Image Cache Tests${NC}"
echo "This may take 1-2 minutes due to test timeouts..."
echo ""

# Create results directory
mkdir -p client/test-results

# Navigate to client directory
cd client

# Run the specific image cache tests with full output
echo -e "${YELLOW}📝 Running tests and capturing output...${NC}"
echo "Start time: $(date)" > test-results/image-cache-test.log
echo "========================================" >> test-results/image-cache-test.log
echo "" >> test-results/image-cache-test.log

# Run the tests and capture all output
yarn test test/steam-image-cache.test.ts --reporter=verbose 2>&1 | tee -a test-results/image-cache-test.log

# Add completion timestamp
echo "" >> test-results/image-cache-test.log
echo "========================================" >> test-results/image-cache-test.log
echo "End time: $(date)" >> test-results/image-cache-test.log

# Show summary
echo ""
echo -e "${GREEN}✅ Test run completed!${NC}"
echo "Full output saved to: client/test-results/image-cache-test.log"
echo ""
echo -e "${YELLOW}📊 Quick Summary:${NC}"

# Extract key info from the log
if grep -q "failed" client/test-results/image-cache-test.log; then
    FAILED_COUNT=$(grep -o '[0-9]\+ failed' client/test-results/image-cache-test.log | head -1 | grep -o '[0-9]\+')
    echo -e "${RED}❌ Tests failed: $FAILED_COUNT${NC}"
else
    echo -e "${GREEN}✅ All tests passed!${NC}"
fi

if grep -q "passed" client/test-results/image-cache-test.log; then
    PASSED_COUNT=$(grep -o '[0-9]\+ passed' client/test-results/image-cache-test.log | head -1 | grep -o '[0-9]\+')
    echo -e "${GREEN}✅ Tests passed: $PASSED_COUNT${NC}"
fi

if grep -q "timed out" client/test-results/image-cache-test.log; then
    TIMEOUT_COUNT=$(grep -c "timed out" client/test-results/image-cache-test.log)
    echo -e "${YELLOW}⏰ Timeouts detected: $TIMEOUT_COUNT${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 To review detailed results:${NC}"
echo "cat client/test-results/image-cache-test.log"
echo ""
echo -e "${YELLOW}🔧 To view only failures:${NC}"
echo "grep -A 2 -B 2 'failed\\|timed out\\|Error' client/test-results/image-cache-test.log"
