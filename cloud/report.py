#!/usr/bin/env python3
"""Kantor Agent reporter for sessions where the plugin can't run (cloud sessions).

Claude Code calls this from its hooks with the event as JSON on stdin. It keeps a
small state file per session and posts the session's workers to the relay named
by KANTOR_RELAY (or ~/.claude/kantor-agent/relay.txt). It never blocks Claude:
the post happens in a detached child, and any error is ignored.
"""
import json
import os
import re
import sys
import time
import urllib.request

HOME = os.path.expanduser("~")
CONF = os.path.join(HOME, ".claude", "kantor-agent", "relay.txt")
IDLE_FORGET_S = 5 * 60


PLUGIN_CONF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "relay.txt")


def relay_url():
    url = os.environ.get("KANTOR_RELAY", "").strip()
    for path in (CONF, PLUGIN_CONF):
        if not url and os.path.exists(path):
            with open(path) as f:
                url = f.read().strip()
    return url


def clean(text, n=60):
    text = re.sub(r"<([a-z][\w-]*)[^>]*>[\s\S]*?</\1>", " ", text or "", flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def nice_type(t):
    t = (t or "agent").split(":")[-1]
    if t == "general-purpose":
        return "Umum"
    t = re.sub(r"[-_]+", " ", t).strip()
    return (t[:1].upper() + t[1:])[:12] or "Agent"


def tool_label(name, inp):
    name = name or "Tool"
    short = ":".join(name.split("__")[1:]) if name.startswith("mcp__") else name
    inp = inp if isinstance(inp, dict) else {}
    detail = ""
    if isinstance(inp.get("file_path"), str):
        detail = inp["file_path"].rsplit("/", 1)[-1]
    elif isinstance(inp.get("command"), str):
        detail = " ".join(inp["command"].split()[:2])
    else:
        for k in ("query", "pattern", "url", "description"):
            if isinstance(inp.get(k), str):
                detail = re.sub(r"^https?://", "", inp[k])
                break
    s = f"{short}: {detail}" if detail else short
    return s if len(s) <= 40 else s[:39] + "…"


def main():
    # Where the Kantor Agent mod runs (Claude Code), it reports by itself.
    if os.environ.get("KANTOR_MOD") == "1":
        return
    url = relay_url()
    if not url:
        return
    try:
        e = json.load(sys.stdin)
    except Exception:
        return
    sid = re.sub(r"[^\w-]", "", str(e.get("session_id", "")))[:80]
    if not sid:
        return
    path = f"/tmp/kantor-agent-{sid}.json"
    try:
        with open(path) as f:
            st = json.load(f)
    except Exception:
        cwd = (e.get("cwd") or "").rstrip("/")
        base = cwd.rsplit("/", 1)[-1] if cwd else ""
        st = {"label": ("Cloud · " + base) if base else "Cloud", "agents": {}}
    agents = st["agents"]
    now = time.time()

    def agent(aid, name):
        a = agents.setdefault(aid, {"id": aid, "name": name, "status": "idle", "task": "", "tool": "", "t": now})
        a["t"] = now
        return a

    ev = e.get("hook_event_name")
    main_a = agent("main", "Claude")
    aid = e.get("agent_id")
    gone = False
    if ev == "UserPromptSubmit":
        main_a.update(status="working", task=clean(e.get("prompt", "")) or "Kerja", tool="")
    elif ev == "PreToolUse":
        a = agent(aid, nice_type(e.get("agent_type"))) if aid else main_a
        a.update(status="working", tool=tool_label(e.get("tool_name"), e.get("tool_input")))
        if not a["task"]:
            a["task"] = a["name"]
    elif ev == "SubagentStart" and aid:
        a = agent(aid, nice_type(e.get("agent_type")))
        a.update(status="working", task=a["task"] or a["name"])
    elif ev == "SubagentStop" and aid:
        agent(aid, nice_type(e.get("agent_type"))).update(status="idle", tool="")
    elif ev in ("Stop", "StopFailure"):
        main_a.update(status="idle", tool="")
    elif ev == "SessionEnd":
        gone = True

    for k in list(agents):
        a = agents[k]
        if k != "main" and a["status"] == "idle" and now - a["t"] > IDLE_FORGET_S:
            del agents[k]
    try:
        with open(path, "w") as f:
            json.dump(st, f)
    except Exception:
        pass

    body = {"sid": sid, "label": st["label"], "from": "cloud", "gone": gone,
            "agents": [{k: a[k] for k in ("id", "name", "status", "task", "tool")} for a in agents.values()]}
    # Post from a detached child so Claude never waits on the network.
    if os.fork() != 0:
        return
    try:
        os.setsid()
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                     headers={"content-type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass
    os._exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
