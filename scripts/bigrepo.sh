#!/bin/sh
# M51: a big repository for app/bigrepo_test.go: Go's own source tree, committed in a fresh repo.
# Usage: scripts/bigrepo.sh [dir]; then AYAZ_BIG_REPO=dir go test ./app -run BigRepo -v
set -eu
dir=${1:-${TMPDIR:-/tmp}/ayaz-bigrepo}
rm -rf "$dir"
cp -R "$(go env GOROOT)/src" "$dir"
git -C "$dir" init -q
git -C "$dir" add -A
git -C "$dir" -c user.name=perf -c user.email=perf@ayaz commit -q -m src
echo "$dir"
