#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./scripts/agent-merge.sh <waypoint-task-id>"
  exit 1
fi

TASK_ID="$1"
BRANCH="feat/task-$TASK_ID"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

echo "Merge PR für Branch $BRANCH nach dev..."
gh pr merge "$BRANCH" --squash --delete-branch

git checkout dev
git pull origin dev

waypoint task done "$TASK_ID"
echo "✅ Task #$TASK_ID gemergt und in Waypoint auf DONE gesetzt."
