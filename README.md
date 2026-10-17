# die-wand

Your Chrome bookmark bar as a start page. Every bookmark becomes a tile, one
click opens it in a new tab. No build step, no framework, no account, no cloud —
the page is HTML, CSS and two JavaScript modules.

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

The page is published at <https://suadin.github.io/die-wand/>. What is served
is `docs/`, a copy of `site/`; run `./publish-pages.sh` after a change in
`site/` so both stay in step.

What comes with it is the page only. The helper that reads Chrome is a program
on your own machine, so the published page cannot reach it: on GitHub Pages the
wall shows the committed `tiles.json` (empty) and fills when you drop a
bookmark file onto it. For the wall to fill itself from Chrome, run the helper
locally and open the private copy — that is the version with the automatic
reading.

## Why host it on your own machine

The published demo shows the same tiles as your private copy, because the icons
are embedded in the file rather than fetched. The difference shows up with the
addresses that only exist at home, and that is the reason this is worth running
locally:

- **LAN entries work where they are reachable.** A tile for a host like
  `192.168.1.50` or a service on your own port opens only from a machine inside
  the network. Anyone who opens the published page is somewhere else, so those
  tiles point at addresses that do not answer for them. The icon still shows —
  it is a picture in the file — but the tile itself does nothing.
- **Nothing about the network leaves the house.** The bookmark bar names your
  machines, their services and what they are called. On Pages that list would
  be readable by anyone who opens the page, together with the names of your
  hosts. Locally it stays on your own server.
- **The automatic reading only works locally**, for the reason above: the
  helper answers `127.0.0.1`, and 127.0.0.1 means the visitor's own machine.

So: Pages is the demo, the local copy is the wall.

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