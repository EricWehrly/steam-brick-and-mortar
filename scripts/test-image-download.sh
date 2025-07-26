#!/bin/bash

# Test script for image downloading and caching functionality
# This script tests the image downloading capabilities in the browser

echo "🧪 Testing Steam Image Download and Caching..."
echo ""

cd "$(dirname "$0")/../client"

# Start the development server in the background
echo "🚀 Starting development server..."
yarn serve &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    kill $SERVER_PID 2>/dev/null
    exit 0
}

# Set up cleanup on script exit
trap cleanup EXIT

echo "✅ Development server started (PID: $SERVER_PID)"
echo ""
echo "🌐 Open your browser to: http://localhost:5173"
echo ""
echo "📝 Manual Test Instructions:"
echo "1. Open browser console (F12)"
echo "2. In the console, type: await window.steamBrickAndMortarApp.getSteamIntegration().getGameLibraryState()"
echo "3. If no games loaded, load a Steam library first:"
echo "   - Enter a Steam profile name (e.g., 'spitemonger')"
echo "   - Wait for games to load progressively"
echo "4. Test image downloading:"
echo "   window.steamBrickAndMortarApp.getSteamIntegration().steamClient.downloadGameImage('https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg')"
echo "5. Check if image blob is returned and cached properly"
echo ""
echo "🔍 Expected Results:"
echo "- downloadGameImage() should return a Blob object"
echo "- Second call to same URL should be faster (cached)"
echo "- Images should be cached in IndexedDB (check Application tab in DevTools)"
echo ""
echo "Press Ctrl+C to stop the test server..."

# Wait for user to stop the script
wait $SERVER_PID
