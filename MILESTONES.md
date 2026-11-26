# Meilensteine

Die Meilensteine folgen der tatsächlichen Git-Historie. Jeder abgeschlossene
Meilenstein hat einen eigenen Commit-Bereich; neue Arbeiten laufen im nächsten
Meilenstein weiter.

## M1 – Startseite und Grundfunktion

**Status:** abgeschlossen  
**Commits:** `bd7468b` bis `b4151ee`

Wesentliche Commits:

- `82172ba` – erste die-wand-Startseite
- `64e778c` – Veröffentlichung über GitHub Pages
- `41c1ae9` – Wiederaufbau der Pages-Dateien
- `b4151ee` – Helfer stoppt bei Inaktivität

**Ergebnis:** Statische Kachelwand, Chrome-Lesezeichenleiste, lokaler Helfer,
Favicons, `tiles.json` und erste Dokumentation.

## M2 – Oberfläche, Tests und Standards

**Status:** abgeschlossen  
**Commits:** `c2994f2` bis `ffbc0ae`

Wesentliche Commits:

- `c2994f2` – Dokumentationsansicht und Test-Footer
- `569f8d7` – Abschnittsicons und Playwright-Suite
- `ff185e7` – Basic Specs und Conformance-CI
- `48f50b0` – Migration auf das Norm-Paket
- `ffbc0ae` – Norm-Version fixiert und CI ergänzt

**Ergebnis:** Ausgereifte Oberfläche, E2E-Tests, Test-Reports, gemeinsame
Design-Standards und erste CI-Absicherung.

## M3 – Umbau und Deployment

**Status:** abgeschlossen  
**Commits:** `3728dea` bis `782e8f3`

Wesentliche Commits:

- `3728dea` – Norm/Basic-Specs entfernt, Bootstrap 5 und Screencast-Journey
- `c03bedd` – feste Ordner `backend/`, `deploy/` und `tests/`
- `782e8f3` – Standardpfad der `opencode.json` angepasst

**Ergebnis:** Klare Projektstruktur, vereinheitlichte Skripte, Deployment-Unterlagen
und sauberer Ausgangspunkt für die Erweiterung.

## M4 – Chrome-Erweiterung und Lesezeichen-Verwaltung

**Status:** abgeschlossen  
**Commit:** `3a1b642`

Der Commit bündelt die gesamte Erweiterung und die zugehörige Qualitätssicherung:

- Manifest-V3-Erweiterung mit stabiler ID und Icon
- Live-Chrome-Baum und Favicon-API
- Lesezeichen und Ordner anlegen, bearbeiten und löschen
- Ordnerzuordnung und Sortierung per Button oder Tastatur
- Dynamische Lesezeichenleisten-ID
- `chrome://`-Kacheln
- Flache Kachelansicht und zentrierte Meldungen
- Regressionstests, HTML-Reports und E2E-Videos
- Deployment aufs NAS

**Ergebnis:** Die Wand ist eine vollständige, browserbasierte
Lesezeichenverwaltung.

## M5 – CI-Absicherung und Distribution

**Status:** aktiv  
**Commit-Bereich:** ab `3a1b642`, noch keine eigenen Commits

Geplante Arbeiten:

- Vorgeschriebene `conformance`-Prüfung auf GitHub bestehen
- Signierte CRX oder Update-Mechanismus
- Automatische Installation und Aktualisierung der Erweiterung
- Chrome-Sync, Konflikte und Wiederherstellung absichern
- Mehrprofile und größere Lesezeichenmengen testen

**Abschlusskriterien:** CI ist grün, Aktualisierung und Wiederherstellung
funktionieren ohne manuelle Profil-Eingriffe.

## Regeln

- Issues und Pull Requests referenzieren `M1`–`M5`.
- Status und Commit-Bereich werden bei einem neuen Meilenstein ergänzt.
- Ein Meilenstein wird erst nach erfüllten Abschlusskriterien geschlossen.
