#!/usr/bin/env bash
# Build GrapeRoot Viz — DMG (macOS) or EXE (Windows)
# Usage:
#   ./scripts/build-electron.sh          # build for current platform
#   ./scripts/build-electron.sh mac      # macOS DMG + zip (universal)
#   ./scripts/build-electron.sh win      # Windows NSIS installer (needs Wine on macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${1:-$(uname -s | tr '[:upper:]' '[:lower:]')}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║          GrapeRoot Viz — Electron build              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build the enterprise viewer ──────────────────────────────────────
echo "▶ 1/3  Building enterprise viewer (Vite + TypeScript)…"
cd "$ROOT/enterprise/viewer"
npm install --silent
npm run build
echo "    ✓ Viewer built → enterprise/viewer/dist/"
echo ""

# ── Step 2: Bundle the Python bridge server ───────────────────────────────────
echo "▶ 2/3  Bundling Python bridge (PyInstaller)…"
cd "$ROOT/enterprise/bridge"

# Ensure PyInstaller and dependencies are present
if ! python3 -m pyinstaller --version &>/dev/null 2>&1; then
  echo "    Installing PyInstaller…"
  pip3 install pyinstaller --quiet
fi

if ! python3 -c "import fastapi, uvicorn" &>/dev/null 2>&1; then
  echo "    Installing bridge dependencies…"
  pip3 install -r requirements.txt --quiet
fi

python3 -m PyInstaller --clean --noconfirm graperoot-server.spec
echo "    ✓ Bridge binary → enterprise/bridge/dist/server"
echo ""

# ── Step 3: Package with electron-builder ────────────────────────────────────
echo "▶ 3/3  Packaging with electron-builder…"
cd "$ROOT/electron"
npm install --silent

case "$PLATFORM" in
  mac|darwin)
    npx electron-builder --mac --config electron-builder.yml
    echo ""
    echo "✅  DMG ready in: dist-electron/"
    ;;
  win|windows_nt)
    npx electron-builder --win --config electron-builder.yml
    echo ""
    echo "✅  EXE installer ready in: dist-electron/"
    ;;
  *)
    npx electron-builder --config electron-builder.yml
    echo ""
    echo "✅  Build complete → dist-electron/"
    ;;
esac

echo ""
ls -lh "$ROOT/dist-electron/"*.{dmg,exe,zip} 2>/dev/null || true
