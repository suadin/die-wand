#!/usr/bin/env bash
# Runs the tests and copies their reports into site/test/, so the published
# page links to them. GitHub Pages deploys site/ (see
# .github/workflows/pages.yml), which runs this script first.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

pnpm check

rm -rf site/test
mkdir -p site/test
cp -R test-report/unit site/test/unit
cp -R test-report/e2e site/test/e2e
if [ -f e2e/test-results/journey-die-wand-happy-path-chromium/journey.webm ]; then
  cp e2e/test-results/journey-die-wand-happy-path-chromium/journey.webm site/test/e2e/journey.webm
fi

cat > site/test/index.html <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DIE WAND — Tests</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="container py-4">
  <h1 class="h4">Test reports</h1>
  <ul class="list-unstyled">
    <li><a href="unit/index.html">Unit tests</a></li>
    <li><a href="e2e/index.html">E2E tests (with videos)</a></li>
    <li><a href="e2e/journey.webm">Journey video (happy path)</a></li>
  </ul>
</body>
</html>
EOF

echo "site/test/ built from test-report/"
