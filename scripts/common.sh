#!/bin/bash

# Common utilities for Steam Brick and Mortar scripts
# Source this file at the beginning of your scripts with: source "$(dirname "$0")/common.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Test result tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test functions
start_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_step "Test $TOTAL_TESTS: $1"
}

test_passed() {
    PASSED_TESTS=$((PASSED_TESTS + 1))
    log_success "$1"
}

test_failed() {
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log_error "$1"
}

# Print test summary
print_test_summary() {
    echo
    echo "=================================="
    log_info "Test Summary:"
    log_info "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"
    if [ $FAILED_TESTS -gt 0 ]; then
        log_error "Failed: $FAILED_TESTS"
        echo "=================================="
        exit 1
    else
        log_success "All tests passed!"
        echo "=================================="
        exit 0
    fi
}

# HTTP testing utilities
# 
# LESSON LEARNED: When functions need to return data AND log output, separate these concerns.
# Functions that echo/log will contaminate variables that capture their output.
# Solution: Use separate functions for logging vs data retrieval, or use stderr for logs.

make_api_request() {
    local url="$1"
    local description="$2"
    
    # Log to stderr to avoid contaminating the returned response
    log_info "Making request to: $url" >&2
    
    # Make the request and capture both response and HTTP status
    local response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    # Check if curl command succeeded
    if [ $? -ne 0 ]; then
        test_failed "$description - curl command failed" >&2
        return 1
    fi
    
    # Check HTTP status code and log to stderr
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        test_passed "$description - HTTP $http_code" >&2
        # Output only the response body (not logs) so it can be captured cleanly
        echo "$body"
        return 0
    else
        test_failed "$description - HTTP $http_code" >&2
        log_error "Response body: $body" >&2
        return 1
    fi
}

# Alternative approach: Separate data retrieval from testing/logging
get_api_response() {
    local url="$1"
    
    # Pure data retrieval - no logging, just return the response body
    local response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    # Only return response if successful
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        echo "$body"
        return 0
    else
        return 1
    fi
}

test_api_endpoint() {
    local url="$1"
    local description="$2"
    
    # Pure testing function - only logs, doesn't return data
    log_info "Making request to: $url"
    
    local response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    if [ $? -ne 0 ]; then
        test_failed "$description - curl command failed"
        return 1
    fi
    
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        test_passed "$description - HTTP $http_code"
        return 0
    else
        test_failed "$description - HTTP $http_code"
        log_error "Response body: $body"
        return 1
    fi
}

# Steam API specific utilities
validate_steam_response() {
    local response="$1"
    local endpoint_name="$2"
    
    # Basic JSON validation
    if echo "$response" | jq . >/dev/null 2>&1; then
        test_passed "$endpoint_name returned valid JSON"
    else
        test_failed "$endpoint_name returned invalid JSON"
        return 1
    fi
    
    # Check for Steam API error
    local success=$(echo "$response" | jq -r '.response.success // empty')
    if [ "$success" = "false" ]; then
        test_failed "$endpoint_name - Steam API returned success: false"
        return 1
    fi
    
    return 0
}

# Check if required tools are available
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install missing dependencies and try again"
        exit 1
    fi
}

# Initialize common setup
init_script() {
    local script_name="$1"
    
    log_info "Starting $script_name"
    log_info "Timestamp: $(date)"
    echo
    
    check_dependencies
}
