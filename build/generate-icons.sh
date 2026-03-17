#!/usr/bin/env bash
# 从 devpilot-logo.png 生成各平台所需尺寸的图标
# 依赖: macOS 自带 sips、iconutil

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGO="${PROJECT_ROOT}/frontend/public/devpilot-logo.png"
BUILD="${PROJECT_ROOT}/build"
ICONSET="${BUILD}/AppIcon.iconset"

if [[ ! -f "$LOGO" ]]; then
  echo "Error: Logo not found: $LOGO"
  exit 1
fi

mkdir -p "$BUILD"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# 主图标：转为 PNG 并固定 1024x1024（Logo 可能实为 JPEG 或其它格式）
echo "Creating build/appicon.png (1024x1024)..."
sips -s format png -z 1024 1024 "$LOGO" --out "$BUILD/appicon.png"

# macOS .iconset 必须的 10 个文件（iconutil 要求）
echo "Creating macOS iconset..."
sips -z 16  16   "$BUILD/appicon.png" --out "$ICONSET/icon_16x16.png"
sips -z 32  32   "$BUILD/appicon.png" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32  32   "$BUILD/appicon.png" --out "$ICONSET/icon_32x32.png"
sips -z 64  64   "$BUILD/appicon.png" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128  "$BUILD/appicon.png" --out "$ICONSET/icon_128x128.png"
sips -z 256 256  "$BUILD/appicon.png" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256  "$BUILD/appicon.png" --out "$ICONSET/icon_256x256.png"
sips -z 512 512  "$BUILD/appicon.png" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512  "$BUILD/appicon.png" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$BUILD/appicon.png" --out "$ICONSET/icon_512x512@2x.png"

echo "Generating AppIcon.icns..."
if iconutil -c icns "$ICONSET" -o "$BUILD/AppIcon.icns" 2>/dev/null; then
  echo "  AppIcon.icns OK"
else
  echo "  (iconutil skipped; Wails uses build/appicon.png)"
fi
rm -rf "$ICONSET"

# 多尺寸 PNG 供 Windows/Linux 或其它用途
mkdir -p "$BUILD/icons"
for size in 16 32 48 64 128 256; do
  sips -z $size $size "$BUILD/appicon.png" --out "$BUILD/icons/icon_${size}.png"
done

echo "Done: build/appicon.png (1024), build/icons/ 16-256px"
