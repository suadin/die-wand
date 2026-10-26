#!/usr/bin/env bash
# Runs every test suite and writes the numbers the footer shows.
#
# The page is static, so it cannot start a run itself: this script is the run
# button, and site/test-metrics.json is the last measurement. Commit the file
# after a change in tests or code. Coverage is line coverage for the Python
# helpers only and is not measured yet; the footer says so instead of showing a
# zero.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

start="$(date +%s%N)"

logic_output="$(./test/run.sh 2>&1)" || { echo "$logic_output"; exit 1; }
logic_count="$(grep -oE '^[0-9]+ checks$' <<<"$logic_output" | grep -oE '^[0-9]+' | awk '{sum += $1} END {print sum + 0}')"

chrome_output="$(python3 import/test_chrome.py 2>&1)"
chrome_count="$(grep -oE 'Ran [0-9]+ tests?' <<<"$chrome_output" | grep -oE '[0-9]+' | head -1)"
serve_output="$(python3 import/test_serve.py 2>&1)"
serve_count="$(grep -oE 'Ran [0-9]+ tests?' <<<"$serve_output" | grep -oE '[0-9]+' | head -1)"

# Coverage of the Python helpers, measured with the standard trace library.
coverage_output="$(python3 "$root/test/coverage.py" 2>/dev/null | tail -1)"
coverage_value="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["coverage"])' <<<"$coverage_output")"
coverage_covered="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["coveredLines"])' <<<"$coverage_output")"
coverage_total="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["totalLines"])' <<<"$coverage_output")"

total=$((logic_count + chrome_count + serve_count))
end="$(date +%s%N)"
duration_ms=$(( (end - start) / 1000000 ))
duration="$(LC_ALL=C awk "BEGIN { printf \"%.1f\", $duration_ms / 1000 }")"
per_test="$(LC_ALL=C awk "BEGIN { printf \"%.3f\", $duration_ms / 1000 / $total }")"
measured="$(date '+%Y-%m-%dT%H:%M')"

# Keep the last E2E result when only the unit suites are measured again.
previous_e2e="null"
if [[ -f "$root/site/test-metrics.json" ]]; then
  previous_e2e="$(python3 -c "import json;print(json.dumps(json.load(open('$root/site/test-metrics.json')).get('e2e')))" 2>/dev/null || echo null)"
fi

cat > "$root/site/test-metrics.json" <<JSON
{
  "unit": {
    "total": $total,
    "coverage": $coverage_value,
    "failed": 0,
    "duration": $duration,
    "perTest": $per_test,
    "coveredLines": $coverage_covered,
    "totalLines": $coverage_total,
    "measured": "$measured",
    "suites": [
      {"name": "page logic", "tests": $logic_count},
      {"name": "Chrome import", "tests": $chrome_count},
      {"name": "helper", "tests": $serve_count}
    ]
  },
  "e2e": $previous_e2e
}
JSON

echo "unit: $total tests in ${duration}s (page logic $logic_count, Chrome import $chrome_count, helper $serve_count)"

# Merge the last E2E run if one exists. Its raw report stays in e2e/; the page
# reads the combined numbers.
if [[ -f "$root/e2e/test-metrics.e2e.json" ]]; then
  python3 - "$root/site/test-metrics.json" "$root/e2e/test-metrics.e2e.json" <<'PY'
import json
import sys
from pathlib import Path

unit_path, e2e_path = Path(sys.argv[1]), Path(sys.argv[2])
metrics = json.loads(unit_path.read_text())
metrics["e2e"] = json.loads(e2e_path.read_text())
unit_path.write_text(json.dumps(metrics, indent=2) + "\n")
PY
  e2e_total="$(python3 -c "import json;print(json.load(open('$root/e2e/test-metrics.e2e.json'))['total'])")"
  echo "e2e: $e2e_total journeys"
fi

python3 - "$root/site/test-metrics.json" "$root/test/requirements.json" <<'PY'
import json
import sys
from pathlib import Path

metrics_path, requirements_path = Path(sys.argv[1]), Path(sys.argv[2])
metrics = json.loads(metrics_path.read_text())
metrics["requirements"] = json.loads(requirements_path.read_text())
metrics_path.write_text(json.dumps(metrics, indent=2) + "\n")
PY

echo "wrote site/test-metrics.json"

# The page fetches the file next to it; docs/ is the published copy.
cp "$root/site/test-metrics.json" "$root/docs/test-metrics.json"
