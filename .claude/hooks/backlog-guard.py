#!/usr/bin/env python3
"""PreToolUse guard for the Backlog.md tracker.

Two upstream footguns are silent and unrepairable, so they are denied here rather
than documented and hoped about (see AGENTS.md "Task tracking"):

1. `backlog task edit` with a bare section flag REPLACES the whole section.
   Another agent's writes vanish with no warning and exit 0. The `--append-*`
   forms are the safe ones.
2. Hand-editing task/doc/decision markdown breaks the HTML-comment section
   markers. The section is then silently dropped at exit 0 — still in the file,
   invisible to the CLI — until the next write destroys it for real. There is no
   repair command; `backlog doctor` only fixes duplicate task IDs.

Footgun 2 is not only reachable through the file-editing tools. A shell
redirect, `tee`, an in-place `sed`, or an `rm` does the same damage while
presenting as a Bash call, so the Bash branch checks for those too.

Known limitation, stated rather than papered over: the flag check is gated on the
command mentioning `backlog`, because other tools legitimately take a `--notes`
flag (`gh release create --notes` must not be blocked). A shell alias for the
backlog binary would therefore slip past. Agents invoke it by name.

Exit 0 allows. Exit 2 blocks and shows stderr to the agent.
"""

import json
import os
import re
import sys

# Section flags as whole flags. `--append-notes` does not match: the two
# characters before "notes" there are "d-", not "--". The trailing guard is a
# negated class rather than a positive one so a quoted flag — `"--notes"`, where
# the next character is a quote rather than whitespace — is still caught.
BARE_SECTION_FLAG = re.compile(r"(?<![-\w])--(notes|plan)(?![\w-])")

# Files the CLI owns. config.yml is deliberately excluded — list-valued keys
# cannot be set through `backlog config set`, so hand-editing it is the
# documented path.
SECTIONS = "tasks|drafts|docs|decisions|milestones|completed|archive"
CLI_OWNED = re.compile(rf"(^|/)backlog/({SECTIONS})/")

# A CLI-owned path as it appears inside a shell command. Stops at whitespace so a
# quoted path containing spaces still matches on its prefix, which is all the
# detection needs.
_OWNED = rf"[^\s\"'|;&<>]*backlog/(?:{SECTIONS})/"

# Shell constructs that MUTATE such a path. Reads are deliberately untouched:
# cat, grep, ls, diff and the backlog CLI itself all stay allowed.
SHELL_MUTATIONS = (
    ("redirect", re.compile(rf">>?\s*[\"']?{_OWNED}")),
    ("tee", re.compile(rf"\btee\b(?:\s+-\S+)*\s+[\"']?{_OWNED}")),
    ("in-place edit", re.compile(rf"\b(?:sed|perl|ruby|python3?|awk)\b[^|;&]*?\s-i[^|;&]*?[\"']?{_OWNED}")),
    ("destructive command", re.compile(rf"\b(?:rm|mv|cp|truncate|shred|install|dd)\b[^|;&]*?[\"']?{_OWNED}")),
)


def deny(reason: str) -> None:
    print(reason, file=sys.stderr)
    sys.exit(2)


def deny_hand_edit(how: str) -> None:
    deny(
        f"BLOCKED: Backlog.md task/doc/decision markdown is CLI-owned, and this "
        f"{how} would write to it directly. Section boundaries are HTML-comment "
        "markers; breaking one silently drops the section at exit 0 — the data "
        "stays in the file but is invisible to the CLI until the next write "
        "destroys it for real, and there is no repair command.\n"
        "Use `backlog task edit` / `backlog doc update --content` instead. "
        "(`backlog/config.yml` is exempt and may be edited by hand.)"
    )


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
                f"BLOCKED: a bare `--{flag}` silently REPLACES the entire {flag} "
                f"section, destroying any other session's writes with no warning "
                f"and exit 0.\n"
                f"Use `--append-{flag}` instead. This is an open upstream bug, not "
                f'a misunderstanding — see AGENTS.md "Task tracking".'
            )
        for how, rx in SHELL_MUTATIONS:
            if rx.search(command):
                deny_hand_edit(how)
        sys.exit(0)

    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        path = ti.get("file_path") or ti.get("notebook_path") or ""
        rel = os.path.relpath(path, os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
        if CLI_OWNED.search(rel.replace(os.sep, "/")) or CLI_OWNED.search(path):
            deny_hand_edit("edit")
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
