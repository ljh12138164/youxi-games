#!/usr/bin/env bash
set -euo pipefail

core_dir="$(cd "$(dirname "$0")" && pwd)"
game_dir="$(dirname "$core_dir")"
cache="${GREENHOUSE_BUILD_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/youxi-greenhouse}"
mkdir -p "$cache"
cache="$(cd "$cache" && pwd)"
jobs="${GREENHOUSE_BUILD_JOBS:-6}"
engine="$cache/engine"
openmpt="$cache/openmpt"
prefix="$cache/openmpt-prefix"
build="$cache/build-web"
output="$game_dir/src/runtime"

if ! command -v emcmake >/dev/null; then
  if [[ ! -d "$cache/emsdk/.git" ]]; then
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$cache/emsdk"
  fi
  if [[ ! -f "$cache/emsdk/upstream/emscripten/emcc" ]]; then
    "$cache/emsdk/emsdk" install 4.0.23
    "$cache/emsdk/emsdk" activate 4.0.23
  fi
  EMSDK_QUIET=1 source "$cache/emsdk/emsdk_env.sh"
fi

if [[ ! -d "$engine/.git" ]]; then
  git clone --depth 1 --branch 0.2.7 https://github.com/wszqkzqk/PvZ-Portable.git "$engine"
fi
test "$(git -C "$engine" rev-parse HEAD)" = 25102237612a82cbe0282d5a8c5db406d029e647
for patch in "$core_dir/web-font.patch" "$core_dir/web-challenges.patch"; do
  if ! git -C "$engine" apply --reverse --check "$patch" 2>/dev/null; then
    git -C "$engine" apply "$patch"
  fi
done
if [[ ! -d "$openmpt/.git" ]]; then
  git clone --depth 1 --branch libopenmpt-0.8.4 https://github.com/OpenMPT/openmpt.git "$openmpt"
fi
test "$(git -C "$openmpt" rev-parse HEAD)" = 327204eaa2c27bd1acbb571babe68f279c85238b

if [[ ! -f "$prefix/lib/libopenmpt.a" ]]; then
  (
    cd "$openmpt"
    opts=(CONFIG=emscripten STATIC_LIB=1 SHARED_LIB=0 EXAMPLES=0 OPENMPT123=0 TEST=0
      NO_ZLIB=1 NO_MPG123=1 NO_OGG=1 NO_VORBIS=1 NO_VORBISFILE=1 NO_PORTAUDIO=1
      NO_PORTAUDIOCPP=1 NO_PULSEAUDIO=1 NO_SDL2=1 NO_FLAC=1 NO_SNDFILE=1)
    emmake make "${opts[@]}" -j"$jobs"
    emmake make "${opts[@]}" PREFIX="$prefix" install
  )
fi

emcmake cmake -S "$engine" -B "$build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  "-DCMAKE_PROJECT_INCLUDE=$core_dir/web.cmake" \
  "-DOPENMPT_LIBRARY=$prefix/lib/libopenmpt.a" \
  "-DOpenMPT_LIBRARY=$prefix/lib/libopenmpt.a" "-DOpenMPT_INCLUDE_DIR=$prefix/include" \
  "-DCMAKE_C_FLAGS=-I$prefix/include" "-DCMAKE_CXX_FLAGS=-I$prefix/include"
cmake --build "$build" --parallel "$jobs"

mkdir -p "$output"
cp "$build/pvz-portable.js" "$output/engine.js"
cp "$build/pvz-portable.wasm" "$output/engine.wasm"
cp "$engine/LICENSE" "$output/LGPL-3.0.txt"
cp "$engine/COPYING" "$output/GPL-3.0.txt"
cp "$engine/src/SexyAppFramework/LICENSE" "$output/framework-license.txt"
cp "$openmpt/LICENSE" "$output/audio-license.txt"
python3 "$engine/scripts/make-compat-overrides.py" "$output/assets/yard.pak" \
  -o "$output/assets/properties/pvz-portable.xml" --force
