#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/common.sh"

API_BASE_URL="${API_BASE_URL:-https://steam-api-dev.wehrly.com}"
TARGET_VANITY_URL="${1:-SpiteMonger}"
OUTPUT_PREFIX="${2:-$(echo "$TARGET_VANITY_URL" | tr '[:upper:]' '[:lower:]')}"
OUTPUT_DIR="${3:-$REPO_ROOT/docs/research}"

mkdir -p "$OUTPUT_DIR"

FULL_RESPONSE_PATH="$OUTPUT_DIR/live-games-response-${OUTPUT_PREFIX}.json"
APPIDS_PATH="$OUTPUT_DIR/live-appids-${OUTPUT_PREFIX}.json"

init_script "Live AppID Export"

log_step "Resolving vanity URL: $TARGET_VANITY_URL"
resolve_response="$(get_api_response "$API_BASE_URL/resolve/$TARGET_VANITY_URL")" || {
  log_error "Failed to resolve vanity URL '$TARGET_VANITY_URL'"
  exit 1
}

STEAM_ID="$(echo "$resolve_response" | jq -r '.steamid // empty')"
if [[ -z "$STEAM_ID" || "$STEAM_ID" == "null" ]]; then
  log_error "Could not extract steamid from resolve response"
  echo "$resolve_response" | jq .
  exit 1
fi

log_success "Resolved steamid: $STEAM_ID"

log_step "Fetching games library"
games_response="$(get_api_response "$API_BASE_URL/games/$STEAM_ID")" || {
  log_error "Failed to fetch games for steamid '$STEAM_ID'"
  exit 1
}

echo "$games_response" > "$FULL_RESPONSE_PATH"

APPIDS_JSON="$(echo "$games_response" | jq '[.games[]?.appid | select(type == "number")] | unique | sort')"
echo "$APPIDS_JSON" > "$APPIDS_PATH"

COUNT="$(echo "$APPIDS_JSON" | jq 'length')"

log_success "Exported $COUNT appids"
log_info "Full response: $FULL_RESPONSE_PATH"
log_info "AppIDs only:   $APPIDS_PATH"
