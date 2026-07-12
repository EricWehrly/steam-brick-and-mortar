#!/usr/bin/env bash
set -euo pipefail

# Downloads library artwork for the F2P/anonymous-store seed set so it ships
# inside the release and never touches Steam's CDN for those games. See
# docs/plans/f2p-artwork-bake-plan.md.
#
# Usage: bake-f2p-artwork.sh <seed-file> <out-dir>
#   seed-file is scripts/f2p-appid-seed.json ({"appids": [440, 570, ...]})
#   out-dir receives <appid>.jpg per successfully-baked game, plus manifest.json
#
# A single download failure doesn't fail the run - the seed set is small and
# cheap to re-run, and a missing entry just means that one game falls back to
# the Steam CDN like any other. manifest.json lists only the appids that
# actually succeeded, since the client needs to know which local files it can
# trust rather than probing for 404s.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/common.sh"

SEED_FILE="${1:?Usage: bake-f2p-artwork.sh <seed-file> <out-dir>}"
OUT_DIR="${2:?Usage: bake-f2p-artwork.sh <seed-file> <out-dir>}"

main() {
    log_step "Baking F2P artwork: ${SEED_FILE} -> ${OUT_DIR}"

    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq not found. Install it and re-run."
        exit 1
    fi

    mkdir -p "$OUT_DIR"

    local appids
    # jq emits CRLF line endings in this environment; strip \r or every appid
    # but the last picks up a trailing \r and silently 404s.
    appids="$(jq -r '.appids[]' "$SEED_FILE" | tr -d '\r')"

    local baked=() failed=()
    local appid url dest
    for appid in $appids; do
        url="https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg"
        dest="$OUT_DIR/${appid}.jpg"

        if curl -sf --max-time 15 "$url" -o "$dest"; then
            baked+=("$appid")
        else
            log_warning "Failed to download artwork for appid ${appid} (skipping)"
            rm -f "$dest"
            failed+=("$appid")
        fi
    done

    local generated_at
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '%s\n' "${baked[@]:-}" \
        | jq -R 'select(length > 0) | tonumber' \
        | jq -s --arg gen "$generated_at" '{generated_at: $gen, appids: .}' \
        > "$OUT_DIR/manifest.json"

    log_success "Baked ${#baked[@]}/$(( ${#baked[@]} + ${#failed[@]} )) F2P artwork images to ${OUT_DIR}"
    if [ ${#failed[@]} -gt 0 ]; then
        log_warning "Failed appids: ${failed[*]}"
    fi
}

main "$@"
