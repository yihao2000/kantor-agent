#!/bin/bash
# Kantor Agent for cloud sessions. Put this in the cloud environment's setup script:
#   curl -fsSL https://raw.githubusercontent.com/yihao2000/kantor-agent/main/cloud/setup.sh | bash -s 'https://<val>.val.run/?key=<kunci>'
# It installs the reporter, saves the relay address, and adds hooks to
# ~/.claude/settings.json, so every cloud session in this environment shows up
# in the office. The address can also come from KANTOR_RELAY instead.
set -e
DIR="$HOME/.claude/kantor-agent"
mkdir -p "$DIR"
curl -fsSL https://raw.githubusercontent.com/yihao2000/kantor-agent/main/cloud/report.py -o "$DIR/report.py"
chmod +x "$DIR/report.py"
if [ -n "$1" ]; then
  printf '%s\n' "$1" > "$DIR/relay.txt"
  chmod 600 "$DIR/relay.txt"
fi

python3 - "$HOME/.claude/settings.json" "$DIR/report.py" <<'PY'
import json, os, sys
path, script = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        settings = json.load(f)
except Exception:
    settings = {}
hooks = settings.setdefault("hooks", {})
cmd = {"type": "command", "command": f"python3 {script}", "timeout": 5}
for event in ["SessionStart", "UserPromptSubmit", "PreToolUse", "SubagentStart", "SubagentStop", "Stop", "SessionEnd"]:
    groups = hooks.setdefault(event, [])
    if any(h.get("command") == cmd["command"] for g in groups for h in g.get("hooks", [])):
        continue
    group = {"hooks": [cmd]}
    if event == "PreToolUse":
        group["matcher"] = "*"
    groups.append(group)
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
print("Kantor Agent: pelapor sesi cloud terpasang")
PY
