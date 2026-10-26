# Basic specs — die-wand

The source is the workspace contract (`contract.md`). This page records how
die-wand applies it; project rules are in [APP SPECS](APP-SPECS.md).

## Footer

One centred line with icons: `README | SPECS | SPECS basic | GUIDE | RELEASE
NOTES | source | unit | E2E`. Every documentation item opens its page directly.
Test items show count and coverage; a missing run is red and says `not
executed`. Test tooltips always have three rows: `Measured`, `Duration`,
`Per test`.

## Reader

README, both SPECS, GUIDE and release notes are read in the page. Sections are
line icons with the heading as tooltip. Relative `.md` links stay in the reader.
Release notes are one continuous page, newest first.

## Links and tests

`#/docs/<doc>/<section>` restores the reader; `#/` is the wall. Unit tests live
in `test/` and `import/`; the count comes from `site/test-metrics.json`. There is
no E2E suite, so that item says `not executed`.

## Design

Diary is the reference: Comic Sans/Trebuchet stack, 2px ink outlines, hard
offset shadows, thick dashed dividers, yellow selection, green links, speech
bubble tooltips. The root stays at `100%` so browser zoom scales everything.
Cursors: hand = clickable, help = tooltip, default = text.

## Not applicable

The wall is one bounded view: there is no list to page and no calendar. The
page is static and read-only.
