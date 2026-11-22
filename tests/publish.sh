#!/usr/bin/env bash
# Führt die Tests aus und legt die Reports nach site/test/, damit der
# Footer-Link „Tests" auch auf der veröffentlichten Seite funktioniert.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here/.."

pnpm check

rm -rf site/test
mkdir -p site/test
cp -R tests/report/unit site/test/unit
cp -R tests/report/e2e site/test/e2e
if [ -f tests/results/journey-die-wand-happy-path-chromium/journey.webm ]; then
  cp tests/results/journey-die-wand-happy-path-chromium/journey.webm site/test/e2e/journey.webm
fi

cat > site/test/index.html <<'EOF'
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DIE WAND — Tests</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="container py-4">
  <h1 class="h4">Test-Reports</h1>
  <ul class="list-unstyled">
    <li><a href="unit/index.html">Unit-Tests</a></li>
    <li><a href="e2e/index.html">E2E-Tests (mit Videos)</a></li>
    <li><a href="e2e/journey.webm">Journey-Video (Happy Path)</a></li>
  </ul>
  <p class="text-muted small mt-3"><a href="../" class="link-secondary">zurück zur Wand</a></p>
</body>
</html>
EOF

echo "site/test/ aus tests/report/ gebaut"
