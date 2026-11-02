#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLANG_MODULE_CACHE_PATH="$ROOT/.build/ModuleCache"
swift build -c release --disable-sandbox
BUILT="$(swift build -c release --show-bin-path)"
cp "$BUILT/GWGLocalServer" bin/GWGLocalServer
mkdir -p dist/'GWG TV Member Space.app'/Contents/{MacOS,Resources}
APP="$ROOT/dist/GWG TV Member Space.app"
cp "$BUILT/GWGMemberSpace" "$APP/Contents/MacOS/GWGMemberSpace"
rsync -a --delete "$ROOT/www/" "$APP/Contents/Resources/www/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>GWG TV Member Space</string><key>CFBundleDisplayName</key><string>GWG TV Member Space</string><key>CFBundleIdentifier</key><string>tv.gwg.memberspace.local</string><key>CFBundleExecutable</key><string>GWGMemberSpace</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSPrincipalClass</key><string>NSApplication</string><key>NSHighResolutionCapable</key><true/><key>CFBundleIconFile</key><string>AppIcon</string><key>NSCameraUsageDescription</key><string>Scan equipment QR codes and barcodes.</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
if [ -f "$ROOT/bin/AppIcon.icns" ];then cp "$ROOT/bin/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns";fi
codesign --force --sign - "$ROOT/bin/GWGLocalServer"
codesign --force --deep --sign - "$APP"
echo "$APP"
