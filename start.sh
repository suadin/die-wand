#!/bin/sh
# Serves the wall locally at http://127.0.0.1:8080/
cd "$(dirname "$0")/site" && exec python3 -m http.server 8080
