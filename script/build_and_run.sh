#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -x GWGMemberSpace 2>/dev/null || true
"$ROOT/script/build-web.sh"
"$ROOT/script/build-native.sh"
open -n "$ROOT/dist/GWG TV Member Space.app"
