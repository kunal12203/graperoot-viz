---
name: graperoot-viz
description: Launch, build, or release GrapeRoot Viz desktop app. Works on macOS, Windows, and Linux.
triggers:
  - /graperoot-viz
---

GrapeRoot Viz has three modes. Detect the current OS and use the correct commands.

| Command | What it does |
|---|---|
| `/graperoot-viz` | Launch the 3D viewer for this session's workspace |
| `/graperoot-viz build` | Build installer for current platform |
| `/graperoot-viz release v1.x.x` | Bump version, tag, push → GitHub Actions builds all platforms |

---

## Mode 1 — Launch viewer (no args)

**Detect OS first**, then run the appropriate block.

### macOS / Linux
```bash
#!/usr/bin/env bash
WORKSPACE_PATH="${GRAPEROOT_WORKSPACE:-}"

# Search common workspace locations
if [ -z "$WORKSPACE_PATH" ] && [ -d "$(pwd)/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$(pwd)/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi
if [ -z "$WORKSPACE_PATH" ] && [ -d "$HOME/.graperoot/workspaces" ]; then
  WORKSPACE_PATH=$(ls -td "$HOME/.graperoot/workspaces"/*/ 2>/dev/null | head -1 || true)
fi

# Find the app
APP=""
[ -d "/Applications/GrapeRoot Viz.app" ] && APP="/Applications/GrapeRoot Viz.app"

if [ -z "$APP" ]; then
  echo "⚠  GrapeRoot Viz not installed. Download at: https://graperoot.dev/viz"
  exit 1
fi

if [ -n "$WORKSPACE_PATH" ]; then
  echo "▶ Workspace: $WORKSPACE_PATH"
  GRAPEROOT_WORKSPACE="$WORKSPACE_PATH" open "$APP"
else
  echo "▶ No workspace found — app will show a folder picker"
  open "$APP"
fi
echo "✓ GrapeRoot Viz launched"
```

### Windows (PowerShell)
```powershell
$workspace = $env:GRAPEROOT_WORKSPACE

# Search common workspace locations
if (-not $workspace) {
  $local = Join-Path (Get-Location) ".graperoot\workspaces"
  if (Test-Path $local) {
    $workspace = Get-ChildItem $local -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $workspace) {
  $global = Join-Path $env:USERPROFILE ".graperoot\workspaces"
  if (Test-Path $global) {
    $workspace = Get-ChildItem $global -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
}

# Find the installed EXE
$exe = "$env:LOCALAPPDATA\Programs\GrapeRoot Viz\GrapeRoot Viz.exe"
if (-not (Test-Path $exe)) {
  $exe = "$env:ProgramFiles\GrapeRoot Viz\GrapeRoot Viz.exe"
}
if (-not (Test-Path $exe)) {
  Write-Host "⚠  GrapeRoot Viz not installed. Download at: https://graperoot.dev/viz"
  exit 1
}

if ($workspace) {
  Write-Host "▶ Workspace: $workspace"
  $env:GRAPEROOT_WORKSPACE = $workspace
  Start-Process $exe
} else {
  Write-Host "▶ No workspace found — app will show a folder picker"
  Start-Process $exe
}
Write-Host "✓ GrapeRoot Viz launched"
```

---

## Mode 2 — Build (`/graperoot-viz build`)

### macOS / Linux
```bash
#!/usr/bin/env bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
"$REPO_ROOT/scripts/build-electron.sh" mac
```

### Windows (PowerShell)
```powershell
$repo = git rev-parse --show-toplevel
cd $repo/electron
npm run build:win
```

---

## Mode 3 — Release (`/graperoot-viz release v1.2.3`)

Works the same on all platforms — uses git which is cross-platform.

```bash
#!/usr/bin/env bash
VERSION="${1:-}"
[ -z "$VERSION" ] && echo "Usage: /graperoot-viz release v1.2.3" && exit 1
PKG_VERSION="${VERSION#v}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

node -e "
  const fs=require('fs');
  const p=JSON.parse(fs.readFileSync('$REPO_ROOT/electron/package.json','utf8'));
  p.version='$PKG_VERSION';
  fs.writeFileSync('$REPO_ROOT/electron/package.json',JSON.stringify(p,null,2)+'\n');
  console.log('Bumped to',p.version);
"
cd "$REPO_ROOT"
git add electron/package.json
git commit -m "chore: release $VERSION"
git tag "$VERSION"
git push && git push --tags

REPO_URL=$(git remote get-url origin | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
echo "✅ Tagged $VERSION — GitHub Actions building DMG + EXE + AppImage"
echo "   $REPO_URL/actions"
```
