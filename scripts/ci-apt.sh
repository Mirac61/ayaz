#!/bin/sh
# apt on a GitHub runner waits 20 s per index when the regional Ubuntu mirror (Azure, now also EC2) is down, or trickles packages for minutes.
# Try that mirror first, then fall back to the main archive; every step is bounded, so a runner without DNS fails in minutes. Packages are optional: no arguments only prepares apt.
set -e
SOURCES="/etc/apt/sources.list /etc/apt/sources.list.d/* /etc/apt/apt-mirrors.txt"
# Runners have lost plain HTTP to the Ubuntu mirrors for hours while HTTPS (packages.microsoft.com) kept working; all of them serve HTTPS.
sudo sed -i 's|http://\([a-z0-9.-]*ubuntu\.com\)|https://\1|g' $SOURCES 2>/dev/null || true
APT="-o Acquire::Retries=3 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15"
main_archive() {
  sudo sed -i 's|//[a-z0-9.-]*\.archive\.ubuntu\.com|//archive.ubuntu.com|g' $SOURCES 2>/dev/null || true
  timeout 90 sudo apt-get $APT update
}
if ! timeout 60 sudo apt-get $APT update; then
  main_archive
fi
if [ "$#" -gt 0 ]; then
  # Download apart from installing, so a timeout never cuts dpkg off halfway; the retry keeps what already arrived.
  if ! timeout 240 sudo apt-get $APT install -y --download-only "$@"; then
    main_archive
    timeout 240 sudo apt-get $APT install -y --download-only "$@"
  fi
  timeout 300 sudo DEBIAN_FRONTEND=noninteractive apt-get $APT install -y "$@"
fi
