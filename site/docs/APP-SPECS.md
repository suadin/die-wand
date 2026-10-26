# App specs — die-wand

What this app does, beyond the shared rules in [BASIC SPECS](BASIC-SPECS.md).

## Reading Chrome

`import/chrome.py` reads `AccountBookmarks` (signed-in account) and `Bookmarks`
(no account), both from the profile named by `DIE_WAND_CHROME`. It embeds the
bitmaps from Chrome's own icon database in `tiles.json`; no icon is fetched from
a third party. A tile without a bitmap tries `/favicon.ico`,
`/apple-touch-icon.png` and `/static/icons/favicon-192x192.png`, then shows its
first character.

Names may be replaced through `import/renames.json`. Without that file Chrome's
title is used.

## The wall

The browser keeps the working copy in `localStorage`. `site/tiles.json` is the
shared starting list and is read only when the browser holds nothing; an empty
list counts as nothing. There is no automatic sync. A dropped bookmark file
replaces the wall completely and flattens folders. What the page shows is not
editable: order, address, icon and title live in Chrome.

## The helper

`import/serve.py` answers `http://127.0.0.1:8124/tiles.json` while the page asks.
It binds to loopback and only allows loopback origins plus `DIE_WAND_ORIGIN`. A
foreign origin gets `403`, including the preflight. The helper reads; it writes
nothing.

## Deployment

`deploy/` serves `site/` through nginx with HTTPS on port `8443`; port `8110`
redirects. The certificate files live in `deploy/ssl` and are not in the
repository. GitHub Pages publishes `docs/`, rebuilt from `site/` by
`./publish-pages.sh`.

## Deviations

No paging, no calendar and no E2E suite. The page is static and read-only.
