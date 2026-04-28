#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

source "$REPO_ROOT/scripts/common.sh"

REPORT_JSON="${1:-$REPO_ROOT/docs/research/local-steam/local-steam-coverage-local-steam-spitemonger.json}"
STEAM_ROOT_INPUT="${2:-}"
OUTPUT_PREFIX="${3:-local-steam-spitemonger}"
OUTPUT_DIR="${4:-$REPO_ROOT/docs/research/local-steam}"
SAMPLE_LIMIT="${5:-20}"

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

windows_to_posix_path() {
  local candidate="$1"
  local normalized

  normalized="$(echo "$candidate" | sed 's#\\\\#/#g')"

  if [[ "$normalized" =~ ^([A-Za-z]):/(.*)$ ]]; then
    local drive
    drive="${BASH_REMATCH[1],,}"
    echo "/$drive/${BASH_REMATCH[2]}"
    return
  fi

  echo "$normalized"
}

detect_steam_root() {
  local candidates=(
    "/c/Program Files (x86)/Steam"
    "/c/Program Files/Steam"
    "$HOME/.steam/steam"
    "$HOME/.local/share/Steam"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate/steamapps" ]]; then
      echo "$candidate"
      return
    fi
  done

  return 1
}

sanitize_path() {
  local path="$1"
  echo "$path" | sed -E 's#/userdata/[0-9]+#/userdata/<redacted>#g'
}

init_script "Extract Local Steam App Signal Samples"

if [[ ! -f "$REPORT_JSON" ]]; then
  log_error "Coverage report not found: $REPORT_JSON"
  exit 1
fi

if [[ -n "$STEAM_ROOT_INPUT" ]]; then
  STEAM_ROOT="$(windows_to_posix_path "$STEAM_ROOT_INPUT")"
else
  STEAM_ROOT="$(detect_steam_root)" || {
    log_error "Could not detect Steam root. Pass it explicitly as arg #2."
    exit 1
  }
fi

if [[ ! -d "$STEAM_ROOT" ]]; then
  log_error "Steam root does not exist: $STEAM_ROOT"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

SAMPLE_APPIDS_FILE="$TEMP_DIR/sample_appids.txt"
COLLECTION_MAP_FILE="$TEMP_DIR/collection_map.tsv"
CONFIG_FILES_FILE="$TEMP_DIR/config_files.txt"
SAMPLES_JSON_FILE="$TEMP_DIR/app_samples.json"

OUTPUT_JSON="$OUTPUT_DIR/local-steam-app-signal-samples-${OUTPUT_PREFIX}.json"
OUTPUT_MD="$OUTPUT_DIR/local-steam-app-signal-samples-${OUTPUT_PREFIX}.md"

jq -r --argjson limit "$SAMPLE_LIMIT" '.samples.overlapFirst50[:$limit][]' "$REPORT_JSON" > "$SAMPLE_APPIDS_FILE"

log_info "Using $(wc -l < "$SAMPLE_APPIDS_FILE") overlap appids from report samples"

find "$STEAM_ROOT/userdata" -type f \( -name 'localconfig.vdf' -o -name 'sharedconfig.vdf' \) -print > "$CONFIG_FILES_FILE" || true

# Build appid -> collection-name map from cloud storage JSON.
find "$STEAM_ROOT/userdata" -type f -name 'cloud-storage-namespace-1.json' -print | while IFS= read -r cloud_file; do
  jq -r '
    .[]?
    | select(type == "array" and length == 2)
    | select((.[0] | type) == "string" and (.[0] | startswith("user-collections.")))
    | .[1].value
    | fromjson?
    | .name as $collectionName
    | (.added // [])[]?
    | select(type == "number")
    | "\(.)\t\($collectionName)"
  ' "$cloud_file" 2>/dev/null || true
done > "$COLLECTION_MAP_FILE"

jq -n --arg generatedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --arg steamRoot "$STEAM_ROOT" '
  {
    metadata: {
      generatedAt: $generatedAt,
      steamRoot: $steamRoot,
      note: "Signals are exploratory and local-config parsing is heuristic."
    },
    appSamples: []
  }
' > "$SAMPLES_JSON_FILE"

while IFS= read -r appid; do
  appid="$(echo "$appid" | tr -d '\r')"
  [[ -z "$appid" ]] && continue
  [[ ! "$appid" =~ ^[0-9]+$ ]] && continue

  collections_json="$(awk -F'\t' -v id="$appid" '$1 == id { print $2 }' "$COLLECTION_MAP_FILE" \
    | sort -u | jq -Rsc 'split("\n") | map(select(length > 0))')"

  config_signals_file="$(mktemp "$TEMP_DIR/config-signals-XXXX.jsonl")"
  : > "$config_signals_file"

  while IFS= read -r cfg_file; do
    [[ -z "$cfg_file" ]] && continue

    match_count="$(grep -F -c "\"$appid\"" "$cfg_file" 2>/dev/null || true)"
    if [[ -z "$match_count" ]]; then
      match_count=0
    fi

    first_line="$(grep -n -F "\"$appid\"" "$cfg_file" 2>/dev/null | head -n 1 | cut -d: -f1 || true)"
    snippet=""
    if [[ -n "$first_line" ]]; then
      start_line=$(( first_line > 4 ? first_line - 4 : 1 ))
      end_line=$(( first_line + 8 ))
      snippet="$(sed -n "${start_line},${end_line}p" "$cfg_file" 2>/dev/null || true)"
    fi

    jq -n \
      --arg path "$(sanitize_path "$cfg_file")" \
      --argjson matchCount "$match_count" \
      --arg snippet "$snippet" \
      '{ path: $path, matchCount: $matchCount, snippet: $snippet }' >> "$config_signals_file"
  done < "$CONFIG_FILES_FILE"

  config_signals_json="$(jq -s '.' "$config_signals_file")"

  jq \
    --argjson appid "$appid" \
    --argjson collections "$collections_json" \
    --argjson configSignals "$config_signals_json" \
    '.appSamples += [{
      appid: $appid,
      cloudCollections: $collections,
      configSignals: $configSignals
    }]' "$SAMPLES_JSON_FILE" > "$SAMPLES_JSON_FILE.next"
  mv "$SAMPLES_JSON_FILE.next" "$SAMPLES_JSON_FILE"
