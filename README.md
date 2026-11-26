# die-wand

Die Lesezeichenleiste aus Chrome als Startseite: jedes Lesezeichen eine Kachel,
ein Klick öffnet sie in einem neuen Tab. Reines HTML, Bootstrap und JavaScript,
kein Build-Schritt.

## Start

```sh
./start.sh
```

Danach <http://127.0.0.1:8080/> öffnen. Ein HTTP-Server ist nötig, weil die Seite
`tiles.json` und ihre Module lädt.

## Aufbau

| Pfad | Zweck |
| --- | --- |
| `site/` | Oberfläche |
| `backend/` | Liest die Chrome-Lesezeichen |
| `extension/` | Chrome-Erweiterung für die Live-Verwaltung |
| `deploy/` | nginx, Container und systemd |
| `tests/` | Unit- und E2E-Tests mit Reports |

Die Entwicklungsphasen und Commit-Bereiche stehen in [MILESTONES.md](MILESTONES.md).

## Lesezeichen

Der Browser kann das Chrome-Profil nicht lesen. `backend/` übernimmt das und
liefert `tiles.json`; alternativ schreibt `backend/chrome.py` die Datei lokal und
schiebt sie aufs NAS.

Mit installierter Erweiterung ist die Wand live: Sie zeigt alle Lesezeichen
flach als Kacheln. Lesezeichen und Ordner können angelegt, Lesezeichen in Ordner
verschoben und Ordner inklusive Inhalt gelöscht werden. `backend/` bleibt
read-only und liefert vor allem die gespeicherten Favicons.

### Erweiterung installieren

1. Chrome öffnen und `chrome://extensions` aufrufen
2. **Entwicklermodus** einschalten
3. **Entpackt laden** und den Ordner `extension/` dieses Projekts wählen
4. Wand neu laden; über den Kacheln erscheinen beim Hover ✎ zum Bearbeiten, ↪
   zum Verschieben und × zum Löschen. Unten links/rechts verschieben Pfeile den
   Eintrag innerhalb seines Ordners; am ersten bzw. letzten Eintrag fehlt der
   entsprechende Pfeil. Mit den Pfeiltasten ←/→ funktioniert es auch per
   Tastatur. Die Kopfzeile erhält „+ Lesezeichen“, „+ Ordner“ und
   „Ordner löschen“.

Die Erweiterung hat nur die Rechte `bookmarks`, `favicon` und `tabs`. `tabs` wird
ausschließlich zum Öffnen von `chrome://`-Kacheln benötigt. Sie akzeptiert Befehle nur von
`http://127.0.0.1:8080`, `http://localhost:8080` und
`https://192.168.178.50:8443`. Ihre ID ist im Manifest festgelegt und ändert sich
beim erneuten Laden nicht.

## Betrieb

- **GitHub Pages:** Push auf `main` veröffentlicht `site/` inklusive Tests unter
  `site/test/`.
- **NAS:** `deploy/.env` aus `deploy/.env.example` anlegen, dann
  `deploy/deploy.sh` ausführen. Das Zertifikat stellt `~/Projects/tls/issue.sh` mit dem
  Namen `die-wand` aus.

## Tests

```sh
pnpm install
pnpm unit    # tests/report/unit/index.html
pnpm e2e     # tests/report/e2e/index.html, mit Videos
pnpm check   # beides
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
