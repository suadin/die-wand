"""Check that every test named in the SPECS exists, and every SPECS page has an entry."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLUG = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    return SLUG.sub("-", value.lower()).strip("-") or "page"


def section_slugs(path: Path) -> list[str]:
    return [slugify(match.group(1)) for match in re.finditer(r"^##\s+(.+?)\s*$", path.read_text(), re.M)]


def clean(name: str) -> str:
    return re.sub(r"^(?:\[[A-Z0-9-]+\]\s*)+", "", name)


def unit_names() -> set[str]:
    names: set[str] = set()
    for path in [ROOT / "test/logic-test.js", ROOT / "test/reader-test.js", ROOT / "test/version-test.js"]:
        names.update(clean(name) for name in re.findall(r"check\('([^']+)'", path.read_text()))
    for path in [ROOT / "import/test_chrome.py", ROOT / "import/test_serve.py"]:
        names.update(re.findall(r"def (test_[a-z0-9_]+)", path.read_text()))
    return names


def e2e_names() -> set[str]:
    names: set[str] = set()
    for path in (ROOT / "e2e/tests").glob("*.js"):
        names.update(clean(name) for name in re.findall(r'test\("([^"]+)"', path.read_text()))
    return names


def main() -> int:
    requirements = json.loads((ROOT / "test/requirements.json").read_text())
    units = unit_names()
    e2e = e2e_names()
    errors: list[str] = []

    for spec, key in [("specs/BASIC-SPECS.md", "basic"), ("specs/APP-SPECS.md", "app")]:
        for slug in section_slugs(ROOT / spec):
            if slug not in requirements:
                errors.append(f"{spec}: section '{slug}' has no requirements entry")

    for slug, groups in requirements.items():
        for kind, names in (("unit", units), ("e2e", e2e)):
            for name in groups.get(kind, []):
                if name not in names:
                    errors.append(f"{slug}: {kind} test not found: {name}")

    for error in errors:
        print(f"ERROR {error}")
    if errors:
        return 1
    print(f"requirements: {len(requirements)} sections, every named test exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
