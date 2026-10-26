"""Measure line coverage of the Python helpers with the standard trace module.

This is the library measurement the contract asks for: `trace.Trace` counts the
executed lines while the two unittest suites run, and the executable lines come
from the source itself. A blank or comment-only line does not count.
"""

from __future__ import annotations

import json
import runpy
import sys
import trace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "import/chrome.py", ROOT / "import/serve.py"]
TESTS = [ROOT / "import/test_chrome.py", ROOT / "import/test_serve.py"]


def executable_lines(path: Path) -> set[int]:
    return {
        index
        for index, line in enumerate(path.read_text().splitlines(), start=1)
        if line.strip() and not line.lstrip().startswith("#")
    }


def main() -> int:
    tracer = trace.Trace(
        count=True,
        trace=False,
        ignoredirs=[sys.prefix, sys.exec_prefix],
    )
    for test in TESTS:
        try:
            tracer.runfunc(runpy.run_path, str(test), run_name="__main__")
        except SystemExit as error:
            if error.code:
                return int(error.code)

    counts = tracer.results().counts
    covered_total = 0
    executable_total = 0
    for target in TARGETS:
        executable = executable_lines(target)
        covered = {
            lineno
            for (filename, lineno), count in counts.items()
            if count > 0 and Path(filename) == target and lineno in executable
        }
        executable_total += len(executable)
        covered_total += len(covered)

    percent = round(covered_total / executable_total * 100, 1)
    print(json.dumps({
        "coveredLines": covered_total,
        "totalLines": executable_total,
        "coverage": percent,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
