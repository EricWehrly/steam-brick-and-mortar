#!/usr/bin/env bash
set -euo pipefail

# Downloads library artwork for every free-to-play game in the release's baked appdetails
# bundle, so it ships inside the release and never touches Steam's CDN for those games. See
# docs/plans/f2p-artwork-bake-plan.md.
#
# This is the one place in the release pipeline that actually has F2P-shaped domain knowledge -
# repack-steam-cache.sh no longer splits F2P out on its own, so this script reads the single
# combined bundle and filters is_free == true itself.
#
# Usage: bake-f2p-artwork.sh <app-details-bundle-gz> <out-dir>
#   app-details-bundle-gz is client/public/steam-cache/app-details.json.gz, produced by
#   repack-steam-cache.sh (release.sh Step 2).
#   out-dir receives <appid>.jpg per successfully-baked game, plus manifest.json
#
# A single download failure doesn't fail the run. A missing library_600x900.jpg means the game
# has no usable portrait artwork on Steam's CDN at all (not just that we skipped baking it - a
# runtime fetch would hit the same 404), so rather than silently falling back to a degraded box
# in what's meant to be the app's showcase, this writes undesirable_for_demo: true back onto
# that appid's entry in the bundle itself. GamesLoader.getDemoGames() filters on that flag
# alongside is_free, so the exclusion travels with the appdetails data through the same seed
# path everything else already uses - no separate runtime check needed.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/common.sh"

APP_DETAILS_BUNDLE="${1:?Usage: bake-f2p-artwork.sh <app-details-bundle-gz> <out-dir>}"
OUT_DIR="${2:?Usage: bake-f2p-artwork.sh <app-details-bundle-gz> <out-dir>}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

main() {
    log_step "Baking F2P artwork: ${APP_DETAILS_BUNDLE} -> ${OUT_DIR}"

    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq not found. Install it and re-run."
        exit 1
    fi

    if [ ! -f "$APP_DETAILS_BUNDLE" ]; then
        log_error "Appdetails bundle not found at ${APP_DETAILS_BUNDLE} - run repack-steam-cache.sh first."
        exit 1
    fi

    mkdir -p "$OUT_DIR"

    gunzip -c "$APP_DETAILS_BUNDLE" > "$WORK_DIR/bundle.json"

    local f2p_appids
    # jq emits CRLF line endings in this environment; strip \r or every appid
    # but the last picks up a trailing \r and silently 404s.
    f2p_appids="$(jq -r '.games | to_entries[] | select(.value.data.is_free == true) | .key' "$WORK_DIR/bundle.json" | tr -d '\r')"

    local baked=() failed=()
    local appid url dest
    for appid in $f2p_appids; do
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

    local failed_json
    failed_json="$(printf '%s\n' "${failed[@]:-}" | jq -R 'select(length > 0) | tonumber' | jq -s .)"

    jq --argjson failed "$failed_json" \
        'reduce $failed[] as $appid (.; .games[$appid | tostring].data.undesirable_for_demo = true)' \
        "$WORK_DIR/bundle.json" \
        | gzip -9 > "$WORK_DIR/bundle.json.gz"
    mv "$WORK_DIR/bundle.json.gz" "$APP_DETAILS_BUNDLE"

    log_success "Baked ${#baked[@]}/$(( ${#baked[@]} + ${#failed[@]} )) F2P artwork images to ${OUT_DIR}"
    if [ ${#failed[@]} -gt 0 ]; then
        log_warning "Failed appids (flagged undesirable_for_demo in ${APP_DETAILS_BUNDLE}): ${failed[*]}"
    fi
}

main "$@"
