# Release notes

## 0.3.0 — 2026-10-26

The wall follows the shared design contract: Diary's type stack, thick dashed
dividers, 2px ink outlines, hard shadows, speech-bubble tooltips and cursor
rules. The root follows the browser base at `100%`, so Ctrl + wheel zoom scales
the page and the layout still fits at 80–200 %. The header is one row: icon,
title, catch phrase. README in the footer opens the reader, which lists README,
SPECS, SPECS basic, GUIDE and release notes as tabs. Unit and E2E use a clipboard
check and a browser with a play triangle; a missing run is red, shows no percentage and says `not
executed`. Test tooltips always carry `Measured`, `Duration`, and `Per test` on
three rows. A 13-journey Playwright suite covers the wall, the reader tabs,
deep links, unique section icons, tooltips, cursors, the bookmark drop and the
no-overflow layout at 800 px. Each SPECS page lists the tests that protect it under `Automated tests`. Unit coverage is measured with the Python `trace` library, E2E coverage with Playwright's `page.coverage`, so the footer always shows a percentage. Header and footer stay visible while the reader is open; the reader lives in the main panel.

## 0.2.0 — 2026-10-26

The page serves its own documentation: one page per heading, icon sections,
stable deep links. A centred footer carries README, source and the last test
measurement. `./test/metrics.sh` writes the numbers; the reader and its routes
have their own checks.

## 0.1.0 — 2026-10-17

First wall. Chrome bookmarks become tiles, icons are embedded, folders flatten,
the helper serves the current list, and the NAS deployment runs behind nginx.
