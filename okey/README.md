# Gjurzi — aber frech.

Eigenständige Telegram Mini App für Okey mit festen Jokern. Gehört neben das bestehende Snake-Spiel; verwendet einen eigenen Prozess auf Port 3200. Keine Änderungen am Snake-Dienst notwendig.

**Live seit 28.10.2026:** [@GoyimGjurzi_bot](https://t.me/GoyimGjurzi_bot) · [Weboberfläche](https://gjurzi.xhaferi.al/). Im privaten Bot-Chat `/start` oder `/nisja` senden und „Gjurzi spielen“ antippen. Im Browser ist auch eine Anmeldung mit frei gewähltem Namen möglich, wenn öffentliche Partien freigegeben sind. `/play` bleibt als zusätzlicher Befehl kompatibel; im Befehlsmenü steht `/nisja`.

## Enthalten

- Holzbretter und elfenbeinfarbene Steine, grüner Filztisch mit dezentem palästinensischem Kufiya-Muster (7,5 % Deckkraft), leichte räumliche Tiefe durch CSS. Kein WebGL und keine schwere 3D-Engine. Grafik und Ton werden lokal ausgeliefert; Herkunft steht in `public/ASSET-SOURCES.txt`.
- Der Rundensieg nennt den Gewinner und im Teammodus das siegreiche Team. Einer von 20 frechen Sprüchen bleibt pro Runde für alle gleich, auch nach Wiederverbindung. Der Gesamtsieg zeigt zusätzlich die Namen der Gewinner; Gleichstand bleibt ausdrücklich als solcher markiert.
- Neu zusammentreffende Steine auf dem eigenen Brett lösen ein kurzes weiblich gesprochenes „Klack“ aus. Intakte Gruppen bewegen, Auswählen, Sortieren und Formatwechsel bleiben dabei still. Der Ton-Schalter und ein verborgenes Fenster stoppen den Clip; keine überlappenden Stimmen und kein nachträgliches Abspielen.
- Die zwei Steine mit Comic-Brustmotiv sind dauerhaft Joker. Kein Anzeiger, keine Ersatzsteine; alle 104 Zahlensteine behalten ihren Wert. 106 Steine insgesamt, nach dem Austeilen 49 im Vorrat.
- Letzter Abwurf je Spieler sichtbar; aufgenommene Abwürfe bleiben als historische Anzeige mit ↗ markiert. Die Mitte zeigt den eigenen Abwurf und separat den aktuell aufnehmbaren Stein.
- Partien über 5 oder 7 Runden; vor dem Start vom Gastgeber auswählbar. Team A: Plätze 1 und 3, Team B: Plätze 2 und 4. Einzelmodus bleibt verfügbar.
- „Punkte“ öffnet die Rundenliste und Gesamtsummen. Weniger Punkte gewinnt; Gleichstand bedeutet geteilter Sieg. Die Wertung sucht die global beste Kombinationseinteilung und summiert die übrigen Zahlenwerte, unabhängig von der Brettanordnung. Einzelne Paare zählen nur bei einer vollständigen Sieben-Paare-Hand.
- Gewinnerteam 0 Punkte; ein Joker als letzter Abwurf bei gültiger Resthand ergibt −10 für die Gewinner und doppelte Gegnerpunkte. Dazu wackelt und dreht sich der Tisch; bei reduzierter Bewegung erscheint nur die Ansage. Nicht verwendbare Joker kosten als Hausregel 0 Punkte. Bei leerem Vorrat zählt jede Seite ihre Restpunkte. Sind alle Spieler einer Seite ausgeschieden, gewinnt die verbleibende Seite.
- Neue Steine aus Vorrat oder Abwurf werden für vier Sekunden golden markiert und mit „NEU“ beschriftet. „Farbe“ sortiert aufsteigend pro Farbe, „Kombis“ gruppiert die beste Kombinationseinteilung. „Mshile“ schliesst die Runde, „Fuge gjurin“ wirft ab.
- Solo gegen drei Computer, private Tische für bis zu vier Menschen, Computer auf freien Plätzen beim Start. Der Gastgeber startet die Runde und die Revanche.
- Server entscheidet über Ziehen, Abwerfen und Gewinn; jeder Client erhält nur seine eigene Hand. Vollständige Partition in Reihen/Gruppen sowie sieben identische Paare, 12–13–1 erlaubt, 13–1–2 verboten.
- Steine auf zwei Leisten frei ordnen: direkt mit Finger/Maus ziehen, per Antippen platzieren oder mit Pfeiltasten verschieben. Keine Überdeckung; andere Steine machen Platz. Passende Reihen, Farbgruppen und Paare rasten magnetisch zusammen und werden grün markiert. Ganze Kombinationen gemeinsam ziehen; einzelne Steine erst antippen, dann herausziehen. Lücken, Gruppen und Positionen bleiben pro Tisch/Runde erhalten, auch beim Formatwechsel. Sortieren ordnet das Brett neu.
- Die Gewinnhand zeigt die tatsächlich passenden Reihen, Gruppen oder sieben Paare getrennt; echte Joker sind mit ihrem ersetzten Wert beschriftet.
- Bildschirmfüllende Spielansicht: Auf schmalen oder niedrigen Querformat-Bildschirmen stehen Tisch und Brett nebeneinander, im Hochformat untereinander. Das Brett umfasst zwei Steinreihen mit kleinem Abstand; Tischsteine sind unabhängig davon grösser. Spieler sitzen ausserhalb des Filzes, ihre Abwürfe darauf. Die Symbolleiste für Gesten, Bluff, Shisha und Brettwerfen liegt zwischen Tisch und Brett. Mehr enthält zusätzliche Hinweise und Tisch verlassen. Startseite, Warteraum und Rundenergebnis haben eigene Bereiche ohne überlagerte Spieler.
- Stinkefinger, Buj Modus, Furz und Çay als animierte Tischreaktionen. Buj Modus zeigt 🌚 und „Ihr sind alles Opfer und chömed i dhölll“. Gegner-Avatar auswählen für gezielte Gesten. 2,5 Sekunden Abklingzeit.
- **Joker-Bluff:** Eigene Schaltfläche direkt auf dem Tisch. Nur mit einem aktuell gehaltenen Joker und während einer laufenden Runde; auch ausserhalb des eigenen Zugs. Alle sehen eine leicht behaarte, wackelnde Comic-Männerbrust mit „Ich hab einen Joker!“. Der Server prüft den Besitz eines festen Jokers. Keine Offenlegung der übrigen Hand und kein Verbrauch des Jokers. Acht Sekunden Pause zwischen Bluffs, reduzierte Bewegung wird berücksichtigt.
- **Teamfragen:** In laufenden Teamrunden öffnet ein Klick auf den gegenüberliegenden menschlichen Teampartner „Was möchtest du … mitteilen?“. „A ta msheli“ bietet „Ja“, „Nein“, „Nein, se me Joker shkoj“; „Si je?“ bietet „Katastrof“, „Fort jam“, „Si tmundish mshile vlla“. Frage und Antwort sind ausschliesslich für diese zwei Spieler sichtbar, auch nach Wiederverbindung. Eine offene Frage pro Team, drei Sekunden Sendepause, 60 Sekunden Gültigkeit. Rundenende, Aufgeben und Verlassen beenden offene Fragen. Keine Nachrichten an Computer oder ausgeschiedene Spieler.
- Ein ungültiges „Mshile“ zeigt gross „A budall ie a“; Hand und Spielzug bleiben erhalten.
- **Shishas:** Zwei gezeichnete Shishas auf dem Tisch. Alle 18–30 Sekunden nimmt ein zufälliger aktiver Spieler einen kleinen Zug (erster Zug nach 14–24 Sekunden); Pose und kleine Rauchwolken sind für alle sichtbar. „Fester Zug“ vernebelt die gesamte Spielansicht für drei Sekunden, danach löst sich der Rauch auf. Ein grosser Zug alle 15 Sekunden pro Tisch, damit niemand dauerhaft die Sicht blockiert. Rein optischer Effekt: Steine, Zugreihenfolge und Zugzeit bleiben unverändert. Bei reduzierter Bewegung nur ein ruhiger, leichter Schleier; kurzes Wasserblubbern bei kleinen Zügen und kräftigeres, knapp zwei Sekunden langes Blubbern beim festen Zug. Der Ton-Schalter stoppt das Blubbern sofort. Veraltete Ereignisse und verborgene Fenster spielen keinen nachträglichen Zug-Sound ab.
- Brettwerfen bedeutet Aufgabe dieser Runde, mit sichtbarem Ereignis für alle. Aufgebende bleiben als Zuschauer und dürfen weiter gestikulieren. Die übrigen Spieler spielen weiter; letzter verbliebener Spieler gewinnt.
- Eigene leise Hijaz-inspirierte Hintergrundmusik aus Zupftönen und sanften Trommelimpulsen, ohne Audiodownload. Beginnt nach der ersten Berührung während des Spiels, pausiert bei verborgenem Fenster oder Rundenende. ♫ schaltet Musik und Effekte gemeinsam aus; die Einstellung bleibt gespeichert. Reduzierte Animationen bei entsprechender Systemeinstellung.
- 120 Sekunden pro Zug (Ziehen und Abwerfen zusammen), danach automatische Aktion. Wiederverbindung über dieselbe Sitzung; Telegram-Identitäten finden ihren Tisch auch nach neuer Anmeldung wieder.

## Gemeinsam aus dem Gruppenchat starten

1. Den Bot zur Telegram-Gruppe hinzufügen und dort `/nisja` senden (bei mehreren Bots `/nisja@GoyimGjurzi_bot`).
2. Der Bot erstellt sofort eine Lobby und reserviert den Gastgeberplatz für den Absender. Seine Gruppenantwort enthält **Hajde bojrum**.
3. Alle Teilnehmer öffnen diesen Knopf. Der Link öffnet die Main Mini App und übergibt den Tisch automatisch; niemand muss einen Code eingeben. Der Gastgeber sieht die beitretenden Kollegen.
4. Der Gastgeber wählt über **5 oder 7 Runden wählen** Spielweise und Rundenzahl und drückt **Runde starten**, sobald alle bereit sind. Maximal vier Menschen; freie Plätze werden erst beim Rundenstart mit Computern gefüllt.

Weitere `/nisja` derselben Gruppe verweisen auf denselben Tisch. Während einer laufenden Runde kehren vorhandene Teilnehmer an ihren Platz zurück. Neue Spieler wählen einen Computerplatz und übernehmen dessen Hand, Team, bisherigen Punktestand und aktuelle Zugphase. Die Platzwahl zeigt die Computer und ihre gegenüberliegenden Partner, aber keine verdeckten Steine. Bereits von Menschen besetzte oder in dieser Runde aufgegebene Plätze sind gesperrt; bei gleichzeitiger Auswahl bekommt nur der erste Spieler den Platz. Ist der übernommene Computer gerade am Zug, beginnt für den neuen Spieler ein volles Zugzeitfenster. Wer bereits an einem anderen Tisch sitzt, muss diesen zuerst verlassen. Ein Tisch wird nicht automatisch zwischen Gruppen geteilt. Nach dem Verlassen aller Menschen oder nach zehn Minuten ohne erfolgreiche menschliche Spielaktion kann `/nisja` einen neuen Tisch erstellen. Wie bisher gehen Tische bei einem Serverneustart verloren.

Vor dem Live-Einsatz: Main Mini App in BotFather aktivieren und den geänderten Okey-Dienst bereitstellen. Danach mit zwei echten Telegram-Konten in einer Gruppe prüfen: Gruppenknopf → gemeinsamer Tisch → Gastgeber startet. Die lokale Integration prüft Bot-Antwort, signierte Telegram-Anmeldung, WebSockets und den gemeinsamen Tisch; sie ersetzt diese Telegram-Geräteprüfung nicht.

## Lokal spielen

Node.js 24 und pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

Alternativ `npm install`, `npm test`, `npm start`. Es gibt keinen Build-Schritt. Öffne `http://127.0.0.1:3200/`. Lokale Anmeldung ist nur bei Loopback-Bindung ausserhalb von Production möglich. Für mehrere Testspieler getrennte Tabs öffnen; mit `/?name=Ali` bzw. `/?name=Leyla` einen lokalen Namen festlegen. Über „Mit Freunden“ einen Tisch erstellen und den sechsstelligen Tischcode teilen.

## Eigenen Server und Telegram verbinden

1. Das vollständige Verzeichnis `okey/` nach `/opt/okey` kopieren und dort `pnpm install --prod --frozen-lockfile` ausführen. Node 24 vorausgesetzt.
2. Eine HTTPS-Adresse über den bestehenden Reverse Proxy auf `127.0.0.1:3200` zeigen lassen. `PUBLIC_URL` darf einen Unterpfad enthalten. Aktuell läuft Gjurzi direkt unter `https://gjurzi.xhaferi.al/`; der Proxy leitet die Anfragen unverändert an Port 3200 weiter. Die alten Pfade `/okey` und `/gjurzi` auf `goyim.xhaferi.al` leiten mit erhaltenem Tischcode auf die neue Subdomain um. Caddy übernimmt WebSocket-Upgrades automatisch.
3. `.env.example` als `/etc/okey/config` speichern. `PUBLIC_URL`, `BOT_USERNAME` (ohne @) und `ALLOWED_TELEGRAM_IDS` setzen. Standardmässig sind nur eingetragene Telegram-IDs zugelassen. `ALLOW_PUBLIC_PLAY=true` erlaubt bewusst alle Telegram-Konten.
4. Den neuen Bot-Token ausschliesslich auf dem Server in `/etc/okey/bot-token` speichern (root, 0600). `deploy/okey.service` verwendet systemd `LoadCredential`. Der Token wird für die Prüfung der Telegram-Anmeldung gebraucht, nicht an Browser ausgegeben.
5. In **@BotFather → /mybots → @GoyimGjurzi_bot → Bot Settings → Configure Mini App** die **Main Mini App** aktivieren und `https://gjurzi.xhaferi.al/` als URL setzen. Dies ist für den direkten Gruppenstart erforderlich und wird nicht durch `setChatMenuButton` eingerichtet. Der Dienst setzt Menüknopf, Beschreibung und `/nisja`, `/help`, `/id` automatisch. Einladungen verwenden `https://t.me/BOT_USERNAME?startapp=room_ABCDEF`. Telegram kann beim ersten Öffnen eine Bestätigung anzeigen; der Umweg über den privaten Bot-Chat entfällt. Alte `?start=room_ABCDEF`-Einladungen bleiben kompatibel.
6. Den Dienst nach Prüfung der Pfade installieren und starten. `/healthz` liefert den Status. Danach mit echten Telegram-Konten auf iOS und Android testen.

Die vollständige VPS-Konfiguration steht in [deploy/Caddyfile](deploy/Caddyfile). `gjurzi.xhaferi.al` geht an Port 3200, das bestehende Snake-Spiel auf `goyim.xhaferi.al` weiterhin an Port 3100. Die Subdomain benötigt einen DNS-Eintrag auf denselben Server. Caddy beschafft und erneuert das HTTPS-Zertifikat. Alte Spiel-Links behalten bei der Weiterleitung ihren Tischcode. Die Main-Mini-App-URL muss separat in BotFather auf `https://gjurzi.xhaferi.al/` gesetzt werden; das Bot-Menü und neue Browser-Einladungen verwenden `PUBLIC_URL`.

Der systemd-Dienst verwendet den separaten Systembenutzer `okey` und die vorhandene Node-Runtime `/opt/node24/bin/node`. Code liegt root-eigen unter `/opt/okey`, der Polling-Stand unter `/var/lib/okey/bot-offset`. Token und Konfiguration liegen root-eigen mit 0600 in `/etc/okey` (0700). Die bestehende Egress-Firewall gilt auch für Okey. Port 3200 bleibt ausschliesslich an Loopback gebunden.

`deploy/install-app.sh` ist auf diesen VPS zugeschnitten: Installation, Tests, Konfiguration, Caddy-Routing und systemd. Vor Änderungen erstellt es Rückfallkopien; ein erneuter Lauf startet Okey neu und beendet damit laufende Okey-Runden. Die Datei enthält keine Zugangsdaten. Bestehende Snake-Konfiguration bleibt erhalten.

## Stand und Grenzen

Dies ist eine spielbare erste Version. Partien umfassen 5 oder 7 Runden, wahlweise 2 gegen 2 (gegenüberliegende Plätze) oder jeder gegen jeden; ein Anzeiger ist in dieser Variante nicht vorgesehen. Die Regeln zum Brettwerfen, Zuglimit und letzten verbliebenen Spieler sind bewusste Hausregeln.

Computer verwenden eine einfache Kombinationen-Heuristik ohne Einsicht in andere Hände. Sie prüfen Gewinnhände exakt, spielen aber nicht auf Expertenniveau. Die Gesten verwenden System-Emoji plus Animationen; das Joker-Motiv ist ein eigenes SVG.

Tische, Sitzungen und die komplette Punktehistorie leben im Prozessspeicher. Ein Neustart beendet laufende Partien. Inaktive Tische verfallen nach zehn Minuten; Computeraktionen verlängern diese Frist nicht. Ein Produktionsprozess unterstützt bis zu 100 Tische; noch kein Lasttest für diese Grenze und keine Synchronisierung zwischen mehreren Prozessen.

60 Regel-, Server- und Interaktionstests sowie elf Chromium-Browserprüfungen bestehen lokal. Letztere prüfen Startseite, Warteraum, Spiel, Ergebnis, lange Namen, Touch-Verschieben und Formatwechsel sowie Einladungen, Computerplatzwahl, konkurrierende Übernahmen und Wiederverbindung. Sie kontrollieren Überdeckungen, sichtbare Schaltflächen und die Bretthöhe. Öffentliches HTTPS, Bot-Menü, Produktionsanmeldung mit signierten Testdaten und WebSocket-Upgrade wurden ebenfalls geprüft. Die Browserprüfung ersetzt keinen Test in Telegram auf echten iOS-/Android-Geräten oder der Audio-Wiedergabe dort.

## Tests und Dateien

`pnpm test` prüft Regeln, Joker, sieben Paare, unzulässige Gewinne, verdeckte Hände, Aufgeben, Turn-Reihenfolge, automatische Partien, zwei echte WebSocket-Clients, gezielte Gesten, Wiederverbindung und Anmeldeschranken. `pnpm check` prüft die JavaScript-Syntax.

Die visuelle Layoutprüfung läuft separat mit Playwright und einem lokalen Testserver:

```sh
pnpm exec playwright install chromium
pnpm test:layout
```

Alternativ einen vorhandenen Browser über `CHROMIUM_PATH=/usr/bin/chromium pnpm test:layout` verwenden. `LAYOUT_SCREENSHOT_DIR=/tmp/gjurzi-layout` speichert die Ansichten als PNG. Die neun Fenstergrössen reichen von 320×640 bis 1440×900, einschliesslich Tablet und Querformat. Playwright ist nur eine Entwicklungsabhängigkeit; Produktionsinstallationen benötigen keinen Browser.

- `src/game.js`: Regel-Engine, Computer, Tische, persönliche Snapshots.
- `src/server.js`: HTTP, Telegram-Login, einmalige Socket-Tickets, WebSocket-Nachrichten.
- `src/auth.js`: Übernommene Telegram-HMAC-Prüfung und Sitzungen aus dem bestehenden Projekt.
- `src/bot.js`: Bot-Kommandos, Einladungen, Menü und Long Polling mit gespeichertem Update-Stand.
- `public/`: HTML, CSS, JavaScript und SVG, keine externen UI-Abhängigkeiten.
- `deploy/okey.service`: Separate systemd-Vorlage.

Grundlage mit ausdrücklich angepasster fester Joker-Regel: [Pagat – klassisches Okey](https://www.pagat.com/rummy/okey.html). Telegram: [Mini Apps](https://core.telegram.org/bots/webapps).

Die Rundenzahl wird vor einer neuen Partie über zwei grosse Auswahlfelder bestätigt. Es gibt keine automatische Vorauswahl; auch der Server verhindert einen Start ohne bestätigte Auswahl. Zwischen den Runden bleibt diese Wahl bestehen. Die wichtigen Texte und Bedienelemente sind für bessere Lesbarkeit auf Mobilgeräten vergrössert.
