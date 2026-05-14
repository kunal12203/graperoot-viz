#!/usr/bin/env bash
# Install GrapeRoot-Viz hooks into a project's .claude/settings.json.
# Usage:  hooks/install.sh /path/to/project
set -euo pipefail

PROJECT="${1:-$PWD}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMIT="$SCRIPT_DIR/emit.py"
SETTINGS="$PROJECT/.claude/settings.json"

mkdir -p "$PROJECT/.claude"
chmod +x "$EMIT"

if [[ -f "$SETTINGS" ]]; then
  cp "$SETTINGS" "$SETTINGS.bak.$(date +%s)"
fi

python3 - "$SETTINGS" "$EMIT" <<'PY'
import json, sys, os
path, emit = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception:
        data = {}
hooks = data.setdefault("hooks", {})
for phase in ("PreToolUse", "PostToolUse"):
    arg = "pre" if phase == "PreToolUse" else "post"
    cmd = f"python3 {emit} {arg}"
    bucket = hooks.setdefault(phase, [])
    # Drop any prior graperoot-viz emitter, then re-add.
    bucket = [b for b in bucket if not any(
        h.get("command","").endswith("emit.py " + arg) for h in (b.get("hooks") or [])
    )]
    bucket.append({"matcher": "*", "hooks": [{"type": "command", "command": cmd}]})
    hooks[phase] = bucket
json.dump(data, open(path, "w"), indent=2)
print(f"updated {path}")
PY
