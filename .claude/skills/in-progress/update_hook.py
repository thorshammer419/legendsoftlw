#!/usr/bin/env python3
"""
Stop hook for the /in-progress skill.

Hook mode (no args): reads stdin JSON from Claude Code, checks for in-progress.md,
forks a background worker to do synthesis, exits immediately.

Worker mode (2 args): transcript_path in_progress_path — performs the synthesis
and rewrites the file.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_PATH = os.path.abspath(__file__)


def run_as_hook() -> None:
    # Recursion guard: the background worker calls `claude --print`, which
    # triggers this hook again. The worker inherits IN_PROGRESS_RUNNING=1,
    # so inner hook invocations exit immediately.
    if os.environ.get("IN_PROGRESS_RUNNING") == "1":
        sys.exit(0)

    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    in_progress_path = Path.cwd() / "in-progress.md"
    if not in_progress_path.exists():
        sys.exit(0)

    transcript_path = data.get("transcript_path", "")
    if not transcript_path or not Path(transcript_path).exists():
        sys.exit(0)

    env = os.environ.copy()
    env["IN_PROGRESS_RUNNING"] = "1"

    # Fork synthesis to background so the user is not blocked
    subprocess.Popen(
        ["python3", SCRIPT_PATH, transcript_path, str(in_progress_path)],
        env=env,
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    sys.exit(0)


def parse_transcript(transcript_path: str) -> list[dict]:
    exchanges = []
    try:
        with open(transcript_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    role = entry.get("role")
                    if role not in ("user", "assistant"):
                        continue
                    content = entry.get("message", {}).get("content", [])
                    if isinstance(content, str):
                        text = content
                    else:
                        text = " ".join(
                            c.get("text", "")
                            for c in content
                            if isinstance(c, dict) and c.get("type") == "text"
                        )
                    text = text.strip()
                    if text:
                        exchanges.append({"role": role, "text": text})
                except Exception:
                    continue
    except Exception:
        pass
    return exchanges


def run_as_worker(transcript_path: str, in_progress_path: str) -> None:
    exchanges = parse_transcript(transcript_path)
    if not exchanges:
        return

    # Build transcript text capped at ~30K chars (most recent exchanges first)
    lines = []
    total = 0
    for e in reversed(exchanges):
        label = "USER" if e["role"] == "user" else "CLAUDE"
        text = e["text"][:1200]
        entry = f"[{label}]: {text}"
        total += len(entry)
        if total > 30000:
            break
        lines.append(entry)
    lines.reverse()
    transcript_text = "\n\n".join(lines)

    existing = Path(in_progress_path).read_text()

    prompt = f"""You are maintaining a session context document called in-progress.md for a Claude Code session. Its purpose: a fresh Claude agent should be able to read this file and be fully oriented — no other context needed.

EXISTING DOCUMENT:
---
{existing}
---

FULL CONVERSATION TRANSCRIPT (most recent session):
---
{transcript_text}
---

Rewrite in-progress.md to reflect the current state of the session. Output ONLY the markdown document — no preamble, no explanation, no code fences.

Use this exact structure:

# In Progress

## Current Task
What is actively being worked on right now.

## Decisions Made
Key design and implementation choices locked in this session.

## Completed This Session
Work finished, in order.

## Pending / Next Steps
Remaining work, in priority order.

## Key Context
Constraints, relevant file paths, blockers, anything a fresh Claude needs to know to not step on a rake.

## Recent Exchanges
A compressed but COMPLETE log of every exchange. Every exchange must appear — none may be omitted. Format: "- [USER]: <intent> → [CLAUDE]: <response summary>"
"""

    try:
        result = subprocess.run(
            ["claude", "--print", prompt],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0 and result.stdout.strip():
            Path(in_progress_path).write_text(result.stdout.strip() + "\n")
    except Exception:
        pass  # Never corrupt the existing file on failure


if __name__ == "__main__":
    if len(sys.argv) == 1:
        run_as_hook()
    else:
        run_as_worker(sys.argv[1], sys.argv[2])
