#!/usr/bin/env python3
"""PreToolUse guard for the Backlog.md tracker.

Two upstream footguns are silent and unrepairable, so they are denied here rather
than documented and hoped about (see AGENTS.md "Task tracking"):

1. `backlog task edit --notes/--plan` REPLACES the whole section. Another agent's
   writes vanish with no warning and exit 0. `--append-notes`/`--append-plan` are
   the safe forms.
2. Hand-editing task/doc/decision markdown breaks the HTML-comment section
   markers. The section is then silently dropped at exit 0 — still in the file,
   invisible to the CLI — until the next write destroys it for real. There is no
   repair command; `backlog doctor` only fixes duplicate task IDs.

Exit 0 allows. Exit 2 blocks and shows stderr to the agent.
"""

import json
import os
import re
import sys

# --notes / --plan as whole flags. `--append-notes` does not match: the two
# characters before "notes" there are "d-", not "--".
BARE_SECTION_FLAG = re.compile(r"(?<![-\w])--(notes|plan)(?=[=\s]|$)")

# Files the CLI owns. config.yml is deliberately excluded — list-valued keys
# cannot be set through `backlog config set`, so hand-editing it is the
# documented path.
CLI_OWNED = re.compile(r"(^|/)backlog/(tasks|drafts|docs|decisions|milestones|completed|archive)/")


def deny(reason: str) -> None:
    print(reason, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # never block on a payload we cannot parse

    tool = payload.get("tool_name", "")
    ti = payload.get("tool_input") or {}

    if tool == "Bash":
        command = ti.get("command", "")
        if "backlog" not in command:
            sys.exit(0)
        m = BARE_SECTION_FLAG.search(command)
        if m:
            flag = m.group(1)
            deny(
                f"BLOCKED: bare `--{flag}` silently REPLACES the entire {flag} section, "
                f"destroying any other session's writes with no warning and exit 0.\n"
                f"Use `--append-{flag}` instead. This is an open upstream bug, not a "
                f"misunderstanding — see AGENTS.md \"Task tracking\"."
            )
        sys.exit(0)

    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        path = ti.get("file_path") or ti.get("notebook_path") or ""
        rel = os.path.relpath(path, os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
        if CLI_OWNED.search(rel.replace(os.sep, "/")) or CLI_OWNED.search(path):
            deny(
                "BLOCKED: Backlog.md task/doc/decision markdown is CLI-owned. Section "
                "boundaries are HTML-comment markers; breaking one silently drops the "
                "section at exit 0 — the data stays in the file but is invisible to the "
                "CLI until the next write destroys it for real, and there is no repair "
                "command.\n"
                "Use `backlog task edit` / `backlog doc update --content` instead. "
                "(`backlog/config.yml` is exempt and may be edited by hand.)"
            )
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
