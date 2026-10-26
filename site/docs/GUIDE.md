# Guide

The [README](README.md) covers installation, features and configuration. This
guide keeps only the operational details that are not covered there.

## Checking the helper

Check whether the socket is enabled and start it after a restart if needed:

```sh
systemctl --user status die-wand-sync.socket
systemctl --user start die-wand-sync.socket
```

To check the helper directly:

```sh
curl -s http://127.0.0.1:8124/tiles.json | head -c 200
```

If the page is served from a non-loopback origin, add that origin to the
service's environment. The helper is started by the socket, so set this in the
`.service` file rather than in the shell:

```ini
[Service]
Environment=DIE_WAND_ORIGIN=https://wall.example:8443
```

## Exporting and importing bookmarks

Export from Chrome at `chrome://bookmarks`: open the `⋮` menu and choose
**Export bookmarks**.

When dropping a bookmark file onto the page, the existing wall is replaced and
folders are flattened. Entries without a name use the host name from their
address; entries without an `http://` or `https://` address, including
`javascript:` links, are discarded.

## Writing the tiles file

To refresh the file the page reads, run the importer locally:

```sh
./import/chrome.py --dry-run     # count only; write nothing
./import/chrome.py --local-only  # write locally; do not contact a server
```

Without `--local-only`, the importer also tries to send the file to the server
over SSH. By default it writes to `~/die-wand-tiles.json`, while the page reads
`site/tiles.json`. Point it at that file when you want the local page to use
the imported bookmarks:

```sh
DIE_WAND_FILE=/path/to/die-wand/site/tiles.json ./import/chrome.py --local-only
```

The importer writes only when something changed, so tiles edited in the
browser are not overwritten by an unchanged import.

## Server deployment details

The README has the short deployment command. For the HTTPS setup, put the
certificate files in `deploy/ssl` as `wall.fullchain.crt` and `wall.key`.
Without them nginx does not start. Run `docker compose up -d` from `deploy/`.

The container serves HTTPS on port `8443`; port `8110` redirects to HTTPS. For
a plain HTTP test, remove the `8443:443` port mapping and SSL mount; the page
then stays on port `8110`.

The nginx configuration runs its worker as root because some NAS filesystems
deny non-root container users access to bind mounts. On a system without that
limitation, remove the root user setting.

The importer sends the file over SSH, base64-encodes it for transfer, then
compares checksums on both sides. Its connection settings are listed in the
README.

## Additional check

To read Chrome once and report the result without starting the network helper:

```sh
python3 import/serve.py --test
```
