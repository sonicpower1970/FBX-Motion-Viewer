#!/bin/sh
# Use a project-local official Node distribution, or an already selected Node 24.
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(cat "$PROJECT_DIR/.nvmrc")
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM=darwin-arm64 ;;
  Darwin-x86_64) PLATFORM=darwin-x64 ;;
  Linux-x86_64) PLATFORM=linux-x64 ;;
  Linux-aarch64) PLATFORM=linux-arm64 ;;
  *) PLATFORM=unsupported ;;
esac
LOCAL_BIN="$PROJECT_DIR/.tools/node-v$VERSION-$PLATFORM/bin"
if [ -x "$LOCAL_BIN/node" ]; then
  PATH="$LOCAL_BIN:$PATH"
  export PATH
fi
case "$(node --version)" in
  v24.*) exec "$@" ;;
  *) echo 'Select Node.js 24 first (see README.md).' >&2; exit 1 ;;
esac
