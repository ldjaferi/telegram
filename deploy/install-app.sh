#!/bin/bash
# Run from an unpacked, verified release as root. Does not alter either firewall.
set -euo pipefail
test "$(id -u)" = 0
test -f src/main.js
test -f /etc/systemd/system/gamebot.service.d/hardening.conf
export PATH="/opt/node24/bin:$PATH"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node --test test/*.test.js
install -d -m 755 /opt/gamebot
if [ -e /opt/gamebot/src/main.js ]; then
  snapshot="/root/gamebot-release-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$snapshot" -C /opt/gamebot .
fi
systemctl stop gamebot.service 2>/dev/null || true
cp -a src public scripts deploy test package.json package-lock.json node_modules /opt/gamebot/
chown -R root:root /opt/gamebot
chmod -R go-w /opt/gamebot
install -d -m 700 /etc/gamebot
if [ ! -f /etc/gamebot/config ]; then install -m 600 deploy/config.example /etc/gamebot/config; fi
if [ ! -f /etc/gamebot/bot-token ]; then install -m 600 /dev/null /etc/gamebot/bot-token; fi
install -m 644 deploy/gamebot.service /etc/systemd/system/gamebot.service
install -m 644 deploy/gamebot-backup.service /etc/systemd/system/gamebot-backup.service
install -m 644 deploy/gamebot-backup.timer /etc/systemd/system/gamebot-backup.timer
caddy validate --config deploy/Caddyfile --adapter caddyfile
if [ -f /etc/caddy/Caddyfile ]; then cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-snake-$(date +%Y%m%d-%H%M%S)"; fi
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now gamebot.service gamebot-backup.timer caddy.service
systemctl reload caddy.service
curl --fail --silent --retry 10 --retry-delay 1 --retry-connrefused http://127.0.0.1:3100/healthz
systemctl start gamebot-backup.service
systemctl is-active gamebot.service caddy.service
