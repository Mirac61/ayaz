#!/bin/sh
# K2: memory of Ayaz plus its WebView processes, in MB.
# Usage: scripts/ram.sh [binary [args...]]   (default bin/ayaz; starts it, waits 10 s, measures, quits it)
set -eu
bin=${1:-bin/ayaz}
[ $# -gt 0 ] && shift

case $(uname) in
Darwin)
	# WebKit runs as XPC services owned by launchd, not as our children, so take the ones that appear after launch.
	webkit() { pgrep -f 'com.apple.WebKit\.' | sort; }
	before=$(webkit)
	"$bin" "$@" >/dev/null 2>&1 &
	pid=$!
	sleep 10
	new=$(webkit | comm -13 /dev/fd/3 - 3<<EOF2
$before
EOF2
)
	total=0
	for p in $pid $new; do
		kb=$(footprint -p "$p" 2>/dev/null | awk '/phys_footprint:/ {v=$2; u=$3} END {if (u ~ /^G/) v*=1048576; else if (u ~ /^M/) v*=1024; print int(v)}')
		name=$(ps -o comm= -p "$p" | sed 's|.*/||')
		echo "$p $name $((kb / 1024)) MB"
		total=$((total + kb))
	done
	;;
Linux)
	"$bin" "$@" >/dev/null 2>&1 &
	pid=$!
	sleep 10
	tree() { echo "$1"; for c in $(pgrep -P "$1"); do tree "$c"; done; }
	total=0
	for p in $(tree $pid); do
		kb=$(awk '/^Pss:/ {print $2}' "/proc/$p/smaps_rollup")
		echo "$p $(cat /proc/$p/comm) $((kb / 1024)) MB"
		total=$((total + kb))
	done
	;;
esac
kill "$pid"
echo "total $((total / 1024)) MB"
