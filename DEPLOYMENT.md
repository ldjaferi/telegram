# Deployment – goyim.xhaferi.al

## Bekannte Umgebung

VPS: `91.214.190.222`, IPv6 `2001:1600:13:101::c29`, Debian 13, 1 vCPU, ca. 2 GB RAM. Beide DNS-Einträge wurden am 28.10.2026 geprüft. SSH bleibt auf Port 1986 und Quelle 31.10.147.51 beschränkt. Keine Container.

## Erstinstallation

1. `deploy/install-runtime.sh` auf dem VPS als root ausführen. Es installiert Node 24 aus der offiziellen Distribution nach SHA-256-Prüfung und Caddy aus Debian-Paketen.
2. Nur folgende Projektpfade in ein Release aufnehmen: `src`, `public`, `scripts`, `test`, `deploy`, `package.json`, `package-lock.json`. **Niemals das komplette Arbeitsverzeichnis packen: Darin liegt ein privater SSH-Schlüssel.**
3. Release in einem neuen Verzeichnis unter `/var/tmp` entpacken und dort `sudo bash deploy/install-app.sh` ausführen. Das Skript installiert die gelockten Abhängigkeiten ohne Installationsskripte, führt Tests aus und richtet Dienste und lokale Backups ein. Der vorhandene Härtungs-Drop-in bleibt bestehen.
4. TCP 80 und 443 in nftables und der Infomaniak-Firewall freigeben. SSH-Regel unverändert lassen. Wegen des AAAA-Eintrags muss HTTPS auch über IPv6 funktionieren. Keine Freigabe von Port 3100 oder Caddy-Admin-Port 2019.
5. Caddy stellt das öffentliche TLS-Zertifikat aus. HTTPS, HTTP-Weiterleitung und beide IP-Familien extern prüfen.
6. Telegram wie in README einrichten. Ohne Token/zulässige IDs ist die öffentliche Oberfläche erreichbar, aber Spiel- und Admin-APIs bleiben gesperrt.

## Prüfung

```sh
systemctl is-active gamebot caddy
curl --fail http://127.0.0.1:3100/healthz
curl --fail https://goyim.xhaferi.al/healthz
systemctl list-timers gamebot-backup.timer
journalctl -u gamebot --since '10 minutes ago'
```

`/api/config` muss `dev:false` liefern; `/api/dev-login` darf in Produktion nicht verfügbar sein. `setupRequired:true` bedeutet, dass Telegram-Token oder Admin-ID noch fehlen.

## Backup und Wiederherstellung

`systemctl start gamebot-backup` erstellt eine konsistente, geprüfte SQLite-Kopie unter `/var/lib/gamebot/backups`. Der Timer läuft täglich um ca. 03:15 Schweizer Zeit. 14 Kopien werden aufbewahrt. Eine externe, verschlüsselte Kopie benötigt noch ein vereinbartes Ziel.

Vor einer Wiederherstellung `gamebot` stoppen, bestehende Datenbank samt etwaiger `-wal`/`-shm`-Dateien in ein neues Rückfallverzeichnis verschieben, Backup an den Datenbankpfad kopieren und Eigentümer `gamebot:gamebot`, Modus `0600` setzen. Erst danach den Dienst wieder starten. Nie eine laufende WAL-Datenbank nur durch Kopieren der Hauptdatei sichern oder ersetzen.

## Updates und Grenzen

- Vor Updates lokale Sicherung und externe Kopie erstellen.
- `systemctl stop gamebot` lässt aktive Runden auslaufen (max. 130 Sekunden). Neue Räume/Starts werden in dieser Zeit abgewiesen.
- `install-app.sh` behält eine Kopie der vorherigen Anwendung unter `/root/gamebot-release-*.tar.gz`.
- Code und Node-Runtime bleiben root-eigen. Der Dienst darf nur `/var/lib/gamebot` beschreiben.
- Node-Sicherheitsupdates separat einspielen. Bestehende Installationen ersetzt `install-runtime.sh` absichtlich nicht automatisch.
- Standardmässig maximal 40 Räume / 8 Spieler; diese Obergrenze ist **keine gemessene Kapazitätszusage**. Vor grösserer Nutzung mit dem vorhandenen 80%-CPU-Limit Lasttests durchführen.
- Sitzungen und Spielräume überleben einen Prozessabbruch nicht. Gespeicherte Ergebnisse und Admin-Futtereinstellung bleiben erhalten.
- Noch kein automatischer externer Alarm bei Ausfällen; systemd startet den Dienst bei Fehlern neu.
