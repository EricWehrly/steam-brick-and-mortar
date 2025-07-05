#!/bin/bash

# Live Steam API Testing Script - Simplified Version
# Tests the deployed AWS infrastructure with real Steam accounts
# Part of Task 4.2.1.1: Test /resolve/{vanityurl} endpoint with SpiteMonger account

set -e

# Load common utilities
source "$(dirname "$0")/common.sh"

# Initialize script and create log file
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="steam-api-test-$TIMESTAMP.log"

# Redirect all output to both console and log file
exec > >(tee -a "$LOG_FILE")
exec 2>&1

# Initialize
init_script "Steam API Live Testing"

echo "=================================================="
log_info "Testing deployed AWS infrastructure"
log_info "Results will be logged to: $LOG_FILE"
echo "=================================================="

# Configuration
API_BASE_URL="https://steam-api-dev.wehrly.com"
TARGET_VANITY_URL="SpiteMonger"

# Test 1: Health Check
start_test "API Gateway Health Check"
if health_response=$(get_api_response "$API_BASE_URL/health"); then
    test_passed "Health endpoint - HTTP 200"
    if validate_steam_response "$health_response" "Health endpoint"; then
        log_info "Health check response:"
        echo "$health_response" | jq . || echo "$health_response"
    fi
else
    test_failed "Health endpoint failed"
fi
echo

# Test 2: Resolve SpiteMonger vanity URL
start_test "Resolve SpiteMonger vanity URL"
if resolve_response=$(get_api_response "$API_BASE_URL/resolve/$TARGET_VANITY_URL"); then
    test_passed "Resolve endpoint - HTTP 200"
    if validate_steam_response "$resolve_response" "Resolve endpoint"; then
        # Extract Steam ID for next test
        STEAM_ID=$(echo "$resolve_response" | jq -r '.steamid // empty')
        if [ -n "$STEAM_ID" ] && [ "$STEAM_ID" != "null" ]; then
            log_success "Resolved Steam ID: $STEAM_ID"
            log_info "Resolve response:"
            echo "$resolve_response" | jq . || echo "$resolve_response"
        else
            test_failed "Could not extract Steam ID from response"
            STEAM_ID=""
        fi
    fi
else
    test_failed "Resolve endpoint failed"
fi
echo

# Test 3: Fetch games for resolved Steam ID (if we got one)
if [ -n "$STEAM_ID" ]; then
    start_test "Fetch games for Steam ID: $STEAM_ID"
    if games_response=$(get_api_response "$API_BASE_URL/games/$STEAM_ID"); then
        test_passed "Games endpoint - HTTP 200"
        if validate_steam_response "$games_response" "Games endpoint"; then
            # Count games
            game_count=$(echo "$games_response" | jq -r '.game_count // 0')
            log_success "Found $game_count games in library"
            
            # Show first few games as sample
            log_info "Sample games:"
            echo "$games_response" | jq -r '.games[0:3][] | "  - \(.name) (AppID: \(.appid))"' 2>/dev/null || log_warning "Could not parse game list"
        fi
    else
        test_failed "Games endpoint failed"
    fi
else
    log_warning "Skipping games test - no Steam ID available"
fi
echo

# Test 4: CORS Headers Check
start_test "CORS Headers Validation"
log_info "Testing CORS preflight request..."

cors_response=$(curl -s -I -X OPTIONS "$API_BASE_URL/health" \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" 2>/dev/null)

if [ $? -eq 0 ]; then
    if echo "$cors_response" | grep -qi "access-control-allow-origin"; then
        test_passed "CORS headers present"
        log_info "CORS headers found:"
        echo "$cors_response" | grep -i "access-control" | sed 's/^/    /'
    else
        test_failed "CORS headers missing"
        log_info "Response headers received:"
        echo "$cors_response" | sed 's/^/    /'
    fi
else
    test_failed "CORS preflight request failed"
fi
echo

# Test 5: Error Handling
start_test "Error Handling - Invalid vanity URL"
error_response=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/resolve/invalid-user-that-should-not-exist-12345" 2>/dev/null)
error_code=$(echo "$error_response" | tail -n1)
error_body=$(echo "$error_response" | head -n -1)

if [[ "$error_code" =~ ^[45][0-9][0-9]$ ]]; then
    test_passed "Error handling - Returns appropriate error status: $error_code"
    log_info "Error response body:"
    echo "$error_body" | jq . 2>/dev/null || echo "$error_body"
else
    test_failed "Error handling - Expected 4xx/5xx status, got: $error_code"
fi
echo

# Print final summary
print_test_summary

log_info "Complete test results saved to: $LOG_FILE"
