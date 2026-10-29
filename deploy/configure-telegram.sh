#!/bin/bash
# Run interactively on the VPS: sudo bash /opt/gamebot/deploy/configure-telegram.sh
set -euo pipefail
test "$(id -u)" = 0
umask 077
printf 'Bot-Token von BotFather eingeben (unsichtbar; leer = behalten): '
IFS= read -r -s bot_secret
printf '\n'
if [ -n "$bot_secret" ]; then
  if [[ ! "$bot_secret" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    echo 'Ungueltiges Token-Format.' >&2
    exit 1
  fi
  printf '%s' "$bot_secret" > /etc/gamebot/bot-token
fi
unset bot_secret
printf 'Admin-Telegram-ID (Ziffern; leer = spaeter ueber /id ermitteln): '
IFS= read -r admin_id
if [ -n "$admin_id" ]; then
  [[ "$admin_id" =~ ^[0-9]+$ ]] || exit 1
  sed -i "s/^ADMIN_TELEGRAM_IDS=.*/ADMIN_TELEGRAM_IDS=$admin_id/" /etc/gamebot/config
fi
systemctl restart gamebot.service
echo 'Gespeichert. Im Bot /id senden, um deine ID zu erhalten.'
echo 'Im privaten Bot-Chat /play oder den Menueknopf Snake spielen verwenden.'
echo 'Optional in BotFather die Main Mini App auf https://goyim.xhaferi.al setzen.'
echo 'Freunde gezielt in ALLOWED_TELEGRAM_IDS in /etc/gamebot/config freischalten.'
