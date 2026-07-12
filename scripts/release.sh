#!/usr/bin/env bash
set -euo pipefail

# Release pipeline. See docs/plans/release-pipeline-plan.md for the full design.
#
# "release" is distinct from "build" and "deploy/publish":
#   build   -> yarn build / cargo tauri build (local, already works)
#   release -> this script: pull pre-baked data + build + pack a self-contained artifact
#   deploy  -> pushing a release across the machine boundary (hosting, distributing installers)
#
# Implements Steps 1-2 (S3 cache draw + repack). Later steps are stubbed.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/common.sh"

CACHE_BUCKET="steam-brick-and-mortar-dev-game-cache"
CACHE_REGION="us-east-1"
RAW_CACHE_DIR="$REPO_ROOT/.release-cache/raw"
BAKED_CACHE_DIR="$REPO_ROOT/client/public/steam-cache"
F2P_SEED_FILE="$REPO_ROOT/scripts/f2p-appid-seed.json"
F2P_ARTWORK_DIR="$REPO_ROOT/client/public/artwork-cache"

# ---------------------------------------------------------------------------
# Step 1: Pull the whole app-details cache the Lambda has already built in S3.
#
# Read-only. No Terraform, no infrastructure change. Grabs everything under
# appdetails/ and appDetailsWithTags/ (one gzipped-JSON object per appid) -
# no curation, no appid list, no "top N". hydrator_state/ is excluded: it's
# the Lambda's own internal bookkeeping (a lock file), not game data.
#
# Staged in .release-cache/ (gitignored, outside client/public/) since this
# is raw material for Step 2, not something the client ever serves directly.
# ---------------------------------------------------------------------------
fetch_s3_cache() {
    log_step "Pulling app-details cache from s3://${CACHE_BUCKET}"

    if ! command -v aws >/dev/null 2>&1; then
        log_error "AWS CLI not found. Install it and configure credentials, then re-run."
        exit 1
    fi

    mkdir -p "$RAW_CACHE_DIR"

    aws s3 sync "s3://${CACHE_BUCKET}/" "$RAW_CACHE_DIR" \
        --region "$CACHE_REGION" \
        --exclude "hydrator_state/*"

    local object_count total_bytes
    object_count=$(find "$RAW_CACHE_DIR" -type f | wc -l | tr -d ' ')
    total_bytes=$(find "$RAW_CACHE_DIR" -type f -exec cat {} + 2>/dev/null | wc -c | tr -d ' ')

    log_success "Cache synced: ${object_count} files, $(( total_bytes / 1024 )) KiB in ${RAW_CACHE_DIR}"
}

# ---------------------------------------------------------------------------
# Step 2: Repack the raw per-appid dump into two compact bundles the client
# fetches directly - see scripts/repack-steam-cache.sh and
# docs/plans/release-pipeline-plan.md.
# ---------------------------------------------------------------------------
repack_cache() {
    log_step "Repacking cache into client-ready bundles"

    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq not found. Install it and re-run."
        exit 1
    fi

    "$REPO_ROOT/scripts/repack-steam-cache.sh" "$RAW_CACHE_DIR" "$BAKED_CACHE_DIR"
}

# ---------------------------------------------------------------------------
# Step 2.5: Bake the F2P/anonymous-store artwork set into the release so it
# never touches Steam's CDN for those games - see scripts/bake-f2p-artwork.sh
# and docs/plans/f2p-artwork-bake-plan.md.
# ---------------------------------------------------------------------------
bake_f2p_artwork() {
    log_step "Baking F2P artwork set"

    "$REPO_ROOT/scripts/bake-f2p-artwork.sh" "$F2P_SEED_FILE" "$F2P_ARTWORK_DIR"
}

# ---------------------------------------------------------------------------
# Later steps - not yet implemented. See docs/plans/release-pipeline-plan.md.
# ---------------------------------------------------------------------------
build_web() {
    log_step "build_web: not yet implemented (yarn build)"
}

build_desktop() {
    log_step "build_desktop: not yet implemented (cargo tauri build)"
}

pack_release() {
    log_step "pack_release: not yet implemented (release.zip)"
}

main() {
    fetch_s3_cache
    repack_cache
    bake_f2p_artwork
    # build_web
    # build_desktop
    # pack_release
}

main "$@"
