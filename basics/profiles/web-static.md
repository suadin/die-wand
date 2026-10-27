# web-static

A page with no application server. It reads files, keeps state in the browser if it
needs state, and deploys to a static host or a local directory.

- Applies `core`, `web-static` and the chosen quality profiles.
- Unit tests run without the browser; E2E runs Playwright against a local server.
- `basics.json` names `unit`, `e2e` and `metrics` commands. A static page cannot start
  its own run; the metrics command is the run button and writes the measurement file.
- `BASIC-DATA-02` does not apply unless the page mutates browser state.
- Paging, search and deep links apply where the page has lists or views.

Example profile list: `["web-static", "quality-typescript"]`.
