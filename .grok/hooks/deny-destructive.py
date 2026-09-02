#!/usr/bin/env python3
"""Block rm/delete of the local SQLite DB and AES master key."""
import json
import re
import sys

event = json.load(sys.stdin)
payload = json.dumps(event.get("toolInput") or {}, ensure_ascii=False)
cmd = ""
inp = event.get("toolInput") or {}
if isinstance(inp, dict):
    cmd = str(inp.get("command") or "")

danger = re.search(r"codespar\.db|master\.key", payload, re.I)
destructive = re.search(
    r"\b(rm|shred|unlink|trash)\b|\b(delete|unlink)\s*\(|os\.remove",
    payload,
    re.I,
)

if danger and (destructive or re.search(r"\brm\b", cmd)):
    json.dump(
        {
            "decision": "deny",
            "reason": "禁止删除 ~/.codespar/codespar.db 或 master.key。换库请改 CODESPAR_DB_PATH，不要删生产数据。",
        },
        sys.stdout,
    )
else:
    json.dump({"decision": "allow"}, sys.stdout)
print()
