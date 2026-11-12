#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release-local.sh [vX.Y.Z]
TAG="${1:-}"

if [[ -z "$TAG" ]]; then
  echo "Error: Tag version required. Example: ./scripts/release-local.sh v0.2.2"
  exit 1
fi

VERSION="${TAG#v}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Releasing Ayaz $TAG ($VERSION)..."

# Ensure dist directory is clean
rm -rf dist
mkdir -p dist bin

echo "==> 1. Building frontend..."
(cd frontend && bun install --frozen-lockfile && bun run build)

echo "==> 2. Building macOS package..."
wails3 task darwin:package
ditto -c -k --keepParent bin/ayaz.app dist/ayaz-macos-arm64.zip

echo "==> 3. Cross-compiling Windows (amd64)..."
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
  -trimpath \
  -ldflags="-w -s -H windowsgui -X github.com/Mirac61/ayaz/app.AppVersion=$VERSION" \
  -o bin/ayaz.exe .
(cd bin && zip -q -9 ../dist/ayaz-windows-amd64.zip ayaz.exe)

echo "==> 4. Generating SHA256SUMS..."
(cd dist && shasum -a 256 *.zip > SHA256SUMS)

echo "==> Built artifacts in dist/:"
ls -lh dist/
cat dist/SHA256SUMS

echo ""
read -r -p "Publish release $TAG to GitHub? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  echo "==> Tagging and pushing git tag..."
  if ! git rev-parse "$TAG" >/dev/null 2>&1; then
    git tag -a "$TAG" -m "Release $TAG"
  fi
  git push origin "$TAG" || true

  echo "==> Publishing GitHub release..."
  if gh release view "$TAG" --repo Mirac61/ayaz >/dev/null 2>&1; then
    gh release upload "$TAG" dist/* --repo Mirac61/ayaz --clobber
  else
    gh release create "$TAG" dist/* --repo Mirac61/ayaz --title "$TAG" --generate-notes
  fi
  echo "==> Release $TAG published successfully!"
else
  echo "==> Skipping upload. Artifacts are ready in dist/."
fi
