#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================="
echo "☀️  AYAZ MORGEN-BRIEFING ($(date +%Y-%m-%d))"
echo "=========================================="

if [ -s "$REPO_ROOT/QUESTIONS.md" ]; then
  echo ""
  echo "🚨 OFFENE RÜCKFRAGEN / BLOCKIERTE TASKS:"
  echo "------------------------------------------"
  cat "$REPO_ROOT/QUESTIONS.md"
  echo "👉 Klärung: Antwort ins Plan-Doc schreiben, 'waypoint task todo <id>' ausführen und QUESTIONS.md leeren."
else
  echo ""
  echo "✅ Keine Rückfragen oder Fehler von heute Nacht."
fi

echo ""
echo "📦 OFFENE AGENT-PRs ZUM REVIEWEN:"
echo "------------------------------------------"
PR_LIST=$(gh pr list --label "ai-generated" --state open --json number,title,additions,deletions,headRefName \
  --template '{{range .}}PR #{{.number}} ({{.headRefName}}): {{.title}} [✨ +{{.additions}} / -{{.deletions}} Zeilen]{{"\n"}}{{end}}')

if [ -z "$PR_LIST" ]; then
  echo "Keine offenen PRs."
else
  echo "$PR_LIST"
fi

echo ""
echo "⚡ SCHNELLBEFEHLE:"
echo "  gh pr view <nr>                 # PR-Beschreibung & Manual-Check lesen"
echo "  gh pr diff <nr>                 # Code-Diff ansehen"
echo "  gh pr checkout <nr> && task dev # Lokal testen"
echo "  ./scripts/agent-merge.sh <id>   # PR mergen & Waypoint-Task auf DONE setzen"
