#!/usr/bin/env sh
# GrapeRoot Viz — one-line installer
# Usage: curl -fsSL graperoot.dev/viz/install.sh | sh
#
# Supports: macOS (Intel + Apple Silicon), Linux (x64 AppImage + .deb)
# Windows: download the .exe from https://graperoot.dev/viz

set -eu

REPO="kunal12203/graperoot-viz"
RELEASES="https://github.com/$REPO/releases"
API="https://api.github.com/repos/$REPO/releases/latest"
APP_NAME="GrapeRoot Viz"

# ── Helpers ──────────────────────────────────────────────────────────────────

print_header() {
  printf '\n\033[1;34m  🍇 GrapeRoot Viz Installer\033[0m\n'
  printf '\033[90m  %s\033[0m\n\n' "$RELEASES"
}

info()    { printf '\033[0;34m▶\033[0m %s\n' "$1"; }
success() { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
warn()    { printf '\033[0;33m⚠\033[0m %s\n' "$1"; }
error()   { printf '\033[0;31m✗\033[0m %s\n' "$1"; exit 1; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1. Please install it and try again."
  fi
}

# ── Fetch latest release version ─────────────────────────────────────────────

get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$API" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$API" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
  else
    error "curl or wget is required."
  fi
}

download() {
  url="$1"; dest="$2"
  info "Downloading $(basename "$dest")…"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --progress-bar "$url" -o "$dest"
  else
    wget -q --show-progress "$url" -O "$dest"
  fi
}

# ── Platform detection ────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)  PLATFORM="mac" ;;
  Linux)   PLATFORM="linux" ;;
  *)
    warn "Unsupported OS: $OS"
    printf '\nPlease download manually from:\n  %s/latest\n\n' "$RELEASES"
    exit 1
    ;;
esac

# ── Main ──────────────────────────────────────────────────────────────────────

print_header

info "Detecting latest release…"
VERSION="$(get_latest_version)"
if [ -z "$VERSION" ]; then
  error "Could not fetch latest release from GitHub. Check your internet connection."
fi
info "Latest version: $VERSION"

case "$PLATFORM" in

  # ── macOS ──────────────────────────────────────────────────────────────────
  mac)
    DMG_NAME="${APP_NAME}-${VERSION}.dmg"
    DMG_URL="$RELEASES/download/$VERSION/$DMG_NAME"
    TMP_DMG="/tmp/graperoot-viz-$VERSION.dmg"

    download "$DMG_URL" "$TMP_DMG"

    info "Mounting DMG…"
    MOUNT_POINT="$(hdiutil attach -nobrowse -quiet "$TMP_DMG" | awk 'END{print $NF}')"

    info "Copying to /Applications…"
    # Remove old version if present
    if [ -d "/Applications/$APP_NAME.app" ]; then
      rm -rf "/Applications/$APP_NAME.app"
    fi
    cp -R "$MOUNT_POINT/$APP_NAME.app" "/Applications/"

    info "Removing quarantine flag…"
    xattr -dr com.apple.quarantine "/Applications/$APP_NAME.app" 2>/dev/null || true

    hdiutil detach -quiet "$MOUNT_POINT" || true
    rm -f "$TMP_DMG"

    success "$APP_NAME installed to /Applications/"
    printf '\n  \033[0;90mLaunch it:\033[0m open "/Applications/%s.app"\n\n' "$APP_NAME"
    ;;

  # ── Linux ──────────────────────────────────────────────────────────────────
  linux)
    need_cmd "chmod"

    # Prefer .deb if dpkg is available, else AppImage
    if command -v dpkg >/dev/null 2>&1; then
      DEB_NAME="graperoot-viz_${VERSION#v}_amd64.deb"
      DEB_URL="$RELEASES/download/$VERSION/$DEB_NAME"
      TMP_DEB="/tmp/graperoot-viz-$VERSION.deb"

      download "$DEB_URL" "$TMP_DEB"

      info "Installing .deb package (may require sudo)…"
      if command -v sudo >/dev/null 2>&1; then
        sudo dpkg -i "$TMP_DEB"
      else
        dpkg -i "$TMP_DEB"
      fi
      rm -f "$TMP_DEB"
      success "$APP_NAME installed via dpkg"
      printf '\n  \033[0;90mLaunch it:\033[0m graperoot-viz\n\n'

    else
      # AppImage fallback
      APPIMAGE_NAME="GrapeRoot-Viz-${VERSION}.AppImage"
      APPIMAGE_URL="$RELEASES/download/$VERSION/$APPIMAGE_NAME"
      INSTALL_DIR="$HOME/.local/bin"
      DEST="$INSTALL_DIR/graperoot-viz"

      mkdir -p "$INSTALL_DIR"
      download "$APPIMAGE_URL" "$DEST"
      chmod +x "$DEST"

      # Add to PATH hint if needed
      case ":$PATH:" in
        *":$INSTALL_DIR:"*) ;;
        *)
          warn "$INSTALL_DIR is not in your PATH."
          printf '  Add this to your ~/.bashrc or ~/.zshrc:\n'
          printf '  \033[0;34mexport PATH="$HOME/.local/bin:$PATH"\033[0m\n\n'
          ;;
      esac

      success "$APP_NAME installed to $DEST"
      printf '\n  \033[0;90mLaunch it:\033[0m graperoot-viz\n\n'
    fi
    ;;
esac
