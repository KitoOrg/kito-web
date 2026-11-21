#!/usr/bin/env bash
# Builds the web client, then the program that carries it, and leaves the
# plugin ready to install in `plugin/`:
#
#   scripts/build.sh            # a debug build
#   scripts/build.sh --dist     # the build of a release
#   kito plugin add --path plugin
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && npm run build)

profile=dev
dir=debug
if [ "${1:-}" = "--dist" ]; then
  profile=dist
  dir=dist
fi
cargo build --locked --profile "$profile"

suffix=""
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) suffix=".exe" ;; esac
rm -rf plugin
mkdir plugin
cp "target/$dir/kito-web$suffix" kito-plugin.toml plugin/
echo "The plugin is in plugin/: kito plugin add --path $(pwd)/plugin"
