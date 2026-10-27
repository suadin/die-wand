Generated from Basic Specs 1.1.0. Do not edit; run basics docs.

# Basic specs

The reusable base for a small web app whose primary reader is a future AI session.
Project rules stay in the app and never weaken a rule here. See
[README](../README.md#overview) for setup, operation and deployment. A rule that does
not apply is named with its ID, a reason and a review date in `basics.json`; it is never
dropped silently.

## Documents

- **BASIC-DOCS-01** — The app has `README.md`, `APP-SPECS.md`, `BASIC-SPECS.md` and
  `RELEASE-NOTES.md`. README explains setup, operation and deployment. APP-SPECS holds
  the rules specific to the app. This document is generated from the pinned standard.
  `basics.json` names `appVersion`, `standard` and a served runtime file; `basics docs`
  generates the runtime file from those values.
- **BASIC-DOCS-02** — The root README is the single source. Copies used by the deployed
  page are checked against their source; a copy that differs is a defect.

## Reader

- **BASIC-READER-01** — The footer opens a documentation reader in the main panel. Its
  tabs are README, SPECS and BASIC SPECS; an optional API or GUIDE document may follow.
  README, the app version and the Basic Specs version are the only documentation items
  in the footer.
- **BASIC-READER-02** — README and BASIC SPECS use one page per level-two heading; text
  before the first heading is an overview. SPECS is assembled at load time: `Changelog`
  is the first page and stays one continuous page, newest first; the app rules follow.
  An optional API or GUIDE document stays continuous. The level-one title names the
  document and is not repeated in the body.
- **BASIC-READER-05** — `RELEASE-NOTES.md` is the source of the Changelog page, but it
  is not a separate tab. The Changelog is the first SPECS page; its dates or versions
  are subheadings inside that one page.
- **BASIC-READER-03** — Sections are a row of line icons, not text chips. Each icon
  symbolises its section, its tooltip gives the heading, the active icon is yellow and
  rotated by `-2deg`. Within one document no icon repeats.
- **BASIC-READER-04** — Relative Markdown links between documents open in the reader.
  Raw HTML is escaped before any markup is added.

## Footer

- **BASIC-FOOTER-01** — One centred footer carries exactly six items in this order:
  `README | SPECS | BASIC SPECS | source | unit | E2E`, separated by `|`. Each item has
  its own icon: README a book, SPECS the app icon, BASIC SPECS the standard icon,
  source chevrons, unit a clipboard with a check mark, E2E a browser with a play
  triangle. No icon repeats.
- **BASIC-FOOTER-02** — Unit and E2E show their count and line coverage separately.
  A failure count appears only when at least one test failed, and then in red. A
  missing run is red and says `not executed`; a run without coverage says
  `coverage not measured`, never `0`.
- **BASIC-FOOTER-03** — A measured run's tooltip always has three rows:
  `Measured <date> <time>`, `Duration <s> s`, `Per test <s> s`. A missing value is
  `—`. A missing run's tooltip is the single word `not executed`. Test tooltips are
  the wide variant.
- **BASIC-FOOTER-04** — The footer stays on one line at desktop width and wraps
  cleanly when narrow. It is fixed and always visible; the main panel scrolls.

## Versions

- **BASIC-VERSION-01** — The SPECS footer item shows the app icon and the app version
  from `basics.json`; the visible text is only the version. Its tooltip and `aria-label`
  name the app and open SPECS. The app version never turns stale and is never red.
- **BASIC-VERSION-02** — The BASIC SPECS footer item shows the standard icon and the
  pinned Basic Specs version; the visible text is only the version. Its tooltip and
  `aria-label` name Basic Specs and open BASIC SPECS.
- **BASIC-VERSION-03** — The Basic Specs item stays neutral when the pinned version is
  current or only a minor/patch update is available. It turns red only when the latest
  published major version is greater than the pinned major. The tooltip names the
  available version; a failed lookup stays neutral and says `latest not checked`.
- **BASIC-VERSION-04** — The latest version comes from the published release metadata
  (`version.json`), not from `main` or a local checkout. The pinned version comes from
  the generated runtime file, never from hand-written display text.

## Links

- **BASIC-LINKS-01** — Every view has a stable hash, for example
  `#/docs/readme/tests` or `#/play/ai`. A reload restores the view; an unknown address
  returns to the start. Search text and mode are in the address when they define the
  view. Unlinkable state is named in README.

## Layout

- **BASIC-LAYOUT-01** — Header and footer are fixed and always visible; the main panel
  scrolls. The reader opens in the main panel and never covers or hides header or
  footer. A sidebar, when present, is fixed and becomes a horizontal strip at narrow
  widths.
- **BASIC-LAYOUT-02** — The header is one row: icon, title, small catch phrase and
  actions on the right, with a dashed bottom edge.

## Design

- **BASIC-DESIGN-01** — The page follows the operating system's light/dark preference.
  Yellow marks selection and emphasis; red warns; green marks good and links; purple
  marks one special action. Yellow is a fill, not a second accent.
- **BASIC-DESIGN-02** — Focus is a `3px solid green` outline with `2px` offset. Cursors
  say what a thing does: pointer for clickable, default for text, help for a tooltip
  without an action; a tooltip on a clickable item uses the pointer.
- **BASIC-DESIGN-03** — The visual language is paper, card, ink and muted, with `2px`
  ink outlines, hard offset shadows, dashed ink lines and speech-bubble tooltips. Type
  is `"Comic Sans MS","Trebuchet MS",sans-serif`; code is `ui-monospace,monospace`.
  Headings are 800–900, body 400–500. Dates, times, counts and pagers use tabular
  numerals.
- **BASIC-DESIGN-04** — The root stays at `100%`. Sizes use `rem`, widths use
  `clamp()`, so browser zoom scales the page and the layout fits at 80–200%. All motion
  sits behind `prefers-reduced-motion`.

## Dates

- **BASIC-DATES-01** — Dates use `yyyy-mm-dd`, times use `hh24:mi`.

## Data and access

- **BASIC-DATA-01** — Private data lives outside the repository; only generated sample
  data may be public. One token has one `secrets/` file and never appears in the
  repository, README, screenshot or log. A static page reads only.
- **BASIC-DATA-02** — Local human edits need no sign-in. Browser mutations are
  same-origin to loopback or to the exact configured HTTPS origin. That check is not
  authentication for a LAN or internet service.

## Tests

- **BASIC-TESTS-01** — Every app has unit tests and a Playwright E2E suite in `e2e/`.
  The footer shows both counts. Tests always run; a static page runs them by a named
  command and reads the result.
- **BASIC-TESTS-02** — Coverage is line coverage and is measured with a real library:
  Node's built-in test coverage or Python's `trace` for unit code, Playwright
  `page.coverage` for browser JavaScript. A missing percentage is a defect, not a
  display state.
- **BASIC-TESTS-03** — Every test that protects a rule here carries the rule ID in its
  name or docstring, or the app maps the rule to the test in `basics.json`. Each
  MUST rule has a test, a built-in check, or an approved deviation.

## Quality

- **BASIC-QUALITY-01** — A profile may require static analysis: typecheck, lint,
  formatter check, link check, secret scan. The app supplies the command; the standard
  supplies the rule. New quality rules enter as advisory in a minor version and become
  mandatory in the next major version.

## Done

README and specs updated; unit tests green and metrics regenerated; E2E green where
present; `basics check` green; committed, pushed and deployed where a rollout exists.

## This app

- Name: `die-wand`
- App version: **0.5.0**
- Standard: **1.1.0**
- Profiles: `web-static`
- Source: https://github.com/suadin/basic-specs

### Deviations

None.

### Automated tests

- `[BASIC-READER-01] [BASIC-LINKS-01] README opens the reader and a deep link survives a reload`
- `[BASIC-READER-01] the reader lists every document`
- `[BASIC-READER-02] check('[BASIC-READER-02] overview holds the intro', doc.pages[0], {`
- `[BASIC-READER-02] check('[BASIC-READER-02] first section', doc.pages[1].title, 'Install');`
- `[BASIC-READER-02] check('[BASIC-READER-02] repeated headings get their own slug',`
- `[BASIC-READER-03] check('[BASIC-READER-03] icons in one row are unique', new Set(icons).size, icons.length);`
- `[BASIC-READER-03] each section has its own icon`
- `[BASIC-READER-04] check('[BASIC-READER-04] html is escaped', escapeHtml('<b>"x"</b>'),`
- `[BASIC-READER-04] check('[BASIC-READER-04] internal document link is marked',`
- `[BASIC-FOOTER-01] [BASIC-LAYOUT-02] the wall shows tiles and a one-row header`
- `[BASIC-FOOTER-02] a test that has not run is red with a plain tooltip`
- `[BASIC-FOOTER-02] a measured E2E run replaces the red state`
- `[BASIC-FOOTER-03] [BASIC-DATES-01] a test tooltip always has three rows`
- `[BASIC-FOOTER-04] the footer is fixed and wraps cleanly`
- `[BASIC-LINKS-01] check('[BASIC-LINKS-01] route to a section', parseRoute('#/docs/readme/install'),`
- `[BASIC-LINKS-01] [BASIC-READER-01] [BASIC-LINKS-01] README opens the reader and a deep link survives a reload`
- `[BASIC-LAYOUT-01] [BASIC-DESIGN-04] [BASIC-LAYOUT-01] the layout fits at 800 px and follows browser zoom`
- `[BASIC-LAYOUT-02] [BASIC-FOOTER-01] [BASIC-LAYOUT-02] the wall shows tiles and a one-row header`
- `[BASIC-DESIGN-01] the page follows the OS colour scheme`
- `[BASIC-DESIGN-02] cursors say what a thing does`
- `[BASIC-DESIGN-02] focus uses the green outline`
- `[BASIC-DESIGN-04] [BASIC-LAYOUT-01] the layout fits at 800 px and follows browser zoom`
- `[BASIC-DATES-01] [BASIC-FOOTER-03] [BASIC-DATES-01] a test tooltip always has three rows`
- `[BASIC-READER-05] SPECS starts with Changelog`
- `[BASIC-VERSION-01] the app version opens SPECS`
- `[BASIC-VERSION-02] the Basic Specs version opens BASIC SPECS`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] parse', parseVersion('1.2.3'), [1, 2, 3]);`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] compare', compareVersions('1.2.3', '1.2.2'), 1);`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] minor stays neutral', updateState('1.0.2', '1.1.0'), 'newer');`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] major turns red', updateState('1.0.2', '2.0.0'), 'major');`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] current', updateState('1.1.0', '1.1.0'), 'current');`
- `[BASIC-VERSION-03] check('[BASIC-VERSION-03] tooltip names latest', basicVersionTip('1.0.2', '2.0.0', 'major'),`
- `[BASIC-VERSION-03] only a major update turns red`
- `[BASIC-VERSION-04] check('[BASIC-VERSION-04] unknown', updateState('1.1.0', null), 'unknown');`
- `[BASIC-VERSION-04] an unavailable latest version stays neutral`
