"""
Tests for update_hook.py — the Stop hook that maintains in-progress.md.

Behaviors tested through public functions only; no implementation details.
"""

import json
import sys
import os
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from update_hook import parse_transcript, run_as_hook, run_as_worker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_jsonl(entries: list[dict], path: Path) -> None:
    """Write a JSONL transcript file from a list of {role, text} dicts."""
    lines = []
    for e in entries:
        lines.append(json.dumps({
            "role": e["role"],
            "message": {
                "content": [{"type": "text", "text": e["text"]}]
            }
        }))
    path.write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# parse_transcript
# ---------------------------------------------------------------------------

class TestParseTranscript:
    def test_extracts_user_and_assistant_exchanges(self, tmp_path):
        f = tmp_path / "transcript.jsonl"
        make_jsonl([
            {"role": "user", "text": "Hello Claude"},
            {"role": "assistant", "text": "Hello! How can I help?"},
        ], f)

        result = parse_transcript(str(f))

        assert len(result) == 2
        assert result[0] == {"role": "user", "text": "Hello Claude"}
        assert result[1] == {"role": "assistant", "text": "Hello! How can I help?"}

    def test_skips_tool_use_entries(self, tmp_path):
        f = tmp_path / "transcript.jsonl"
        # A tool_use block has no text content — should be skipped entirely
        f.write_text(json.dumps({
            "role": "assistant",
            "message": {
                "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]
            }
        }) + "\n")

        result = parse_transcript(str(f))

        assert result == []

    def test_handles_malformed_lines_without_crashing(self, tmp_path):
        f = tmp_path / "transcript.jsonl"
        f.write_text(
            "not json at all\n"
            "\n"
            '{"role": "user", "message": {"content": [{"type": "text", "text": "good line"}]}}\n'
            "{broken\n"
        )

        result = parse_transcript(str(f))

        assert len(result) == 1
        assert result[0]["text"] == "good line"

    def test_returns_empty_list_for_missing_file(self):
        result = parse_transcript("/nonexistent/path/transcript.jsonl")
        assert result == []


# ---------------------------------------------------------------------------
# run_as_worker
# ---------------------------------------------------------------------------

class TestRunAsWorker:
    def test_writes_synthesized_content_when_claude_succeeds(self, tmp_path):
        transcript = tmp_path / "transcript.jsonl"
        make_jsonl([
            {"role": "user", "text": "implement the login page"},
            {"role": "assistant", "text": "Sure, I'll build the login page now."},
        ], transcript)

        in_progress = tmp_path / "in-progress.md"
        in_progress.write_text("# In Progress\n\n## Current Task\nOld content\n")

        synthesized = "# In Progress\n\n## Current Task\nImplement login page\n"

        with patch("update_hook.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout=synthesized)
            run_as_worker(str(transcript), str(in_progress))

        assert in_progress.read_text() == synthesized.strip() + "\n"

    def test_preserves_existing_file_when_claude_fails(self, tmp_path):
        transcript = tmp_path / "transcript.jsonl"
        make_jsonl([{"role": "user", "text": "do something"}], transcript)

        in_progress = tmp_path / "in-progress.md"
        original = "# In Progress\n\n## Current Task\nOriginal content\n"
        in_progress.write_text(original)

        with patch("update_hook.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stdout="")
            run_as_worker(str(transcript), str(in_progress))

        assert in_progress.read_text() == original

    def test_preserves_existing_file_when_claude_raises(self, tmp_path):
        transcript = tmp_path / "transcript.jsonl"
        make_jsonl([{"role": "user", "text": "do something"}], transcript)

        in_progress = tmp_path / "in-progress.md"
        original = "# In Progress\n\n## Current Task\nOriginal content\n"
        in_progress.write_text(original)

        with patch("update_hook.subprocess.run", side_effect=Exception("timeout")):
            run_as_worker(str(transcript), str(in_progress))

        assert in_progress.read_text() == original


# ---------------------------------------------------------------------------
# run_as_hook
# ---------------------------------------------------------------------------

class TestRunAsHook:
    def _run_hook(self, hook_input: str, monkeypatch, tmp_path):
        """Helper: run run_as_hook() with stdin set to hook_input JSON."""
        import io
        monkeypatch.chdir(tmp_path)
        monkeypatch.delenv("IN_PROGRESS_RUNNING", raising=False)
        with patch("sys.stdin", io.StringIO(hook_input)), \
             patch("update_hook.subprocess.Popen") as mock_popen:
            with pytest.raises(SystemExit) as exc:
                run_as_hook()
        return exc.value.code, mock_popen

    def test_forks_worker_when_file_exists_and_transcript_valid(self, tmp_path, monkeypatch):
        in_progress = tmp_path / "in-progress.md"
        in_progress.write_text("# In Progress\n")
        transcript = tmp_path / "transcript.jsonl"
        transcript.write_text('{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n')

        hook_input = json.dumps({"session_id": "abc", "transcript_path": str(transcript)})
        exit_code, mock_popen = self._run_hook(hook_input, monkeypatch, tmp_path)

        assert exit_code == 0
        mock_popen.assert_called_once()

    def test_does_not_fork_when_in_progress_file_absent(self, tmp_path, monkeypatch):
        transcript = tmp_path / "transcript.jsonl"
        transcript.write_text('{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n')

        hook_input = json.dumps({"session_id": "abc", "transcript_path": str(transcript)})
        exit_code, mock_popen = self._run_hook(hook_input, monkeypatch, tmp_path)

        assert exit_code == 0
        mock_popen.assert_not_called()

    def test_does_not_fork_when_recursion_guard_set(self, tmp_path, monkeypatch):
        in_progress = tmp_path / "in-progress.md"
        in_progress.write_text("# In Progress\n")
        transcript = tmp_path / "transcript.jsonl"
        transcript.write_text('{"role":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n')

        hook_input = json.dumps({"session_id": "abc", "transcript_path": str(transcript)})

        import io
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("IN_PROGRESS_RUNNING", "1")
        with patch("sys.stdin", io.StringIO(hook_input)), \
             patch("update_hook.subprocess.Popen") as mock_popen:
            with pytest.raises(SystemExit) as exc:
                run_as_hook()

        assert exc.value.code == 0
        mock_popen.assert_not_called()
