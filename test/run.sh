#!/usr/bin/env bash
# Checks the logic of the tile wall, without a browser and without a server.
#
# logic.js is an ES module without DOM access, except DOMParser while reading
# bookmark files. For the test a minimal DOM is rebuilt and passed as the
# document argument — that parameter exists for exactly this.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Syntax check for both scripts. main.js runs only in the browser and is
# therefore not covered by the checks below — a doubly declared name in it once
# crippled the page while serving, without a single check complaining. gjs
# reports syntax errors while loading the module, before it ever fails on
# document.
for script in logic.js main.js; do
  # The output is collected first: with a pipefile the status of gjs (which is
  # non-zero anyway because of document) would decide for pipefail and the
  # check would wave everything through.
  output="$(gjs -m "$root/site/$script" 2>&1 || true)"
  if grep -q "SyntaxError" <<<"$output"; then
    echo "ERROR syntax in site/$script:"
    grep -m1 "SyntaxError" <<<"$output"
    exit 1
  fi
done

TEST_LOGIC="$root/site/logic.js" gjs -m "$root/test/logic-test.js"
