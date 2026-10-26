# die-wand

Your Chrome bookmark bar as a start page. Every bookmark becomes a tile, one
click opens it in a new tab. No build step, no framework, no account, no cloud —
the page is HTML, CSS and two JavaScript modules.

## Install

Needs `python3` and a browser. `gjs` as well, if you want to run the tests;
Docker only for the server variant.

```sh
git clone https://github.com/suadin/die-wand.git
cd die-wand
python3 -m http.server 8099 --directory site/
```

Open <http://127.0.0.1:8099/>. That is the whole installation. It needs an HTTP
server, not a file: the page loads `tiles.json` and its modules, and `file://`
fails on both.

This local setup was successfully reproduced with GitHub Copilot without
choosing a model, confirming that an AI assistant can set it up from these
instructions.

**If Chrome is not where the code expects it**, the page stays empty. Chrome
keeps its profile in `~/.config/google-chrome` by default; a Flatpak Chrome
lives under `~/.var/app/com.google.Chrome/config/google-chrome`. In both cases
name the directory that *contains* the profiles:

```sh
DIE_WAND_CHROME=~/.var/app/com.google.Chrome/config/google-chrome ./import/chrome.py --dry-run
```

That prints how many tiles it found, or tells you which paths it looked in.
To have them appear automatically, install the helper — see
[Reading Chrome automatically](#reading-chrome-automatically).

## Make it your start page

The page is a start page by being a page you open first. In Chrome, at
`chrome://settings/onStartup`, choose **Open a specific page** and set it to the
address you serve it on, `http://127.0.0.1:8099/`. A window that opens only the
wall gets the same effect with
`google-chrome --app=http://127.0.0.1:8099/`, which you can put in your
autostart.

Note that the wall fills itself from the helper on the machine where **the
browser** runs, not where Chrome runs. On another device it shows the last
`tiles.json` and nothing more.

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
- **Serves its own documentation.** The footer opens this README and the
  [GUIDE](GUIDE.md) in the page, one page per level-two heading. `#/docs/readme`
  and `#/docs/readme/tests` are stable addresses; reloading one restores the
  same page. A link inside a document opens the other document in the reader.
- **Shows where it comes from and what it was measured with.** The footer
  carries the repository, the last unit-test count from
  `site/test-metrics.json`, and the E2E state. A missing measurement reads
  "not measured", never zero.

The interface follows the workspace contract where it applies: README and source
in one centred footer, deep links, `yyyy-mm-dd` where dates appear, quiet
colours, one name for one thing. Three rules do not apply to a wall: it has no
lists to page, no calendar, and no E2E suite. The static page also cannot start
a test run itself, so the unit number is the last measurement written by
`./test/metrics.sh`, not a button. Coverage is not measured yet.

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

The helper only reads. It writes nothing, deletes nothing, and opens Chrome's
icon database read-only — the file on the server is written by `chrome.py`.

## Security

The helper sits on `127.0.0.1:8124` and hands out your whole bookmark bar: the
titles of your bookmarks, the addresses, and for every tile which service it
points at. That makes it worth being precise about who may ask.

**It binds to the loopback only.** Not to `0.0.0.0`. From the network, from
another machine, nothing answers — there is no second line of defence to fall
back on, so the address it listens on is the first wall.

**It answers only the origins you allow.** This part was wrong at first and is
worth spelling out, because the failure is silent. With
`Access-Control-Allow-Origin: *` — which is what a quick CORS header tends to
become — **any website you happen to visit could ask the helper and read your
bookmarks**. Not the tiles you look at: all of them, including the ones you did
not click. `Access-Control-Allow-Private-Network: true` was set as well, which
is what lets a page on the open internet reach an address on your own network
in the first place. Nothing on the wall would have looked wrong, because from
the wall everything looked fine.

So the helper checks the `Origin` header and answers anything unexpected with
`403` — the preflight as well, so the browser never even gets to the answer.
Measured, against the running helper:

| Who asks | Answer |
|---|---|
| A foreign origin, e.g. `https://evil.example` | `403` |
| `http://127.0.0.1.evil.example`, passing itself off as local | `403` |
| `Origin: null`, from a `file://` page or a sandboxed frame | `403` |
| `http://127.0.0.1:8099`, the local setup | `200` |
| No origin at all, `curl` on your own machine | `200`, no CORS header |

**Loopback origins are allowed by default**, because the local setup runs the
page on one port and the helper on another, which counts as cross-origin on its
own. Anything else you name yourself:

```sh
DIE_WAND_ORIGIN=https://wall.example:8443
```

**What this does not protect against.** Any program running on your own machine
can read `http://127.0.0.1:8124/tiles.json` without sending an origin, and there
is nothing it can do about that — the helper binds to localhost, and localhost
means every process you run. The origin check protects the browser; it is not
protection against your own software. If that is the threat you are worried
about, the way out is a shared secret the page presents, not a header.

## Configuration

| Variable | Default | What it is |
|---|---|---|
| `DIE_WAND_CHROME` | `~/.config/google-chrome` | which browser to read; a Flatpak Chrome lives under `~/.var/app/com.google.Chrome/config/google-chrome` |
| `DIE_WAND_FILE` | `~/die-wand-tiles.json` | where to write the local file |
| `DIE_WAND_NAS` | `/volume1/docker/die-wand/site/tiles.json` | where to write on the server |
| `DIE_WAND_NAS_HOST` / `_USER` / `_KEY` | — | how to reach the server over ssh |
| `DIE_WAND_ORIGIN` | — | extra origins allowed to read the helper |

The local file is written only when something changed, so a tile you made by
hand on the wall is not overwritten on the next run.

**Renaming tiles.** `import/chrome.py` also looks for an `import/renames.json`
next to itself, mapping a bookmark title to what it should say on the wall:

```json
{"Homepage": "DIE WAND"}
```

The file is in `.gitignore` — it is a personal table, not a property of the
tool. Without it nothing is renamed; nothing breaks.

## Deploying on a server

`deploy/` holds a compose file and an nginx configuration. Copy your own
certificate into `deploy/ssl`, then from `deploy/`:

```sh
docker compose up -d
```

The page is mounted from `../site`. Details and the certificate are in
[GUIDE.md](GUIDE.md), which covers the deployment details not repeated here.

## GitHub Pages

The page is published at <https://suadin.github.io/die-wand/>. What is served
is `docs/`, a copy of `site/`; run `./publish-pages.sh` after a change in
`site/`, in this README, or in `GUIDE.md` so both stay in step. The script also
copies the two documents into `site/docs/`, which is what the reader fetches.

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

## Tests

```sh
./test/run.sh                 # page logic and documentation reader, gjs, no browser
python3 import/test_chrome.py # the Chrome import
python3 import/test_serve.py  # the helper
./test/metrics.sh             # run all three and write site/test-metrics.json
```

The footer reads `site/test-metrics.json`; commit it after a change so the page
shows the current count. The suites currently hold 115 unit tests: 64 for the
page logic and reader, 37 for the Chrome import, 14 for the helper. There is no
E2E suite and no coverage measurement yet, and the footer says so rather than
showing zero. `./test/run.sh` also fails when `site/docs/README.md` or
`site/docs/GUIDE.md` drifted from the root documents; `./publish-pages.sh`
refreshes them.

## How this was written

This repository was written with an AI assistant (opencode, running the
space-bunny-free and DeepSeek V4.1 models) in the sense that most of the code
and prose was drafted by a model and reviewed, corrected and tested by a human.
It is worth reading the code before you trust it with your own bookmarks — it
reads and rewrites files in a Chrome profile.

## Licence

MIT, see [LICENSE](LICENSE).