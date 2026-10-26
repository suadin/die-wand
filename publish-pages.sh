#!/usr/bin/env bash
# Rebuilds the documentation copies and docs/ — docs/ is what GitHub Pages
# publishes, site/ is where the page is written. Run after every change in
# site/, in README.md, or in GUIDE.md, and commit both.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The reader fetches these next to the page. Keeping the copies in site/ makes
# the same page work from a local server, from the NAS, and from Pages.
mkdir -p "$here/site/docs"
cp "$here/README.md" "$here/GUIDE.md" "$here/site/docs/"

rm -rf "$here/docs"
mkdir -p "$here/docs"
cp -R "$here"/site/. "$here/docs"/
# Keeps Pages from running the directory through Jekyll, which would ignore
# files it does not know. Rebuilt here because docs/ is deleted above.
touch "$here/docs/.nojekyll"
echo "docs/ rebuilt from site/, documentation copied into site/docs/"
