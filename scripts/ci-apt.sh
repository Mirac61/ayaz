#!/bin/sh
# apt on a GitHub runner waits 20 s per index when Azure's Ubuntu mirror is down and the job hangs for minutes.
# Try that mirror for a minute, then fall back to the main archive; every step is bounded, so a runner without DNS fails in minutes. Packages are optional: no arguments only prepares apt.
set -e
SOURCES="/etc/apt/sources.list /etc/apt/sources.list.d/* /etc/apt/apt-mirrors.txt"
# Runners have lost plain HTTP to the Ubuntu mirrors for hours while HTTPS (packages.microsoft.com) kept working; both serve HTTPS.
sudo sed -i 's|http://\([a-z.]*ubuntu\.com\)|https://\1|g' $SOURCES 2>/dev/null || true
APT="-o Acquire::Retries=3 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15"
if ! timeout 60 sudo apt-get $APT update; then
  sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' $SOURCES 2>/dev/null || true
  timeout 90 sudo apt-get $APT update
fi
if [ "$#" -gt 0 ]; then
  timeout 600 sudo DEBIAN_FRONTEND=noninteractive apt-get $APT install -y "$@"
fi
