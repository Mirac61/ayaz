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

BASE=$(gh pr view "$BRANCH" --json baseRefName --jq .baseRefName)
if [ "$BASE" != dev ]; then
  echo "PR $BRANCH ist auf $BASE gestapelt. Erst den Vorgänger mergen."
  exit 1
fi

git fetch origin "$BRANCH"
OLD_TIP=$(git rev-parse "origin/$BRANCH")

echo "Merge PR für Branch $BRANCH nach dev..."
gh pr merge "$BRANCH" --squash
git fetch origin dev

# Gestapelte PRs nachziehen: Kinder ohne die Vorgänger-Commits auf die neue Basis setzen, rekursiv.
# $1 = Branch des Vorgängers, $2 = dessen alter Stand, $3 = neue Basis (Commit)
restack() {
  local child old new wt
  for child in $(gh pr list --state open --base "$1" --json headRefName --jq '.[].headRefName'); do
    git fetch origin "$child"
    old=$(git rev-parse "origin/$child")
    wt=$(mktemp -d)
    git worktree add -q --detach "$wt" "$old"
    if git -C "$wt" rebase -q --onto "$3" "$2"; then
      git -C "$wt" push -q --force-with-lease="$child:$old" origin "HEAD:$child"
      new=$(git -C "$wt" rev-parse HEAD)
      echo "↪ $child neu gestapelt."
      [ "$1" = "$BRANCH" ] && gh pr edit "$child" --base dev >/dev/null
      git worktree remove --force "$wt"
      restack "$child" "$old" "$new"
    else
      git -C "$wt" rebase --abort
      git worktree remove --force "$wt"
      echo "⚠️  $child ließ sich nicht automatisch neu stapeln (Konflikt). Bitte von Hand rebasen."
      STACK_OK=0
    fi
  done
}
STACK_OK=1
restack "$BRANCH" "$OLD_TIP" "origin/dev"
# Branch erst löschen, wenn alle Kinder umgezogen sind, sonst schließt GitHub ihre PRs.
[ "$STACK_OK" = 1 ] && git push -q origin --delete "$BRANCH"

git checkout dev
git pull origin dev

waypoint task done "$TASK_ID"
echo "✅ Task #$TASK_ID gemergt und in Waypoint auf DONE gesetzt."
