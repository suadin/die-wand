# Guide

How the page runs, how bookmarks go out and come back in.

In short: the page needs **nothing** but an HTTP server. It is HTML, CSS and
two JavaScript files. Over `file://` it does not work, because it reloads its
own file `tiles.json` — that requires a scheme.

## 1. Hosting locally

```bash
cd repos/die-wand
python3 -m http.server 8099 --directory site/
```

Then open <http://127.0.0.1:8099/>. That was all: page, `tiles.json`, both
scripts and the icon come with HTTP 200 and the matching type.

Two things matter here:

* **Do not** open `site/index.html` in the browser. Over `file://` the reload
  of `tiles.json` fails, and so does the loading of the modules.
* The tiles lie in the `localStorage` of **this** browser for `127.0.0.1:8099`.
  On another host they are different ones. Both places have their own working
  copy, both fetch the file on opening when it is there.

Own tiles before the first call? Put `tiles.json` in `site/`. The file in the
repository is deliberately empty, so that nobody inherits foreign addresses.

## 2. Reading Chrome automatically

The page cannot read Chrome itself, so a small helper does it. It runs on the
machine where Chrome's profile lies, and only while the page asks:

```bash
systemctl --user status die-wand-sync.socket
systemctl --user start   die-wand-sync.socket   # needed after a restart
curl -s http://127.0.0.1:8124/tiles.json | head -c 200
```

The units are in `systemd/`. Copy them into `~/.config/systemd/user/`, point the
`.service` at your `import/serve.py`, then `systemctl --user daemon-reload`
and `enable --now`.

**Who may read the answer.** The helper answers with your whole bookmark bar,
so it only leaves the machine for an origin you allow. Loopback origins are
allowed by default, which is what the local setup in section 1 needs. If the
page is served from somewhere else, name that origin:

```sh
DIE_WAND_ORIGIN=https://wall.example:8443
```

A request from any other origin is answered `403`, and the preflight for it
fails as well — otherwise any website you visit could read your bookmarks out
of `127.0.0.1`. `curl` and other tools without an `Origin` still work and get
no CORS header.

## 3. Exporting bookmarks

From Chrome: `chrome://bookmarks` → menu `⋮` → **Export bookmarks**.

There is no export from the wall, and deliberately so: Chrome exports bookmarks
itself, in exactly the format this page reads back. The detour through the page
would only be a second place where something can break.

The wall's JSON (`tiles.json`) is the page's own format. It can do more than an
HTML file: a self-set glyph (`glyph`) and the icon's address (`icon`) are part
of it — and, since the embedding, the image itself.

## 4. Importing for the web page

Drag a file with bookmarks onto the wall, `.html` or `.json`. That is also the
way for browsers the page cannot read from, such as Firefox or Safari: lay
their export on the wall. Two rules, and both are deliberate:

* **Everything is replaced.** Nothing is appended; whatever was there before is
  lost. The wall then shows exactly what is in the file.
* **Everything lands flat on the wall.** Folders from the file are dissolved,
  their tiles stand side by side. There are no collapsible folders anymore;
  whoever wants some back has to create them by hand.

On export Chrome wraps a folder "Bookmarks bar" around everything. It is
dissolved like any other.

If a tile has no name, the wall takes the name of the machine from the address.
One without `http://` or `https://` is discarded, as is `javascript:`.

From the wall back to Chrome, the HTML file is there: in Chrome
`chrome://bookmarks` → three-dot menu → **Import bookmarks** → the downloaded
`bookmarks.html`.

## 5. What travels and what does not

| | HTML export | JSON on the server |
|---|---|---|
| Name (alias) | yes, as text in the `<A>` | yes |
| Address | yes, in the `HREF` | yes |
| Folder | yes, as `<H3>` with nested `<DL>` | yes |
| own glyph | no | yes |
| icon address | no | yes |

Chrome knows no field for a self-set glyph in the bookmark format, so there is
no place for it. Whoever needs that takes the JSON file.

## 6. On a server

`deploy/` holds a compose file and an nginx configuration:

```bash
cd repos/die-wand/deploy
docker compose up -d
```

* The page is mounted from `../site`.
* Put your certificate into `deploy/ssl` as `wall.fullchain.crt` and
  `wall.key`. Without them nginx does not start.
* The own `nginx.conf` runs the worker as root, because some NAS filesystems
  deny non-root users in containers any access to bind mounts; on a system that
  does not, drop the mount and the `user root` line.
* Two ports: `8110` redirects to https, `8443` serves it. For a plain test run
  drop `8443:443` and the ssl mount, then it stays at 8110.

The wall is written to by `import/chrome.py` from the machine where Chrome
runs; it pushes the file over ssh, base64 by base64, and compares the checksum
on both sides. See the variables in the README.

## 7. Checking

```bash
./test/run.sh                    # the page's logic
python3 import/test_chrome.py    # the Chrome import
python3 import/test_serve.py     # the helper
python3 import/serve.py --test   # read once without network
```