#!/usr/bin/env python3
"""Basic Specs conformance checker and synchroniser.

The app keeps a pinned copy of the standard in ``basics/``. This script verifies
that copy, the generated BASIC-SPECS document, the rule-to-test mapping and, on
request, the commands the app declares in ``basics.json``. It uses only the
Python standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(".").resolve()
BASE = Path(__file__).resolve().parent
TAG = re.compile(r"\[(BASIC|QUALITY)-[A-Z0-9-]+\]")
SKIP = {".git", "node_modules", ".venv", "__pycache__", "dist", "test-results", ".opencode"}
TEXT_SUFFIXES = {
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sh",
    ".html", ".css", ".md", ".json", ".yaml", ".yml", ".toml",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def version() -> str:
    return (BASE / "VERSION").read_text(encoding="utf-8").strip()


def rules() -> list[dict]:
    return read_json(BASE / "rules.json")["rules"]


def walk_files(root: Path, suffixes: set[str] | None = None):
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP for part in path.parts):
            continue
        if suffixes is not None and path.suffix not in suffixes:
            continue
        yield path


def test_files(root: Path, manifest: dict) -> list[Path]:
    configured = manifest.get("testFiles")
    if configured:
        return [root / name for name in configured if (root / name).is_file()]
    files: list[Path] = []
    for directory in ("test", "tests", "e2e"):
        base = root / directory
        if not base.exists():
            continue
        files.extend(walk_files(base, {".js", ".mjs", ".cjs", ".ts", ".tsx", ".py"}))
    return files


def test_names(root: Path, manifest: dict) -> dict[str, list[str]]:
    """Map rule id to the test names that carry its bracket tag."""
    found: dict[str, list[str]] = {}
    for path in test_files(root, manifest):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line in lines:
            for match in TAG.finditer(line):
                tag = match.group(0)[1:-1]
                label = re.search(r"test\(\s*['\"]([^'\"]+)", line)
                name = label.group(1) if label else line.strip()
                name = re.sub(r"\s+", " ", name)[:180]
                found.setdefault(tag, [])
                if name not in found[tag]:
                    found[tag].append(name)
    for rule, names in (manifest.get("tests") or {}).items():
        found.setdefault(rule, [])
        for name in names:
            if name not in found[rule]:
                found[rule].append(name)
    return found


def generated_doc(root: Path, manifest: dict) -> str:
    standard = version()
    spec = (BASE / "specs" / "BASIC-SPECS.md").read_text(encoding="utf-8").rstrip()
    names = test_names(root, manifest)
    lines = [
        f"*Generated from Basic Specs {standard}. Do not edit; run `basics docs`.*",
        "",
        spec,
        "",
        "## This app",
        "",
        f"- Name: `{manifest.get('name', root.name)}`",
        f"- Standard: **{standard}**",
        f"- Profiles: {', '.join(f'`{item}`' for item in manifest.get('profiles', [])) or '—'}",
        "- Source: https://github.com/suadin/basic-specs",
        "",
        "### Deviations",
        "",
    ]
    deviations = manifest.get("deviations") or []
    if not deviations:
        lines.append("None.")
    else:
        for deviation in deviations:
            review = deviation.get("review", "—")
            lines.append(
                f"- `{deviation.get('rule')}` — {deviation.get('reason', '')} "
                f"(review {review})"
            )
    lines.extend(["", "### Automated tests", ""])
    mapped = False
    for rule in rules():
        found = names.get(rule["id"], [])
        if not found:
            continue
        mapped = True
        for name in found:
            label = name if name.startswith(f"[{rule['id']}]") else f"[{rule['id']}] {name}"
            lines.append(f"- `{label}`")
    if not mapped:
        lines.append("None in this profile.")
    return "\n".join(lines).rstrip() + "\n"


def docs_path(root: Path, manifest: dict) -> Path:
    return root / manifest.get("docs", "docs/BASIC-SPECS.md")


def check_lock(root: Path, manifest: dict, errors: list[str]) -> None:
    lock_path = root / "basics.lock"
    if not lock_path.is_file():
        errors.append("basics.lock is missing")
        return
    try:
        lock = read_json(lock_path)
    except Exception as exc:
        errors.append(f"basics.lock is not valid JSON: {exc}")
        return
    if lock.get("standard") != manifest.get("standard"):
        errors.append(
            f"basics.lock pins {lock.get('standard')}, basics.json declares "
            f"{manifest.get('standard')}"
        )
    for name, expected in (lock.get("files") or {}).items():
        path = root / name
        if not path.is_file():
            errors.append(f"pinned file missing: {name}")
        elif digest(path) != expected:
            errors.append(f"pinned file changed: {name}")
    if lock.get("standard") != version():
        errors.append(
            f"basics/VERSION is {version()}, basics.lock pins {lock.get('standard')}"
        )


def check_documents(root: Path, manifest: dict, errors: list[str]) -> None:
    if not (root / "README.md").is_file():
        errors.append("README.md is missing")
    release_notes = manifest.get("releaseNotes", "RELEASE-NOTES.md")
    if not (root / release_notes).is_file():
        errors.append(f"{release_notes} is missing")
    app_specs = manifest.get("appSpecs", "docs/APP-SPECS.md")
    if not (root / app_specs).is_file():
        errors.append(f"{app_specs} is missing")
    if not docs_path(root, manifest).is_file():
        errors.append(f"{docs_path(root, manifest).relative_to(root)} is missing")
    if not (root / "basics" / "specs" / "BASIC-SPECS.md").is_file():
        errors.append("basics/specs/BASIC-SPECS.md is missing")


def check_generated(root: Path, manifest: dict, errors: list[str]) -> None:
    path = docs_path(root, manifest)
    if not path.is_file():
        return
    expected = generated_doc(root, manifest)
    actual = path.read_text(encoding="utf-8")
    if actual != expected:
        errors.append(
            f"{path.relative_to(root)} is not the generated document; run basics docs"
        )


def check_deviations(manifest: dict, errors: list[str]) -> None:
    known = {rule["id"] for rule in rules()}
    for deviation in manifest.get("deviations") or []:
        rule = deviation.get("rule")
        if rule not in known:
            errors.append(f"deviation names unknown rule: {rule}")
        if not deviation.get("reason"):
            errors.append(f"deviation {rule} has no reason")
        review = deviation.get("review")
        if not review:
            errors.append(f"deviation {rule} has no review date")
        else:
            try:
                if date.fromisoformat(review) < date.today():
                    errors.append(f"deviation {rule} expired on {review}")
            except ValueError:
                errors.append(f"deviation {rule} has an invalid review date: {review}")


def check_rule_tests(root: Path, manifest: dict, errors: list[str]) -> None:
    names = test_names(root, manifest)
    deviations = {item.get("rule") for item in manifest.get("deviations") or []}
    for rule in rules():
        if rule["level"] != "MUST":
            continue
        if not set(rule.get("profiles", [])) & set(manifest.get("profiles", [])):
            continue
        if rule["id"] in deviations:
            continue
        if rule.get("test") and rule["id"] not in names:
            errors.append(f"{rule['id']} has no test carrying its tag")
        if rule.get("check") in (None, "review") and not rule.get("test"):
            errors.append(f"{rule['id']} has neither a test nor a built-in check")


def check_tests(root: Path, manifest: dict, errors: list[str]) -> None:
    profiles = set(manifest.get("profiles", []))
    if "web-static" not in profiles and "web-server" not in profiles:
        return
    if not test_files(root, manifest):
        errors.append("no unit or E2E test files found")
    if not (root / "e2e").is_dir():
        errors.append("e2e/ is missing")


def check_metrics(root: Path, manifest: dict, errors: list[str]) -> None:
    name = manifest.get("metrics")
    if not name:
        return
    path = root / name
    if not path.is_file():
        errors.append(f"metrics file is missing: {name}")
        return
    try:
        metrics = read_json(path)
    except Exception as exc:
        errors.append(f"metrics file is not valid JSON: {exc}")
        return
    for suite in ("unit", "e2e"):
        item = metrics.get(suite)
        if not isinstance(item, dict):
            continue
        total = item.get("tests") or item.get("total") or 0
        if total and item.get("coverage") is None:
            errors.append(f"{suite} has tests but no line coverage")
    if not metrics.get("unit"):
        errors.append("metrics has no unit result")


def check_commands(root: Path, manifest: dict, errors: list[str]) -> None:
    commands = manifest.get("commands") or {}
    profiles = set(manifest.get("profiles", []))
    if "web-static" in profiles or "web-server" in profiles:
        for name in ("unit", "e2e", "metrics"):
            if not commands.get(name):
                errors.append(f"commands.{name} is missing for a web profile")
    for profile in ("quality-typescript", "quality-python"):
        if profile in profiles:
            for name in ("lint", "typecheck" if profile == "quality-typescript" else "format"):
                if not commands.get(name):
                    errors.append(f"commands.{name} is missing for {profile}")


def run_commands(root: Path, manifest: dict, errors: list[str], warnings: list[str]) -> None:
    for name, command in (manifest.get("commands") or {}).items():
        if not command:
            continue
        print(f"basics: {name}: {command}")
        result = subprocess.run(command, cwd=root, shell=True)
        if result.returncode != 0:
            errors.append(f"command failed: {name} ({command})")


def check_secrets(root: Path, errors: list[str]) -> None:
    patterns = [
        re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
        re.compile(r"ghp_[A-Za-z0-9]{30,}"),
        re.compile(r"sk-[A-Za-z0-9]{30,}"),
    ]
    for path in walk_files(root, TEXT_SUFFIXES):
        if path.name in (".env", "basics.lock"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in patterns:
            if pattern.search(text):
                errors.append(f"possible secret in {path.relative_to(root)}")
                break


def check(root: Path, manifest: dict, run: bool) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    check_lock(root, manifest, errors)
    check_documents(root, manifest, errors)
    check_generated(root, manifest, errors)
    check_deviations(manifest, errors)
    check_rule_tests(root, manifest, errors)
    check_tests(root, manifest, errors)
    check_metrics(root, manifest, errors)
    check_commands(root, manifest, errors)
    check_secrets(root, errors)
    if run:
        run_commands(root, manifest, errors, warnings)
    for warning in warnings:
        print(f"basics: warning: {warning}")
    if errors:
        for error in errors:
            print(f"basics: error: {error}")
        print(f"basics: {len(errors)} error(s)")
        return 1
    print(
        f"basics: {version()} ok — {len(rules())} rules, "
        f"{len(manifest.get('profiles', []))} profiles, {manifest.get('name', root.name)}"
    )
    return 0


def copy_standard(source: Path, root: Path) -> str:
    standard = (source / "VERSION").read_text(encoding="utf-8").strip()
    target = root / "basics"
    if target.exists():
        shutil.rmtree(target)
    (target / "specs").mkdir(parents=True)
    (target / "profiles").mkdir()
    (target / "VERSION").write_text(standard + "\n", encoding="utf-8")
    shutil.copy2(source / "specs" / "BASIC-SPECS.md", target / "specs" / "BASIC-SPECS.md")
    shutil.copy2(source / "rules.json", target / "rules.json")
    shutil.copy2(source / "README.md", target / "README.md")
    for path in (source / "profiles").glob("*.md"):
        shutil.copy2(path, target / "profiles" / path.name)
    shutil.copy2(source / "checks" / "basics.py", target / "check.py")
    (target / "check.py").chmod(0o755)
    return standard


def sync(root: Path, manifest: dict, source: Path | None, remote: str | None, standard: str | None) -> int:
    temp: tempfile.TemporaryDirectory | None = None
    if source is None:
        if not remote or not standard:
            print("basics: sync needs --from or --source and --version", file=sys.stderr)
            return 2
        url = f"{remote.rstrip('/')}/archive/refs/tags/v{standard}.tar.gz"
        print(f"basics: fetching {url}")
        with urllib.request.urlopen(url, timeout=60) as response:
            archive = response.read()
        temp = tempfile.TemporaryDirectory()
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            tar.extractall(temp.name, filter="data")
        candidates = list(Path(temp.name).iterdir())
        source = candidates[0]
    standard = copy_standard(source, root)
    manifest["standard"] = standard
    write_json(root / "basics.json", manifest)
    files = {
        str(path.relative_to(root)): digest(path)
        for path in walk_files(root / "basics", None)
    }
    write_json(
        root / "basics.lock",
        {
            "standard": standard,
            "source": remote or "https://github.com/suadin/basic-specs",
            "files": files,
        },
    )
    docs_path(root, manifest).parent.mkdir(parents=True, exist_ok=True)
    docs_path(root, manifest).write_text(generated_doc(root, manifest), encoding="utf-8")
    if temp:
        temp.cleanup()
    print(f"basics: synced {standard} into {root} and regenerated {docs_path(root, manifest).relative_to(root)}")
    return 0


def docs(root: Path, manifest: dict) -> int:
    path = docs_path(root, manifest)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(generated_doc(root, manifest), encoding="utf-8")
    print(f"basics: wrote {path.relative_to(root)}")
    return 0


def init(root: Path, manifest: dict) -> int:
    path = root / "basics.json"
    if path.exists():
        print("basics: basics.json already exists", file=sys.stderr)
        return 2
    manifest.setdefault("name", root.name)
    manifest.setdefault("standard", version())
    manifest.setdefault("profiles", ["web-static"])
    manifest.setdefault("docs", "docs/BASIC-SPECS.md")
    manifest.setdefault("appSpecs", "docs/APP-SPECS.md")
    write_json(path, manifest)
    print(f"basics: wrote {path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="basics")
    parser.add_argument("--root", default=".", help="app repository root")
    sub = parser.add_subparsers(dest="command", required=True)

    check_parser = sub.add_parser("check", help="verify the pinned standard")
    check_parser.add_argument("--run", action="store_true", help="also run declared commands")

    sync_parser = sub.add_parser("sync", help="replace the pinned copy with a release")
    sync_parser.add_argument("--from", dest="source", help="local basic-specs checkout")
    sync_parser.add_argument("--source", default="https://github.com/suadin/basic-specs")
    sync_parser.add_argument("--version", dest="standard")

    sub.add_parser("docs", help="regenerate docs/BASIC-SPECS.md")

    init_parser = sub.add_parser("init", help="create a manifest")
    init_parser.add_argument("--profile", action="append", default=None)
    init_parser.add_argument("--name")

    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    manifest_path = root / "basics.json"
    manifest = read_json(manifest_path) if manifest_path.is_file() else {}

    if args.command == "check":
        if not manifest:
            print("basics: basics.json is missing", file=sys.stderr)
            return 2
        return check(root, manifest, args.run)
    if args.command == "sync":
        if not manifest:
            print("basics: basics.json is missing", file=sys.stderr)
            return 2
        return sync(
            root,
            manifest,
            Path(args.source).resolve() if args.source and Path(args.source).exists() else None,
            args.source,
            args.standard,
        )
    if args.command == "docs":
        return docs(root, manifest)
    if args.command == "init":
        if args.profile:
            manifest["profiles"] = args.profile
        if args.name:
            manifest["name"] = args.name
        return init(root, manifest)
    return 2


if __name__ == "__main__":
    sys.exit(main())
