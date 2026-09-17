#!/bin/sh
# Run in WSL/Linux with gcc-mingw-w64-x86-64-posix, nasm, make and pkg-config.
# Arguments: extracted unmodified FFmpeg source, empty build directory, output prefix.
set -eu
source_dir=$(realpath "$1")
mkdir -p "$2" "$3"
build_dir=$(realpath "$2")
prefix=$(realpath "$3")
cd "$build_dir"
"$source_dir/configure" --prefix=/gourdy/ffmpeg --target-os=mingw32 --arch=x86_64 \
  --cross-prefix=x86_64-w64-mingw32- --enable-cross-compile \
  --disable-autodetect --disable-gpl --disable-nonfree --disable-version3 \
  --enable-shared --disable-static --disable-debug --disable-doc --disable-ffplay \
  --disable-network --disable-devices --disable-encoders \
  --enable-encoder=pcm_s16le,pcm_f32le,srt,subrip,webvtt \
  --disable-muxers --enable-muxer=wav,pcm_f32le,srt,webvtt \
  --disable-protocols --enable-protocol=file,pipe \
  --disable-filters --enable-filter=aresample,aformat,anull \
  --extra-ldflags=-static-libgcc --extra-version=gourdy-912208af28
make -j"${JOBS:-6}"
make install DESTDIR="$prefix"
