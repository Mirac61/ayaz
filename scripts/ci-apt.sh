#!/bin/sh
# apt on a GitHub runner waits 20 s per index when Azure's Ubuntu mirror is down and the job hangs for minutes.
# Try that mirror for a minute, then fall back to the main archive. Packages are optional: no arguments only prepares apt.
set -e
APT="-o Acquire::Retries=3 -o Acquire::http::Timeout=15"
if ! timeout 60 sudo apt-get $APT update; then
  sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' /etc/apt/sources.list /etc/apt/sources.list.d/* /etc/apt/apt-mirrors.txt 2>/dev/null || true
  sudo apt-get $APT update
fi
if [ "$#" -gt 0 ]; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get $APT install -y "$@"
fi
