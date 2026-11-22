#!/bin/bash
# Compila y empaqueta "Hymns STT.app" (dist/). Con --install lo copia a /Applications.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2)
cargo build --release

APP="dist/Hymns STT.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp target/release/hymns-stt "$APP/Contents/MacOS/hymns-stt"
cp packaging/icons/icon.icns "$APP/Contents/Resources/icon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Hymns STT</string>
  <key>CFBundleDisplayName</key><string>Hymns STT</string>
  <key>CFBundleIdentifier</key><string>app.hymns.stt</string>
  <key>CFBundleExecutable</key><string>hymns-stt</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep -s - "$APP"   # firma ad-hoc (uso local)
echo "Listo: $APP"

if [ "${1:-}" = "--install" ]; then
  pkill -x hymns-stt 2>/dev/null || true
  sleep 1
  rm -rf "/Applications/Hymns STT.app"
  cp -R "$APP" /Applications/
  echo "Instalado en /Applications/Hymns STT.app"
fi
