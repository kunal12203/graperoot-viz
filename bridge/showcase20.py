"""20-step showcase — every animation type, paced for inspection.

Picks 4 different hub anchors so the camera tours different parts of the
graph. Each step prints a numbered caption so you can sync terminal ↔ viewer.
"""
from __future__ import annotations

import json, random, time, urllib.request

BRIDGE = "http://127.0.0.1:8765"
random.seed(7)


def post(tool, paths, *, detail=None):
    body = json.dumps({
        "tool": tool, "phase": "post", "paths": paths,
        "detail": detail, "ts": time.time(),
    }).encode()
    req = urllib.request.Request(
        f"{BRIDGE}/event", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    urllib.request.urlopen(req, timeout=1).read()


def step(i, tool, paths, *, pause=3.0, detail=None, caption=""):
    icon = {"Read": "👁", "Edit": "🔨", "Write": "✨", "Grep": "🔍",
            "Bash": "⚡", "WebFetch": "🌍", "Task": "🤖"}.get(tool, "•")
    post(tool, paths, detail=detail)
    print(f"  [{i:02d}/20]  {icon}  {tool:<9} {caption}", flush=True)
    time.sleep(pause)


def main():
    g = json.load(urllib.request.urlopen(f"{BRIDGE}/graph"))
    nodes = g["nodes"]
    adj = {}
    for l in g["links"]:
        s = l["source"] if isinstance(l["source"], str) else l["source"]["id"]
        t = l["target"] if isinstance(l["target"], str) else l["target"]["id"]
        adj.setdefault(s, set()).add(t)
        adj.setdefault(t, set()).add(s)

    # Pick 4 distinct hubs to tour different regions of the graph.
    by_deg = sorted(nodes, key=lambda n: n.get("degree", 0), reverse=True)
    hubs = [by_deg[0]["id"], by_deg[5]["id"], by_deg[15]["id"], by_deg[40]["id"]]

    print(f"\nSHOWCASE — 20 steps across 4 regions\n", flush=True)
    time.sleep(1.5)

    i = 0
    for region_idx, anchor in enumerate(hubs):
        cluster = list(adj.get(anchor, []))[:8]
        while len(cluster) < 5:
            cluster.append(by_deg[10 + len(cluster)]["id"])

        print(f"\n— region {region_idx + 1}/4 — {anchor[-50:]}", flush=True)

        i += 1; step(i, "Read", [anchor], pause=3.0, caption=f"hub: {anchor[-44:]}")

        i += 1; step(i, "Read", [f"{cluster[0]}::handleSubmit"], pause=3.5,
                     caption=f"symbol: ::handleSubmit (camera flies in)")

        i += 1; step(i, "Grep", cluster[:6], pause=3.5,
                     detail=f"pattern: {anchor.split('/')[-1].split('.')[0]}",
                     caption=f"6-file Grep wave")

        i += 1
        if region_idx % 2 == 0:
            step(i, "Edit", [f"{cluster[1]}::onChange"], pause=4.0,
                 detail="apply fix", caption=f"hammer + 5-ring shockwave")
        else:
            step(i, "Write",
                 [cluster[2].rsplit(".", 1)[0] + ".test." + cluster[2].rsplit(".", 1)[-1]],
                 pause=4.0, detail="new test file",
                 caption=f"sparkle + 18-spark burst")

        i += 1
        bash_or_fetch = ["Bash", "WebFetch", "Task"][region_idx % 3]
        if bash_or_fetch == "Bash":
            step(i, "Bash", [], pause=2.5, detail="npm test --silent", caption="green packet")
        elif bash_or_fetch == "WebFetch":
            step(i, "WebFetch", [], pause=2.5, detail="https://docs.example.com", caption="cyan packet")
        else:
            step(i, "Task", [cluster[3]], pause=3.0, detail="subagent: code-reviewer",
                 caption="purple bidirectional")

    print("\n— end of 20-step showcase —", flush=True)


if __name__ == "__main__":
    main()
