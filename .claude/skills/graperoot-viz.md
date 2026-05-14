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

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(pwd)"
WORKSPACE_PATH="${GRAPEROOT_WORKSPACE:-}"

# Search common workspace locations
if [ -z "$WORKSPACE_PATH" ] && [ -d "$PROJECT_ROOT/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$PROJECT_ROOT/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi
if [ -z "$WORKSPACE_PATH" ] && [ -d "$HOME/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$HOME/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi

if [ -z "$WORKSPACE_PATH" ]; then
  echo "⚠  No GrapeRoot workspace found."
  echo "   Run the GrapeRoot analyzer first, or set GRAPEROOT_WORKSPACE=/path/to/workspace"
  exit 1
fi

echo "▶ Workspace: $WORKSPACE_PATH"

# Packaged app (installed)
if [ -d "/Applications/GrapeRoot Viz.app" ]; then
  GRAPEROOT_WORKSPACE="$WORKSPACE_PATH" open "/Applications/GrapeRoot Viz.app"
  echo "✓ GrapeRoot Viz launched"
  exit 0
fi

# Built app in dist-electron
REPO_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" && pwd)"
BUILT_APP=$(find "$REPO_ROOT/dist-electron" -name "GrapeRoot Viz.app" -maxdepth 3 2>/dev/null | head -1 || true)
if [ -n "$BUILT_APP" ]; then
  GRAPEROOT_WORKSPACE="$WORKSPACE_PATH" open "$BUILT_APP"
  echo "✓ GrapeRoot Viz launched (from dist-electron)"
  exit 0
fi

# Dev mode fallback
echo "▶ App not built — starting in dev mode (no workspace UI, opens browser)…"
GRAPEROOT_WORKSPACE="$WORKSPACE_PATH" \
  cd "$REPO_ROOT/electron" && npx electron . --workspace "$WORKSPACE_PATH" &
echo "✓ GrapeRoot Viz starting in dev mode"
```

---

## Mode 2 — Build DMG locally (`/graperoot-viz build`)

Builds the macOS DMG right now on this machine. Takes ~3-5 minutes.

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
echo "▶ Building GrapeRoot Viz for macOS…"
"$REPO_ROOT/scripts/build-electron.sh" mac
echo ""
echo "✅ Done! Open dist-electron/ to find your DMG."
open "$REPO_ROOT/dist-electron/" 2>/dev/null || true
```

---

## Mode 3 — Release (`/graperoot-viz release v1.2.3`)

Bumps the version in `electron/package.json`, commits, tags, and pushes.
GitHub Actions automatically builds **both the DMG and the Windows EXE** and
uploads them to GitHub Releases. Takes ~10 minutes in CI.

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: /graperoot-viz release v1.2.3"
  exit 1
fi
# Strip leading 'v' for package.json
PKG_VERSION="${VERSION#v}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
PKG="$REPO_ROOT/electron/package.json"

# Bump version in package.json
if command -v node &>/dev/null; then
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
    p.version = '$PKG_VERSION';
    fs.writeFileSync('$PKG', JSON.stringify(p, null, 2) + '\n');
    console.log('Bumped to', p.version);
  "
else
  echo "⚠  Node not found — update electron/package.json version manually to $PKG_VERSION"
fi

# Commit, tag, push
cd "$REPO_ROOT"
git add electron/package.json
git commit -m "chore: release $VERSION"
git tag "$VERSION"
git push && git push --tags

REPO_URL=$(git remote get-url origin | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
echo ""
echo "✅ Tagged $VERSION and pushed."
echo "   GitHub Actions is now building DMG + EXE:"
echo "   $REPO_URL/actions"
echo ""
echo "   When complete, files appear at:"
echo "   $REPO_URL/releases/tag/$VERSION"
```
