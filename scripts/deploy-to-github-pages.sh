#!/usr/bin/env bash
set -euo pipefail

# Manual publish flow for GitHub Pages.
# Intentionally explicit, like terraform apply.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# if [[ -n "$(git status --porcelain)" ]]; then
#   echo "Refusing to deploy: working tree is not clean. Commit/stash first."
#   exit 1
# fi

if ! git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  echo "gh-pages does not exist on origin. Run: bash scripts/init-github-pages.sh"
  exit 1
fi

echo "Building client for GitHub Pages path..."
cd "$REPO_ROOT/client"
# Skip tsc type-check for deploy; use vite build directly.
# Run 'yarn type-check' separately if you want to gate on types before publishing.
MSYS_NO_PATHCONV=1 yarn vite build --base=/steam-brick-and-mortar/ --sourcemap false
cd "$REPO_ROOT"

echo "Publishing client/dist to gh-pages via temporary clone..."
ORIGIN_URL="$(git remote get-url origin)"
TMP_PUBLISH_DIR="$(mktemp -d -t gh-pages-publish-XXXXXX)"

cleanup() {
  rm -rf "$TMP_PUBLISH_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git clone --single-branch --branch gh-pages "$ORIGIN_URL" "$TMP_PUBLISH_DIR" >/dev/null 2>&1

# Replace branch contents with current dist output.
find "$TMP_PUBLISH_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$REPO_ROOT/client/dist/." "$TMP_PUBLISH_DIR/"

# Exclude unused assets from deployment.
rm -f "$TMP_PUBLISH_DIR/models/video_store_shelf.glb"

# Keep Pages static serving behavior explicit.
touch "$TMP_PUBLISH_DIR/.nojekyll"

cd "$TMP_PUBLISH_DIR"
git add -A

if git diff --cached --quiet; then
  echo "No changes to publish."
else
  git commit -m "Deploy GitHub Pages"
  git push origin gh-pages
fi

echo "Publish complete: https://EricWehrly.github.io/steam-brick-and-mortar/"
