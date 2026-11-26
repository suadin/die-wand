#!/bin/sh
# Bringt die Kachelwand aufs NAS: statische Seite, nginx-Konfiguration und
# Zertifikat, danach Neustart des Containers.
#
#   ./deploy.sh
#
# Die Lesezeichen (tiles.json) gehören NICHT hierher — die schiebt
# backend/chrome.py selbst aufs NAS. Dieses Skript fasst nur die Seite an.
#
# Maschinen-Werte kommen aus deploy/.env (gitignored, Vorlage .env.example).
set -eu

cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

if grep -qE '^[[:space:]]*-[[:space:]]*\.\./site:' "$ROOT/deploy/compose.yaml"; then
  echo "deploy: compose mount zeigt aus NAS_DIR heraus — ./site erwartet" >&2
  exit 1
fi

if [ -f .env ]; then . ./.env; fi
: "${NAS_HOST:?NAS_HOST fehlt — deploy/.env anlegen (siehe .env.example)}"
: "${NAS_USER:?NAS_USER fehlt}"
: "${NAS_KEY:?NAS_KEY fehlt}"
: "${NAS_DIR:?NAS_DIR fehlt}"

SSH="ssh -i $NAS_KEY -o BatchMode=yes $NAS_USER@$NAS_HOST"
TLS_DIR="${TLS_DIR:-$HOME/Projects/tls}"
CERT="$TLS_DIR/die-wand"

# 1. Zertifikat: einmal ausstellen, danach wiederverwenden.
if [ ! -f "$CERT/fullchain.crt" ] || [ ! -f "$CERT/tls.key" ]; then
  "$TLS_DIR/issue.sh" die-wand "IP:192.168.178.50,IP:127.0.0.1,DNS:localhost"
fi

# 2. Statische Seite, ohne tiles.json (das sind die Live-Lesezeichen).
# Erst aufräumen (gelöschte Dateien sollen nicht liegen bleiben), dann neu.
$SSH "mkdir -p '$NAS_DIR/site' && find '$NAS_DIR/site' -mindepth 1 -maxdepth 1 ! -name tiles.json -exec rm -rf {} +"
tar -C "$ROOT/site" --exclude='./tiles.json' -czf - . | \
  $SSH "tar -xzf - -C '$NAS_DIR/site'"

# Die Seite muss dort liegen, wo compose sie mountet.
$SSH "test -f '$NAS_DIR/site/index.html' && test -f '$NAS_DIR/site/tiles.json'"

# 3. compose.yaml und nginx.conf (auf dem NAS liegen sie flach im NAS_DIR).
base64 "$ROOT/deploy/compose.yaml" | $SSH "base64 -d > '$NAS_DIR/compose.yaml'"
base64 "$ROOT/deploy/nginx.conf" | $SSH "base64 -d > '$NAS_DIR/nginx.conf'"

# 4. Zertifikat mit den passenden Rechten (644/600).
base64 "$CERT/fullchain.crt" | $SSH "mkdir -p '$NAS_DIR/ssl' && base64 -d > '$NAS_DIR/ssl/fullchain.crt' && chmod 644 '$NAS_DIR/ssl/fullchain.crt'"
base64 "$CERT/tls.key"     | $SSH "base64 -d > '$NAS_DIR/ssl/tls.key' && chmod 600 '$NAS_DIR/ssl/tls.key'"

# 5. Neustart: nginx liest Konfiguration und Zertifikat nur beim Start neu.
$SSH "docker compose --project-directory '$NAS_DIR' -f '$NAS_DIR/compose.yaml' up -d --force-recreate"

echo "deploy: $NAS_DIR ist aktuell, Container neu gestartet."
