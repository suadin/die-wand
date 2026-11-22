# DIE WAND

Die Lesezeichenleiste aus Chrome als Startseite: jedes Lesezeichen eine Kachel,
ein Klick öffnet sie in einem neuen Tab. Reines HTML, Bootstrap und zwei
JavaScript-Module, kein Build-Schritt.

## Aufbau

| Pfad | Zweck |
| --- | --- |
| `site/` | Die Seite selbst (HTML, CSS, JavaScript, kein Build-Schritt) |
| `backend/` | Helfer, der die Lesezeichen aus Chrome liest (Python) |
| `deploy/` | Betrieb: `compose.yaml`, `nginx.conf`, systemd-Units |
| `tests/` | Unit- und E2E-Tests, Reports und Report-Übersicht |

## Lokal starten

```sh
./start.sh
```

Danach <http://127.0.0.1:8080/> öffnen. Es braucht einen HTTP-Server, nicht
`file://`: die Seite lädt `tiles.json` und ihre Module.

## Lesezeichen holen

Die Seite selbst kann Chrome nicht lesen. Das erledigt der kleine Helfer in
`backend/`, den systemd auf Zuruf startet (`deploy/systemd/`): Er liest das
Chrome-Profil und antwortet der Seite unter `127.0.0.1:8124/tiles.json`.
Alternativ liest `backend/chrome.py` die Lesezeichen, schreibt sie nach
`~/die-wand-tiles.json` und schiebt sie aufs NAS (Ziel über `DIE_WAND_NAS`).

## Hosten

- **GitHub Pages:** Jeder Push auf `main` lässt die Workflows die Tests laufen
  und `site/` veröffentlichen. Die Reports liegen danach unter `site/test/`.
- **Eigener Server/NAS:** `deploy/compose.yaml` startet nginx, der `site/`
  schreibgeschützt ausliefert. Zertifikate nach `deploy/ssl/` legen, dann in
  `deploy/` `docker compose up -d`.

## Tests

```sh
pnpm install
pnpm unit    # Vitest, Report: tests/report/unit/index.html
pnpm e2e     # Playwright, Report mit Videos: tests/report/e2e/index.html
pnpm check   # beides
pnpm pages   # Tests plus Reports nach site/test/ (für die Veröffentlichung)
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
