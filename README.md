# Snake Club

Telegram Mini App für gemeinsames Snake auf **goyim.xhaferi.al**. Direkter Node.js-/systemd-Betrieb auf dem vorhandenen Debian-VPS, ohne Container.

## Funktionsumfang

- Private Räume für 2–8 Spieler, Einladung per Telegram-Bot-Link oder Raumcode.
- Direktstart mit „Jetzt alleine spielen“, Countdown, zwei Minuten pro Runde, Revanche, Tastatur, Wischen und Richtungstasten. Auch ein allein belegter Multiplayer-Raum kann sofort als Training starten; sobald vor der nächsten Runde weitere Spieler beigetreten sind, wird sie als Multiplayer gewertet.
- Server entscheidet über Bewegung, Wachstum, Kollisionen und Punkte. Keine vom Client übermittelten Scores.
- 30×30-Raster, acht Spielschritte pro Sekunde. Darstellung im Bildschirmtakt mit Snapshot-Puffer (1,2 Spielschritte) gegen Netzwerk-Jitter, vorberechnetem Raster/Futter und bedarfsgerechten UI-Updates.
- Admin bestimmt das Futter für alle: Cartoon-Pobacken (Standard), Kirschen oder Sterne. Gilt ab der nächsten Runde.
- Telegram-HMAC-Prüfung, begrenztes Anmeldealter, serverseitige Admin-Liste, private Spielerzulassung.
- SQLite-Ergebnisse und Rangliste für Multiplayer (180 Tage). Training zählt nicht.
- Verbindung kann wieder aufgenommen werden. Nach 10 Sekunden erkannter Trennung scheidet die Schlange aus.
- Ein Socket pro Identität. Räume sind flüchtig; ein unerwarteter Prozessabbruch beendet laufende Runden.
- SIGTERM nimmt keine neuen Runden an und wartet bis zu 130 Sekunden auf aktive Partien.

## Lokal starten

Node.js 24 LTS und npm oder pnpm:

```sh
npm ci
npm test
npm start
```

`http://127.0.0.1:3100/` öffnen. Die lokale Anmeldung ist nur bei Loopback-Bindung und ausserhalb des Produktionsmodus verfügbar. Jedes neue Browser-Tab hat eine eigene Testidentität. Die Admin-Checkbox ist **ausschliesslich lokal** verfügbar.

Optionale Einstellungen: `.env.example` nach `.env` kopieren und `node --env-file=.env src/main.js` starten. Ohne Datei funktionieren die lokalen Standardwerte.

## Telegram einrichten

1. Im offiziellen **@BotFather** mit `/newbot` einen Bot erstellen.
2. Token nur auf dem VPS hinterlegen: `sudo bash /opt/gamebot/deploy/configure-telegram.sh`. Eingabe ist unsichtbar; kein Token in Chat oder Quellcode.
3. Dem eigenen Bot `/id` senden; die Antwort liefert die numerische Telegram-ID. Das Skript erneut ausführen, Token leer lassen und Admin-ID eintragen.
4. Im privaten Bot-Chat `/play` senden oder den Menüknopf **Snake spielen** verwenden. Einladungen gehen über `https://t.me/BOTNAME?start=room_CODE`; der Bot öffnet dann die Mini App mit dem Raumcode. Eine **Main Mini App** in BotFather ist dafür nicht erforderlich. Sie kann später optional mit `https://goyim.xhaferi.al` für einen zusätzlichen Startknopf im Profil aktiviert werden.
5. Freunde mit ihren numerischen IDs in `ALLOWED_TELEGRAM_IDS` in `/etc/gamebot/config` ergänzen, mit Komma getrennt. Dann `sudo systemctl restart gamebot` (wartet laufende Runden ab).

`ALLOW_PUBLIC_PLAY=false` ist die Vorgabe. Admin-IDs sind automatisch zugelassen. Für einen bewusst öffentlichen Spielbetrieb kann dieser Wert später auf `true` gesetzt werden. Ohne Admin-ID wird ein öffentlicher Betrieb nicht gestartet.

Der Bot bietet `/start`, `/play`, `/help` und `/id`. Er benutzt Long Polling und benötigt keinen öffentlichen Bot-Webhook. Ein vorhandener Webhook muss vor einer Umstellung bewusst entfernt werden. Der Token gelangt über systemd `LoadCredential` an den Prozess.

## Regeln und Wertung

Ein Snack zählt 10 Punkte und ein zusätzliches Körpersegment. Kehrtwenden um 180 Grad sind verboten. Pro Schritt wird höchstens eine gepufferte Richtungsänderung verarbeitet (Puffer: zwei). Die Wand, der eigene Körper und fremde Körper sind Hindernisse. Köpfe auf demselben Feld oder ein Kopf-Tausch führen zum Ausscheiden beider Spieler. Ein sich im selben Schritt leerendes Schwanzfeld darf betreten werden. Ausgeschiedene Körper verschwinden nach der Kollisionsauswertung.

Die letzte lebende Schlange gewinnt. Sind beim Zeitlimit mehrere am Leben, entscheiden die Punkte. Ausgeschiedene Spieler werden nach Punkten und danach ihrem Ausscheidezeitpunkt eingeordnet. Gleiche Werte ergeben geteilte Plätze. Geteilte erste Plätze zählen als Siege in der Rangliste.

## Betrieb

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) und die bestehende `ops/OPERATIONS.txt`. Die Dateien unter `deploy/` ergänzen die dort dokumentierte Härtung. Der bisherige Hardening-Drop-in bleibt erhalten.

- Anwendung: `/opt/gamebot` (root gehört der Code).
- Daten: `/var/lib/gamebot/snake.sqlite` (nur gamebot schreibt).
- Einstellungen: `/etc/gamebot/config`; Token: `/etc/gamebot/bot-token` (root, 0600).
- Health: `/healthz`; Logs: `journalctl -u gamebot`.
- Nächtliche lokale Sicherung mit SQLite-Online-Backup und Integritätsprüfung, 14 Versionen.
- **Externe Sicherung ist noch nicht eingerichtet.** Lokale Backups schützen nicht vor Verlust des VPS.
- Node 24 wurde aus der offiziellen Distribution installiert und muss separat aktualisiert werden; apt aktualisiert diese Installation nicht.

## Tests

`npm test` prüft Authentifizierung, Manipulation, Tickets, Admin-Zugriff, zwei echte WebSocket-Clients, Wiederverbindung, Kollisionsfälle, Spawn-Felder, Ergebnis-Speicherung und die Wiederherstellung eines Backups. Browser-/Telegram-Tests auf echten iOS- und Android-Geräten stehen vor Freigabe noch an.

## Aufbau

- `src/game.js`: unabhängige Spielsimulation und Raumverwaltung.
- `src/server.js`: HTTP, einmalige WebSocket-Tickets, Limits und Autorisierung.
- `src/auth.js`: Telegram-Prüfung und Sitzungen im Speicher.
- `src/store.js`: SQLite und Rangliste.
- `src/bot.js`: Bot-Kommandos und Telegram-Anbindung.
- `public/`: Oberfläche und Canvas-Zeichnungen, ohne Build-Schritt.

Absichtlich klein gehalten: JavaScript-ES-Module, Node-Bordmittel und nur `ws` als Laufzeitabhängigkeit. Für einen Ausbau kann der Server später schrittweise typisiert werden.
