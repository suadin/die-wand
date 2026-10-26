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

logic_output="$(./test/run.sh 2>&1)" || { echo "$logic_output"; exit 1; }
logic_count="$(grep -oE '^[0-9]+ checks$' <<<"$logic_output" | grep -oE '^[0-9]+' | awk '{sum += $1} END {print sum + 0}')"

chrome_output="$(python3 import/test_chrome.py 2>&1)"
chrome_count="$(grep -oE 'Ran [0-9]+ tests?' <<<"$chrome_output" | grep -oE '[0-9]+' | head -1)"
serve_output="$(python3 import/test_serve.py 2>&1)"
serve_count="$(grep -oE 'Ran [0-9]+ tests?' <<<"$serve_output" | grep -oE '[0-9]+' | head -1)"

total=$((logic_count + chrome_count + serve_count))
measured="$(date '+%Y-%m-%dT%H:%M')"

cat > "$root/site/test-metrics.json" <<JSON
{
  "unit": {
    "total": $total,
    "coverage": null,
    "measured": "$measured",
    "suites": [
      {"name": "page logic", "tests": $logic_count},
      {"name": "Chrome import", "tests": $chrome_count},
      {"name": "helper", "tests": $serve_count}
    ]
  },
  "e2e": null
}
JSON

echo "unit: $total tests (page logic $logic_count, Chrome import $chrome_count, helper $serve_count)"
echo "wrote site/test-metrics.json"

# The page fetches the file next to it; docs/ is the published copy.
cp "$root/site/test-metrics.json" "$root/docs/test-metrics.json"
