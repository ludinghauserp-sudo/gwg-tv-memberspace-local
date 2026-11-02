#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE_PATH="$ROOT/Libraries" "$ROOT/bin/esbuild" src/main.tsx --bundle --splitting --format=esm --jsx=automatic --outdir=www/assets --public-path=/assets --target=safari16 --minify --define:process.env.NODE_ENV=\"production\" --loader:.png=file --loader:.svg=file
