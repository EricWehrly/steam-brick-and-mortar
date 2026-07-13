#!/usr/bin/env bash
set -euo pipefail

# Repacks the raw per-appid S3 cache dump (thousands of independently-gzipped
# files) into one compact bundle the client fetches directly. See
# docs/plans/release-pipeline-plan.md ("Repack into one file").
#
# No F2P/rest split here - that was purely a loading-priority trick (fetch a
# tiny F2P bundle first) that stopped mattering once the client started
# awaiting the full seed before building the demo store anyway. F2P-specific
# filtering now lives in bake-f2p-artwork.sh, the one place in the pipeline
# that actually has F2P-shaped domain knowledge - see
# docs/plans/f2p-artwork-bake-plan.md.
#
# Usage: repack-steam-cache.sh <raw-dir> <out-dir>
#   raw-dir must contain appdetails/*.json.gz and/or appDetailsWithTags/*.json.gz
#   out-dir receives app-details.json.gz

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/common.sh"

RAW_DIR="${1:?Usage: repack-steam-cache.sh <raw-dir> <out-dir>}"
OUT_DIR="${2:?Usage: repack-steam-cache.sh <raw-dir> <out-dir>}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Decompress every *.json.gz in a tier directory and merge into one JSON
# object keyed by appid. Batched via xargs (not a per-file loop) - looping
# gunzip/jq per file over ~2800 files takes minutes; batching takes seconds.
# Drops unlisted/delisted entries (success == false, no usable data).
merge_tier() {
    local src_dir="$1" out_file="$2"

    if [ ! -d "$src_dir" ]; then
        echo '{}' > "$out_file"
        return
    fi

    find "$src_dir" -name '*.json.gz' -print0 \
        | xargs -0 gunzip -c \
        | jq -s 'map(select(.success == true and .data != null))
                 | map({(.appid | tostring): .})
                 | add // {}' \
        > "$out_file"
}

main() {
    log_step "Repacking steam cache: ${RAW_DIR} -> ${OUT_DIR}"
    mkdir -p "$OUT_DIR"

    log_info "Merging base tier (appdetails/)..."
    merge_tier "$RAW_DIR/appdetails" "$WORK_DIR/base.json"

    log_info "Merging hydrated tier (appDetailsWithTags/)..."
    merge_tier "$RAW_DIR/appDetailsWithTags" "$WORK_DIR/hydrated.json"

    log_info "Combining tiers (hydrated wins per-appid on overlap)..."
    # jq '+' is a shallow merge: for keys present in both, the right operand's
    # whole value replaces the left's. This matches the Lambda's own read-time
    # precedence (hydrated fully replaces base) rather than field-merging them.
    jq -s '.[0] + .[1]' "$WORK_DIR/base.json" "$WORK_DIR/hydrated.json" > "$WORK_DIR/merged.json"

    local generated_at
    generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    jq --arg gen "$generated_at" '{generated_at: $gen, games: .}' "$WORK_DIR/merged.json" \
        | gzip -9 > "$OUT_DIR/app-details.json.gz"

    local count size
    count=$(gunzip -c "$OUT_DIR/app-details.json.gz" | jq '.games | length')
    size=$(du -h "$OUT_DIR/app-details.json.gz" | cut -f1)

    log_success "app-details.json.gz: ${count} games, ${size}"
}

main "$@"
