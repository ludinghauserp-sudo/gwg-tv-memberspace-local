#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if [ ! -x "$ROOT/bin/GWGLocalServer" ];then "$ROOT/script/build-native.sh";fi
exec "$ROOT/bin/GWGLocalServer" --root "$ROOT/www" --data "$ROOT/Data" --port "${GWG_PORT:-8765}" --open
