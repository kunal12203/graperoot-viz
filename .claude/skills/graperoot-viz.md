---
name: graperoot-viz
description: Launch, build, or release GrapeRoot Viz. Supports /graperoot-viz, /graperoot-viz build, /graperoot-viz release v1.x.x
triggers:
  - /graperoot-viz
---

GrapeRoot Viz has three modes depending on arguments passed:

| Command | What it does |
|---|---|
| `/graperoot-viz` | Launch the 3D viewer for this session's workspace |
| `/graperoot-viz build` | Build DMG (macOS) locally right now |
| `/graperoot-viz release v1.2.3` | Bump version, tag, push → GitHub Actions builds DMG + EXE |

---

## Mode 1 — Launch viewer (no args)

Find the current project's GrapeRoot workspace and open the desktop app.
If no workspace is found automatically, open the app anyway — it will show
a native folder picker so the user can select their workspace manually.

```bash
#!/usr/bin/env bash
PROJECT_ROOT="$(pwd)"
WORKSPACE_PATH="${GRAPEROOT_WORKSPACE:-}"

# 1. Project-local workspace
if [ -z "$WORKSPACE_PATH" ] && [ -d "$PROJECT_ROOT/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$PROJECT_ROOT/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi

# 2. User-global workspace
if [ -z "$WORKSPACE_PATH" ] && [ -d "$HOME/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$HOME/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi

# Locate the app
APP=""
if [ -d "/Applications/GrapeRoot Viz.app" ]; then
  APP="/Applications/GrapeRoot Viz.app"
else
  REPO_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" && pwd)"
  APP=$(find "$REPO_ROOT/dist-electron" -name "GrapeRoot Viz.app" -maxdepth 3 2>/dev/null | head -1 || true)
fi

if [ -z "$APP" ]; then
  echo "⚠  GrapeRoot Viz is not installed."
  echo "   Download it at: https://graperoot.dev/viz"
  echo "   Or build it:    /graperoot-viz build"
  exit 1
fi

if [ -n "$WORKSPACE_PATH" ]; then
  echo "▶ Workspace: $WORKSPACE_PATH"
  GRAPEROOT_WORKSPACE="$WORKSPACE_PATH" open "$APP"
else
  echo "▶ No workspace found — opening app (native folder picker will appear)"
  open "$APP"
fi

echo "✓ GrapeRoot Viz launched"
```

---

## Mode 2 — Build DMG locally (`/graperoot-viz build`)

Builds the macOS DMG on this machine. Takes ~3-5 minutes.

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
echo "▶ Building GrapeRoot Viz for macOS…"
"$REPO_ROOT/scripts/build-electron.sh" mac
echo "✅ Done! Open dist-electron/ to find your DMG."
open "$REPO_ROOT/dist-electron/" 2>/dev/null || true
```

---

## Mode 3 — Release (`/graperoot-viz release v1.2.3`)

Bumps version, tags, pushes → GitHub Actions builds DMG + EXE + AppImage.

```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: /graperoot-viz release v1.2.3"
  exit 1
fi
PKG_VERSION="${VERSION#v}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PKG="$REPO_ROOT/electron/package.json"

node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$PKG','utf8'));
  p.version = '$PKG_VERSION';
  fs.writeFileSync('$PKG', JSON.stringify(p, null, 2) + '\n');
  console.log('Bumped to', p.version);
"

cd "$REPO_ROOT"
git add electron/package.json
git commit -m "chore: release $VERSION"
git tag "$VERSION"
git push && git push --tags

REPO_URL=$(git remote get-url origin | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
echo ""
echo "✅ Tagged $VERSION and pushed."
echo "   GitHub Actions building DMG + EXE + AppImage:"
echo "   $REPO_URL/actions"
echo "   Releases: $REPO_URL/releases/tag/$VERSION"
```