done < "$SAMPLE_APPIDS_FILE"

jq '.' "$SAMPLES_JSON_FILE" > "$OUTPUT_JSON"

cat > "$OUTPUT_MD" <<EOF
# Local Steam App Signal Samples

- Generated: $(jq -r '.metadata.generatedAt' "$OUTPUT_JSON")
- Steam root: C:/Program Files (x86)/Steam
- Source report: $(basename "$REPORT_JSON")
- Sample appids: $(jq -r '.appSamples | length' "$OUTPUT_JSON")

## Notes

- Paths are anonymized to avoid including local account IDs.
- cloudCollections comes from cloud-storage-namespace-1.json entries.
- configSignals comes from localconfig.vdf / sharedconfig.vdf quoted appid references with nearby snippets.
- Config parsing here is intentionally heuristic for discovery, not a canonical parser.

## Sample Blocks

EOF

while IFS= read -r appid; do
  appid="$(echo "$appid" | tr -d '\r')"
  [[ -z "$appid" ]] && continue
  [[ ! "$appid" =~ ^[0-9]+$ ]] && continue
  collections_line="$(jq -c --argjson appid "$appid" '.appSamples[] | select(.appid == $appid) | .cloudCollections' "$OUTPUT_JSON")"
  config_counts_line="$(jq -c --argjson appid "$appid" '.appSamples[] | select(.appid == $appid) | [.configSignals[] | {path, matchCount}]' "$OUTPUT_JSON")"

  {
    echo "### AppID $appid"
    echo
    echo "- Cloud collections: $collections_line"
    echo "- Config match counts: $config_counts_line"
    echo
    echo '```json'
    jq --argjson appid "$appid" '.appSamples[] | select(.appid == $appid)' "$OUTPUT_JSON"
    echo '```'
    echo
  } >> "$OUTPUT_MD"
done < "$SAMPLE_APPIDS_FILE"

log_success "Signal samples JSON written: $OUTPUT_JSON"
log_success "Signal samples markdown written: $OUTPUT_MD"