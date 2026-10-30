#!/bin/bash
set -euo pipefail
export PATH="/opt/node24/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd "$(dirname "$0")/.."
test "$(id -u)" -eq 0
test -x /opt/node24/bin/node
test -s /etc/okey/bot-token
test -f /etc/caddy/Caddyfile
test -f /etc/nftables.conf
backup="/root/okey-before-$(date +%Y%m%d-%H%M%S)"
mkdir -m 0700 "$backup"
cp -a /etc/caddy/Caddyfile /etc/nftables.conf "$backup/"
if test -d /opt/okey; then tar -czf "$backup/app.tar.gz" -C /opt/okey .; fi
if test -f /etc/okey/config; then cp -a /etc/okey/config "$backup/config"; fi
getent passwd okey >/dev/null || useradd --system --home-dir /var/lib/okey --shell /usr/sbin/nologin okey
install -d -o root -g root -m 0755 /opt/okey
install -d -o root -g root -m 0700 /etc/okey
install -d -o okey -g okey -m 0750 /var/lib/okey
cp -a src public deploy test package.json pnpm-lock.yaml README.md .env.example /opt/okey/
chown -R root:root /opt/okey
cd /opt/okey
corepack pnpm install --prod --frozen-lockfile --ignore-scripts
node --test test/*.test.js
python3 - <<'PY'
from pathlib import Path
def config(path):
    p=Path(path)
    return dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line and not line.startswith('#')) if p.exists() else {}
snake=config('/etc/gamebot/config')
old=config('/etc/okey/config')
ids=old.get('ALLOWED_TELEGRAM_IDS')
if ids is None:
    ids=','.join(dict.fromkeys(x.strip() for x in (snake.get('ADMIN_TELEGRAM_IDS','')+','+snake.get('ALLOWED_TELEGRAM_IDS','')).split(',') if x.strip().isdigit()))
if not ids and old.get('ALLOW_PUBLIC_PLAY')!='true':
    raise SystemExit('Keine zugelassenen Spieler konfiguriert.')
p=Path('/etc/okey/config')
p.write_text('NODE_ENV=production\nHOST=127.0.0.1\nPORT=3200\nPUBLIC_URL=https://gjurzi.xhaferi.al\nBOT_USERNAME=GoyimGjurzi_bot\nBOT_OFFSET_PATH=/var/lib/okey/bot-offset\nALLOWED_TELEGRAM_IDS='+ids+'\nALLOW_PUBLIC_PLAY='+old.get('ALLOW_PUBLIC_PLAY','false')+'\n')
p.chmod(0o600)
# Apply the existing bot egress restrictions to the separate Okey account.
p=Path('/etc/nftables.conf'); text=p.read_text()
rule='        meta skuid "okey" jump gamebot_egress'
if rule not in text:
    anchor='        meta skuid "gamebot" jump gamebot_egress'
    if text.count(anchor)!=1: raise SystemExit('Firewall-Struktur unerwartet.')
    p.write_text(text.replace(anchor,anchor+'\n'+rule))
PY
nft -c -f /etc/nftables.conf
okey_uid="$(id -u okey)"
if ! nft -n list chain inet gamebot_filter output | grep -q "skuid $okey_uid jump gamebot_egress"; then
    nft add rule inet gamebot_filter output meta skuid '"okey"' jump gamebot_egress
fi
install -m 0644 deploy/okey.service /etc/systemd/system/okey.service
systemctl daemon-reload
systemctl enable okey
systemctl restart okey
for attempt in $(seq 1 20); do
    if curl --silent --fail http://127.0.0.1:3200/healthz >/dev/null; then break; fi
    sleep 1
done
curl --silent --fail http://127.0.0.1:3200/healthz
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/caddy/Caddyfile'); text=p.read_text()
# Preserve unrelated sites and settings; migrate only the known game route.
template=Path('deploy/Caddyfile').read_text()
legacy=template[template.index('    @gjurzi_root'):template.index('    handle {')]
new_site=template[template.index('\ngjurzi.xhaferi.al {'):]
if 'gjurzi.xhaferi.al {' not in text:
    old_route='    @okey path /okey /okey/*\n    handle @okey {\n        reverse_proxy 127.0.0.1:3200\n    }\n'
    if text.count(old_route)==1:
        text=text.replace(old_route,legacy)
    else:
        anchor='    reverse_proxy 127.0.0.1:3100'
        if text.count(anchor)!=1 or '127.0.0.1:3200' in text:
            raise SystemExit('Caddy-Struktur unerwartet. Neue Subdomain anhand deploy/Caddyfile einrichten.')
        text=text.replace(anchor,legacy+'    handle {\n        reverse_proxy 127.0.0.1:3100\n    }')
    text=text.rstrip()+new_site
Path('/etc/caddy/Caddyfile.okey-staged').write_text(text)
PY
caddy validate --config /etc/caddy/Caddyfile.okey-staged --adapter caddyfile
install -m 0644 /etc/caddy/Caddyfile.okey-staged /etc/caddy/Caddyfile
systemctl reload caddy
systemctl is-active okey gamebot caddy
printf '\nRollback-Dateien: %s\n' "$backup"
