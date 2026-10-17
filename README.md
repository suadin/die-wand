# die-wand

Your Chrome bookmark bar as a start page. Every bookmark becomes a tile, one
click opens it in a new tab. No build step, no framework, no account, no cloud —
the page is HTML, CSS and two JavaScript modules.

![DIE WAND](site/icon.svg)

## Install

```sh
git clone <url> die-wand
cd die-wand
python3 -m http.server 8099 --directory site/
```

Open <http://127.0.0.1:8099/>. That is the whole installation. It needs an HTTP
server, not a file: the page loads `tiles.json` and its modules, and `file://`
fails on both.

To have the tiles from Chrome appear automatically, install the helper — see
[Reading Chrome automatically](#reading-chrome-automatically).

## What it does

- **Reads Chrome's bookmarks.** `import/chrome.py` reads them, adds the icons
  Chrome has cached, and writes a `tiles.json`. It looks in
  `AccountBookmarks` (signed-in Google account) and in `Bookmarks` (no
  account) — both are the same JSON. `--dry-run` only counts.
- **Shows the icon of each site, as a picture in the file.** The bitmaps come
  out of Chrome's own database and are embedded in `tiles.json`, so no icon
  is fetched from anywhere. That is what makes the LAN entries work: the page
  is https, their icons are not.
- **Serves them fresh, on request.** `import/serve.py` answers
  `http://127.0.0.1:8124/tiles.json` from the same machine. Started by a
  systemd socket, so it only runs while the page asks — no timer, nothing in
  the background.
- **Imports.** Drop a bookmark file from Chrome, Firefox or Edge onto the page.
  It replaces the wall completely and flattens folders: everything sits side by
  side, in the order the bookmarks bar had it.
- **Falls back to three well-known paths** (`/favicon.ico`,
  `/apple-touch-icon.png`, `/static/icons/favicon-192x192.png` — the last one is
  where Home Assistant puts it) for what Chrome has no bitmap for. No icon
  service, so no address of yours is sent to a third party. What has no icon at
  all gets its first letter.

## Which bookmarks are supported

| Source | Read automatically | Import by dropping its export |
|---|---|---|
| Chrome, with a Google account | yes (`AccountBookmarks`) | yes |
| Chrome, without an account | yes (`Bookmarks`) | yes |
| Brave, Vivaldi, Edge, Chromium | yes, with `DIE_WAND_CHROME` pointed at its profile | yes |
| Firefox | no | yes |
| Safari | no | yes |

Automatic reading means "the file this browser writes as plain JSON". Chrome's
siblings do exactly that, so they are one environment variable away:

```sh
DIE_WAND_CHROME=~/.config/org.vivaldi.Vivaldi/Default ./import/chrome.py
```

Firefox keeps its bookmarks in a SQLite database with a different schema
(`places.sqlite`), Safari in a format that is not readable from outside. Dragging
their export file onto the page works for all of them — that is the way in.

## Reading Chrome automatically

The helper `import/serve.py` answers with the current bookmarks when the page
asks. Copy the two files from `systemd/` into `~/.config/systemd/user/`, adjust
the path in the `.service`, then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now die-wand-sync.socket
```

**Security.** The answer holds your bookmark bar, so it only goes to an origin
you allow. Loopback origins (`http://127.0.0.1`, `http://localhost`, any port)
are allowed by default, which is what the local setup above needs. If the page
is served from somewhere else — a server, GitHub Pages — add that origin:

```sh
DIE_WAND_ORIGIN=https://wall.example:8443
```

Without this, a website you happen to visit could ask the helper and read your
bookmarks; the helper answers a foreign origin with `403`.

## Configuration

| Variable | Default | What it is |
|---|---|---|
| `DIE_WAND_CHROME` | the Flatpak Chrome profile | which browser profile to read |
| `DIE_WAND_FILE` | `~/die-wand-tiles.json` | where to write the local file |
| `DIE_WAND_NAS` | `/volume1/docker/die-wand/site/tiles.json` | where to write on the server |
| `DIE_WAND_NAS_HOST` / `_USER` / `_KEY` | — | how to reach the server over ssh |
| `DIE_WAND_ORIGIN` | — | extra origins allowed to read the helper |

The local file is written only when something changed, so a tile you made by
hand on the wall is not overwritten on the next run.

## Deploying on a server

`deploy/` holds a compose file and an nginx configuration. Copy your own
certificate into `deploy/ssl`, then from `deploy/`:

```sh
docker compose up -d
```

The page is mounted from `../site`. Details and the certificate are in
[GUIDE.md](GUIDE.md).

## GitHub Pages

The page itself is static, so it runs on GitHub Pages as they are. What does
not come along is the helper: it is a program on your own machine, so the page
on Pages cannot reach your Chrome. What it can do is read the `tiles.json` in
the repository, and it can import a file you drop onto it. For the wall to fill
itself from Chrome, keep the helper on the machine where Chrome runs and point
the page at it.

## Not in this repository

`import/renames.json` is a personal renaming table and stays local.

## Tests

```sh
./test/run.sh                 # the page's logic, gjs, no browser
python3 import/test_chrome.py # the Chrome import
python3 import/test_serve.py  # the helper
```

## How this was written

This repository was written with an AI assistant (opencode, running the
space-bunny-free and DeepSeek V4.1 models) in the sense that most of the code
and prose was drafted by a model and reviewed, corrected and tested by a human.
It is worth reading the code before you trust it with your own bookmarks — it
reads and rewrites files in a Chrome profile.

## Licence

MIT, see [LICENSE](LICENSE).