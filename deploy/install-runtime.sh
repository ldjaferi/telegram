#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
if [ ! -x /opt/node24/bin/node ]; then
  work=$(mktemp -d /var/tmp/gamebot-node.XXXXXX)
  cd "$work"
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
  archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' SHASUMS256.txt)
  test -n "$archive"
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$archive"
  awk -v a="$archive" '$2 == a' SHASUMS256.txt | sha256sum -c -
  install -d -m 755 /opt/node24
  tar -xJf "$archive" -C /opt/node24 --strip-components=1 --no-same-owner
  # Keep the downloaded checksum and archive for provenance; do not touch existing runtime installs.
fi
/opt/node24/bin/node --version
apt-get install -y --no-install-recommends caddy
