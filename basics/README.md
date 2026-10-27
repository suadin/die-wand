# Basic Specs

A small, versioned standard for web apps whose primary reader is a future AI session.
It covers the documentation reader, the footer, links, layout, design, dates, data,
tests and quality checks.

The normative text is [`specs/BASIC-SPECS.md`](specs/BASIC-SPECS.md). The rule IDs are
listed in [`rules.json`](rules.json). Apps pin a release with `basics.lock` and verify
it with `python3 basics/check.py`.

The footer shows the app version and the pinned Basic Specs version. The app version
opens SPECS; the Basic Specs version opens BASIC SPECS. SPECS starts with a Changelog
page. A newer major Basic Specs release turns the version red; minor and patch updates
appear in the tooltip.

## Use it

```sh
git clone https://github.com/suadin/basic-specs
cp -R basic-specs/checks/basics.py my-app/basics/check.py
```

The normal way is `basics sync` in an app that already has a `basics.json`:

```sh
python3 basics/check.py --root . sync --from ../basic-specs
python3 basics/check.py --root . docs
python3 basics/check.py --root . check
```

For an app without a manifest:

```sh
python3 basics/check.py init --root . --profile web-static
```

The [specimen](https://suadin.github.io/basic-specs/) shows the visual
language, the footer states and the reader. The separate
[`app-template`](https://github.com/suadin/app-template) is a vanilla static starter
with Lorem Ipsum, tests and a green check.

## Profiles

- `web-static` — no app server; static host or local directory.
- `web-server` — server process, private data and same-origin mutations.
- `design-only` — visual rules only, for tools such as a GNOME extension.
- `quality-typescript` — lint and typecheck commands.
- `quality-python` — lint and format commands.

A profile selects the rules that apply. The app records exceptions with a rule ID, a
reason and a review date in `basics.json`; it never drops a rule silently.

## Release policy

- **Patch** — wording, clarity, checker fix.
- **Minor** — new optional rule or new quality check, advisory first.
- **Major** — mandatory new rule, removed or renamed rule, changed behaviour.

Active apps stay on the same major version. A minor lag is allowed but visible in the
registry. Before a major release, `python3 checks/fleet.py` must show every app on the same
major or every remaining exception documented. The `Basics update` workflow in each app syncs the
latest release and opens a pull request; it never merges on its own.

## What lives here

- `specs/` — the normative document.
- `profiles/` — which rules apply to which kind of app.
- `checks/basics.py` — the portable checker and synchroniser.
- `reference/specimen/` — a live, domain-neutral example with Lorem Ipsum.
- `registry/` — public consumers and their pinned versions.
- `design/tokens.css` — the shared colour, type and shadow tokens.

## Licence

Documentation is CC BY 4.0. Code is MIT. See [`LICENSE`](LICENSE).
