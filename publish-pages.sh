#!/usr/bin/env bash
# Rebuilds docs/ from site/ — docs/ is what GitHub Pages publishes, site/ is
# where the page is written. Run after every change in site/ and commit both.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -rf "$here/docs"
mkdir -p "$here/docs"
cp "$here"/site/index.html "$here"/site/icon.svg "$here"/site/wall.css \
   "$here"/site/main.js "$here"/site/logic.js "$here"/site/tiles.json "$here"/docs/
echo "docs/ rebuilt from site/"