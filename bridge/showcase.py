"""Curated showcase — fires every animation type once with breathing room.

Picks a real hub file from the live graph, then walks the user through:
  1. Read at file level         (👁 blue ring, packet node→Claude)
  2. Read at symbol level       (camera fly-in + ::Symbol label)
  3. Grep wave                  (6 amber rings simultaneously)
  4. Edit                       (🔨 swinging hammer, camera focus, packet Claude→node)
  5. Write                      (✨ sparkle on a "new" file)
  6. Bash                       (⚡ green flash from Claude)
  7. WebFetch                   (🌍 cyan packet from Claude)
  8. Task / subagent            (🤖 purple bidirectional)

Each step prints a 1-line caption so you can match terminal to viewer.
"""
from __future__ import annotations

import json, time, urllib.request

BRIDGE = "http://127.0.0.1:8765"


def post(tool, paths, *, detail=None, pause=3.0, caption=""):
    body = json.dumps({
        "tool": tool, "phase": "post", "paths": paths,
        "detail": detail, "ts": time.time(),
    }).encode()
    req = urllib.request.Request(
        f"{BRIDGE}/event", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    urllib.request.urlopen(req, timeout=1).read()
    icon = {"Read": "👁", "Edit": "🔨", "Write": "✨", "Grep": "🔍",
            "Bash": "⚡", "WebFetch": "🌍", "Task": "🤖"}.get(tool, "•")
    print(f"  {icon}  {tool:<9} {caption}", flush=True)
    time.sleep(pause)


def main():
    g = json.load(urllib.request.urlopen(f"{BRIDGE}/graph"))
    nodes = g["nodes"]
    # pick the busiest hub for visual impact
    hub = max(nodes, key=lambda n: n.get("degree", 0))["id"]
    # find a few neighbours via the link list for the Grep wave + Read trail
    adj = {}
    for l in g["links"]:
        s = l["source"] if isinstance(l["source"], str) else l["source"]["id"]
        t = l["target"] if isinstance(l["target"], str) else l["target"]["id"]
        adj.setdefault(s, set()).add(t)
        adj.setdefault(t, set()).add(s)
    cluster = list(adj.get(hub, []))[:8] or [hub]
    while len(cluster) < 6:
        cluster.append(cluster[0])

    print(f"\nSHOWCASE — anchor: {hub}\n", flush=True)
    print("(open http://localhost:5174 if it isn't already)\n", flush=True)
    time.sleep(2.0)

    print("STEP 1: Claude reads a file", flush=True)
    post("Read", [hub], pause=4.0,
         caption=f"{hub[-50:]}")

    print("\nSTEP 2: Claude reads at symbol level (watch the camera fly in)", flush=True)
    post("Read", [f"{cluster[0]}::handleSubmit"], pause=4.5,
         caption=f"{cluster[0][-50:]}::handleSubmit")

    print("\nSTEP 3: Grep wave — six files pulse together", flush=True)
    post("Grep", cluster[:6], detail="pattern: useStore", pause=4.5,
         caption="6 matches lit up at once")

    print("\nSTEP 4: Edit — hammer swings, camera focuses", flush=True)
    post("Edit", [f"{cluster[1]}::onChange"], detail="apply fix", pause=5.0,
         caption=f"{cluster[1][-50:]}::onChange")

    print("\nSTEP 5: Write a new test file (sparkle)", flush=True)
    new_file = cluster[1].rsplit(".", 1)[0] + ".test." + cluster[1].rsplit(".", 1)[-1]
    post("Write", [new_file], detail="new test file", pause=4.5,
         caption=new_file[-50:])

    print("\nSTEP 6: Bash — green pulse from Claude", flush=True)
    post("Bash", [], detail="npm test --silent", pause=3.5, caption="npm test")

    print("\nSTEP 7: WebFetch — cyan packet from outside", flush=True)
    post("WebFetch", [], detail="https://docs.example.com", pause=3.5,
         caption="docs.example.com")

    print("\nSTEP 8: Task — subagent orb (bidirectional purple)", flush=True)
    post("Task", [cluster[2]], detail="subagent: code-reviewer", pause=4.5,
         caption=f"subagent on {cluster[2][-40:]}")

    print("\n— end of showcase —", flush=True)


if __name__ == "__main__":
    main()
