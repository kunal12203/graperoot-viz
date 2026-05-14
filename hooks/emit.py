#!/usr/bin/env python3
"""Claude Code hook → GrapeRoot-Viz bridge emitter.

Claude Code invokes hook commands with a JSON payload on stdin. This script
extracts the tool name and any file paths it touched, then POSTs them to the
bridge's /event endpoint. The bridge re-broadcasts to the 3D viewer.

Failures are silent — we never want a hook to break the user's session.

Usage in `.claude/settings.json`:
  {
    "hooks": {
      "PreToolUse":  [{"matcher": "*", "hooks": [
        {"type": "command", "command": "python3 /abs/path/to/hooks/emit.py pre"}
      ]}],
      "PostToolUse": [{"matcher": "*", "hooks": [
        {"type": "command", "command": "python3 /abs/path/to/hooks/emit.py post"}
      ]}]
    }
  }
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BRIDGE_URL = os.environ.get("GRAPEROOT_VIZ_URL", "http://127.0.0.1:8765")
TIMEOUT = 0.4  # seconds — never block the session


def extract_paths(tool: str, tool_input: dict) -> list[str]:
    """Best-effort path extraction across the common tool shapes."""
    paths: list[str] = []
    for key in ("file_path", "path", "notebook_path"):
        v = tool_input.get(key)
        if isinstance(v, str):
            paths.append(v)
    # Grep / Glob: a search root or pattern hint
    if tool in ("Grep", "Glob"):
        v = tool_input.get("path") or tool_input.get("pattern")
        if isinstance(v, str) and v not in paths:
            paths.append(v)
    return paths


def main() -> None:
    phase = sys.argv[1] if len(sys.argv) > 1 else "post"
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool = payload.get("tool_name") or payload.get("tool") or "?"
    tool_input = payload.get("tool_input") or {}
    paths = extract_paths(tool, tool_input if isinstance(tool_input, dict) else {})

    detail = None
    if tool == "Bash":
        cmd = (tool_input or {}).get("command") if isinstance(tool_input, dict) else None
        if isinstance(cmd, str):
            detail = cmd[:120]

    body = json.dumps({
        "tool": tool,
        "phase": phase,
        "paths": paths,
        "detail": detail,
        "ts": time.time(),
    }).encode()

    req = urllib.request.Request(
        f"{BRIDGE_URL}/event",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=TIMEOUT).read()
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        pass  # bridge not running — that's fine


if __name__ == "__main__":
    main()
