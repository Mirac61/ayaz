#!/bin/sh
# K2: memory of Ayaz plus its WebView processes, in MB.
# Usage: scripts/ram.sh [binary [args...]]   (default bin/ayaz; starts it, waits 10 s, measures, quits it)
# K8: AYAZ_SPIKE=k8 scripts/ram.sh bin/ayaz testdata/e2e-ws measures when the app prints "k8: before" and "k8: after".
set -eu
bin=${1:-bin/ayaz}
[ $# -gt 0 ] && shift
log=$(mktemp)

case $(uname) in
Darwin)
	# WebKit runs as XPC services owned by launchd, not as our children, so take the ones that appear after launch.
	webkit() { pgrep -f 'com.apple.WebKit\.' | sort; }
	before=$(webkit)
	procs() {
		echo "$pid"
		webkit | comm -13 /dev/fd/3 - 3<<EOF2
$before
EOF2
	}
	kb() { footprint -p "$1" 2>/dev/null | awk '/phys_footprint:/ {v=$2; u=$3} END {if (u ~ /^G/) v*=1048576; else if (u ~ /^M/) v*=1024; print int(v)}'; }
	;;
Linux)
	tree() { echo "$1"; for c in $(pgrep -P "$1"); do tree "$c"; done; }
	procs() { tree "$pid"; }
	kb() { awk '/^Pss:/ {print $2}' "/proc/$1/smaps_rollup"; }
	;;
esac

measure() {
	total=0
	for p in $(procs); do
		k=$(kb "$p")
		echo "$p $(ps -o comm= -p "$p" | sed 's|.*/||') $((k / 1024)) MB"
		total=$((total + k))
	done
	echo "total $((total / 1024)) MB"
}

"$bin" "$@" >"$log" 2>&1 &
pid=$!
if [ "${AYAZ_SPIKE:-}" = k8 ]; then
	for step in before after; do
		until grep -q "k8: $step" "$log"; do
			grep "k8 error" "$log" && kill "$pid" && exit 1
			sleep 0.5
		done
		grep "k8: $step" "$log"
		measure
	done
else
	sleep 10
	measure
fi
kill "$pid"
rm -f "$log"
