#!/usr/bin/env bash
set -euo pipefail

# Downloads library artwork for every free-to-play game in the release's baked appdetails
# bundle and stitches it into a single grid ("pack") image, so it ships inside the release
# and never touches Steam's CDN for those games. See docs/plans/f2p-artwork-bake-plan.md.
#
# This is the one place in the release pipeline that actually has F2P-shaped domain knowledge -
# repack-steam-cache.sh no longer splits F2P out on its own, so this script reads the single
# combined bundle and filters is_free == true itself.
#
# Usage: bake-f2p-artwork.sh <app-details-bundle-gz> <out-dir>
#   app-details-bundle-gz is client/public/steam-cache/app-details.json.gz, produced by
#   repack-steam-cache.sh (release.sh Step 2).
#   out-dir receives pack.jpg (one grid image, TILE_WIDTHxTILE_HEIGHT cells, no gaps) and
#   pack-index.json (appid -> pixel offset within the grid, plus tile size).
#
# Why a grid image instead of N separate files or a bespoke concatenated-bytes bundle: fewer
# requests (1 instead of N), a real size win from unifying JPEG quality across all tiles in one
# encode pass (measured 2026-07-12: 75 images, 4.2 MiB individually vs 2.6 MiB as one grid), and
# - the deciding factor - it's a plain JPEG. Anyone can open pack.jpg in any image viewer and see
# exactly what it is, no bespoke format or tooling required to inspect it.
#
# Tile size is fixed at 300x450 - not arbitrary: LodArtworkOrchestrator already treats 300x450 as
# the effective ceiling for HIGH-tier textures regardless of source resolution (see the "Steam
# library image CDN reality check" comment there), so normalizing every tile to that size loses
# nothing the renderer would have kept anyway.
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

TILE_WIDTH=300
TILE_HEIGHT=450
JPEG_QUALITY=85

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

main() {
    log_step "Baking F2P artwork: ${APP_DETAILS_BUNDLE} -> ${OUT_DIR}"

    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq not found. Install it and re-run."
        exit 1
    fi

    local magick_bin
    magick_bin="$(command -v magick || command -v convert || true)"
    if [ -z "$magick_bin" ]; then
        log_error "ImageMagick (magick/convert) not found. Install it and re-run."
        exit 1
    fi

    if [ ! -f "$APP_DETAILS_BUNDLE" ]; then
        log_error "Appdetails bundle not found at ${APP_DETAILS_BUNDLE} - run repack-steam-cache.sh first."
        exit 1
    fi

    mkdir -p "$OUT_DIR" "$WORK_DIR/images"

    gunzip -c "$APP_DETAILS_BUNDLE" > "$WORK_DIR/bundle.json"

    local f2p_appids
    # jq emits CRLF line endings in this environment; strip \r or every appid
    # but the last picks up a trailing \r and silently 404s.
    f2p_appids="$(jq -r '.games | to_entries[] | select(.value.data.is_free == true) | .key' "$WORK_DIR/bundle.json" | tr -d '\r')"

    local baked=() failed=()
    local appid url dest
    for appid in $f2p_appids; do
        url="https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg"
        dest="$WORK_DIR/images/${appid}.jpg"

        if curl -sf --max-time 15 "$url" -o "$dest"; then
            baked+=("$appid")
        else
            log_warning "Failed to download artwork for appid ${appid} (skipping)"
            rm -f "$dest"
            failed+=("$appid")
        fi
    done

    if [ ${#baked[@]} -gt 0 ]; then
        build_pack "${baked[@]}"
    else
        log_warning "No F2P artwork baked successfully - skipping pack build"
    fi

    local failed_json
    failed_json="$(printf '%s\n' "${failed[@]:-}" | jq -R 'select(length > 0) | tonumber' | jq -s .)"

    jq --argjson failed "$failed_json" \
        'reduce $failed[] as $appid (.; .games[$appid | tostring].data.undesirable_for_demo = true)' \
        "$WORK_DIR/bundle.json" \
        | gzip -9 > "$WORK_DIR/bundle.json.gz"
    mv "$WORK_DIR/bundle.json.gz" "$APP_DETAILS_BUNDLE"

    log_success "Baked ${#baked[@]}/$(( ${#baked[@]} + ${#failed[@]} )) F2P artwork images into ${OUT_DIR}/pack.jpg"
    if [ ${#failed[@]} -gt 0 ]; then
        log_warning "Failed appids (flagged undesirable_for_demo in ${APP_DETAILS_BUNDLE}): ${failed[*]}"
    fi
}

# Stitches every baked appid's image into one grid ("pack") JPEG, sorted ascending by appid so
# the index (computed here) and the montage's actual layout can never drift apart - both derive
# from the same sorted list, same order, in the same function call.
build_pack() {
    local sorted_appids
    sorted_appids="$(printf '%s\n' "$@" | sort -n)"

    local sorted_files=()
    local appid
    while IFS= read -r appid; do
        sorted_files+=("$WORK_DIR/images/${appid}.jpg")
    done <<< "$sorted_appids"

    local n=${#sorted_files[@]}
    local columns rows
    columns=$(awk -v n="$n" 'BEGIN{c=int(sqrt(n)); if(c*c<n) c++; print c}')
    rows=$(awk -v n="$n" -v c="$columns" 'BEGIN{print int((n + c - 1)/c)}')

    log_info "Building ${columns}x${rows} artwork pack (${n} tiles, ${TILE_WIDTH}x${TILE_HEIGHT} each)..."

    "$magick_bin" montage "${sorted_files[@]}" \
        -tile "${columns}x${rows}" \
        -geometry "${TILE_WIDTH}x${TILE_HEIGHT}+0+0" \
        -background black \
        -quality "$JPEG_QUALITY" \
        "$OUT_DIR/pack.jpg"

    local generated_at index
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    # Must be the same sorted order used to build sorted_files above - the index and the montage's
    # actual layout only agree if both derive from the identical ordering.
    index="$(printf '%s\n' "$sorted_appids" | jq -R 'tonumber' | jq -s .)"

    jq -n \
        --arg gen "$generated_at" \
        --argjson tileWidth "$TILE_WIDTH" \
        --argjson tileHeight "$TILE_HEIGHT" \
        --argjson columns "$columns" \
        --argjson appids "$index" \
        '{
            generated_at: $gen,
            tileWidth: $tileWidth,
            tileHeight: $tileHeight,
            entries: (
                $appids | to_entries | map({
                    key: (.value | tostring),
                    value: { x: ((.key % $columns) * $tileWidth), y: ((.key / $columns | floor) * $tileHeight) }
                }) | from_entries
            )
        }' > "$OUT_DIR/pack-index.json"
}

main "$@"
