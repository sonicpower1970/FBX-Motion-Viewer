#!/bin/sh
# Optional maintainer step; normal builds use the checked-in WASM artifact.
set -eu
cd "$(dirname "$0")/.."
EMCC=${EMCC:-.tools/emsdk/upstream/emscripten/emcc}
"$EMCC" native/ufbx_bridge.c vendor/ufbx/ufbx.c -Ivendor/ufbx -std=c99 -O2 \
  -DUFBX_NO_STDIO -sFILESYSTEM=0 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648 \
  -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=1048576 -sABORTING_MALLOC=0 \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
  -sEXPORTED_FUNCTIONS='["_convert","_malloc","_free"]' \
  -o src/viewer/legacy/generated/ufbx.js
