# Basic specs — die-wand

The source is the workspace contract (`contract.md`). This page records how
die-wand applies it; project rules are in [APP SPECS](APP-SPECS.md).

## Footer

One centred line with icons: `README | source | unit | E2E`. Only README is a
documentation item; it opens the reader, which lists README, both SPECS, GUIDE and
release notes as tabs. Test items show count and line coverage; a missing run is red
and says `not executed`. Coverage is always measured: Python via `trace`, browser
JS via Playwright `page.coverage`. Test tooltips always have three rows: `Measured`,
`Duration`, `Per test`.

## Reader

README, both SPECS, GUIDE and release notes are read in the page. Sections are
line icons with the heading as tooltip. Relative `.md` links stay in the reader.
Release notes are one continuous page, newest first.

## Links and tests

`#/docs/<doc>/<section>` restores the reader; `#/` is the wall. Unit tests live
in `test/` and `import/`; Playwright E2E journeys live in `e2e/`. Both counts and both coverages
come from `site/test-metrics.json`, and `./test/metrics.sh` merges the last E2E
run into it. Each SPECS page lists the concrete names under `Automated tests`;
`./test/check-requirements.py` fails when a name or a section drifts.

## Design

Diary is the reference: Comic Sans/Trebuchet stack, 2px ink outlines, hard
offset shadows, thick dashed dividers, yellow selection, green links, speech
bubble tooltips. The root stays at `100%` so browser zoom scales everything.
Cursors: hand = clickable, help = tooltip, default = text.

## Not applicable

The wall is one bounded view: there is no list to page and no calendar. The
page is static and read-only.
