# web-server

A web app with its own server process and private data outside the repository.

- Applies `core`, `web-server` and the chosen quality profiles.
- Unit tests cover storage and API; E2E covers the browser journey.
- The footer may start the unit suite once and then show the stored result.
- Browser mutations follow `BASIC-DATA-02`: same-origin to loopback or the exact
  configured HTTPS origin, never a general CORS policy.
- Secrets live in the workspace `secrets/` directory or in the runtime data directory,
  never in the repository.

Example profile list: `["web-server", "quality-python"]`.
