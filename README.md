# die-wand

Your Chrome bookmark bar as a start page: every bookmark becomes a tile, one click opens it in a new tab — plain HTML, Bootstrap and two JavaScript modules, no build step.

## Struktur

| Datei/Ordner | Zweck |
|---|---|
| `site/` | The whole page; the only web source, deployed to GitHub Pages |
| `site/index.html` | The page: header, tile grid, footer with the link to the test reports |
| `site/app.js` | Wiring: loads tiles (helper → tiles.json → browser copy), drag-and-drop import |
| `site/bookmarks.js` | Bookmark logic: parse, normalize, flatten, icon candidates |
| `site/wall.css` | What Bootstrap does not bring: tile size, icon size, hover |
| `site/tiles.json` | Committed placeholder tiles (real data is gitignored) |
| `site/icon.svg` | Logo and favicon |
| `import/` | `chrome.py` reads Chrome into `tiles.json`; `serve.py` answers the page live; `test_*.py` their tests |
| `systemd/` | Socket + service that start `import/serve.py` on request |
| `deploy/` | Server variant: compose file and nginx configuration |
| `test/` | Vitest unit tests for `site/bookmarks.js` |
| `e2e/` | Playwright config and journeys |
| `start.sh` | Local server at <http://127.0.0.1:8080/> |
| `publish-pages.sh` | Runs the tests and copies the reports into `site/test/` |
| `.github/workflows/` | CI (`pnpm check`) and the Pages deployment |
| `RELEASE-NOTES.md` | Changelog |

## Lokal starten

```sh
./start.sh
```

Open <http://127.0.0.1:8080/>. It needs an HTTP server, not a file: the page loads `tiles.json` and its modules, and `file://` fails on both.

## Tests

```sh
pnpm install
pnpm unit    # Vitest, report: test-report/unit/index.html
pnpm e2e     # Playwright, report incl. videos: test-report/e2e/index.html
pnpm check   # both
```

`./publish-pages.sh` runs the tests and copies the reports to `site/test/`, so the footer link **Tests** works on the published page.

## Licence

MIT, see [LICENSE](LICENSE).
