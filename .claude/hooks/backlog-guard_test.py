import json, subprocess, os, sys

HOOK = "/Users/rob/repos/paperless-ngx-dedupe/.claude/hooks/backlog-guard.py"
env = dict(os.environ, CLAUDE_PROJECT_DIR="/Users/rob/repos/paperless-ngx-dedupe")
# Built by concatenation so this file can be run through the very hook it tests:
# a literal flag in the command string would trip the guard on the test harness.
N = "--" + "notes"
P = "--" + "plan"
ROOT = "/Users/rob/repos/paperless-ngx-dedupe"
TASK = f"{ROOT}/backlog/tasks/pnd-0001 - x.md"

cases = [
    # --- section flags: the unsafe forms ---
    ("bare notes flag",      {"tool_name": "Bash", "tool_input": {"command": f"backlog task edit pnd-0001 {N} hi"}}, 2),
    ("bare plan flag",       {"tool_name": "Bash", "tool_input": {"command": f"backlog task edit pnd-0001 {P} hi"}}, 2),
    ("equals form",          {"tool_name": "Bash", "tool_input": {"command": f"backlog task edit pnd-0001 {N}=hi"}}, 2),
    ("flag at end of line",  {"tool_name": "Bash", "tool_input": {"command": f"backlog task edit pnd-0001 {N}"}}, 2),
    ("double-quoted flag",   {"tool_name": "Bash", "tool_input": {"command": f'backlog task edit pnd-0001 "{N}" hi'}}, 2),
    ("single-quoted flag",   {"tool_name": "Bash", "tool_input": {"command": f"backlog task edit pnd-0001 '{N}' hi"}}, 2),
    ("quoted plan flag",     {"tool_name": "Bash", "tool_input": {"command": f'backlog task edit pnd-0001 "{P}" hi'}}, 2),

    # --- section flags: the safe forms MUST still be allowed ---
    ("append-notes allowed", {"tool_name": "Bash", "tool_input": {"command": "backlog task edit pnd-0001 --append-notes hi"}}, 0),
    ("append-plan allowed",  {"tool_name": "Bash", "tool_input": {"command": "backlog task edit pnd-0001 --append-plan hi"}}, 0),
    ("task list allowed",    {"tool_name": "Bash", "tool_input": {"command": "backlog task list --plain"}}, 0),
    ("doc update allowed",   {"tool_name": "Bash", "tool_input": {"command": "backlog doc update doc-0002 --content x"}}, 0),
    ("non-backlog cmd",      {"tool_name": "Bash", "tool_input": {"command": f"mytool {N} foo"}}, 0),
    ("gh release notes ok",  {"tool_name": "Bash", "tool_input": {"command": f"gh release create v1 {N} 'x'"}}, 0),

    # --- shell paths that write CLI-owned markdown without an Edit/Write ---
    ("bash redirect",        {"tool_name": "Bash", "tool_input": {"command": f'echo broken > "{TASK}"'}}, 2),
    ("bash append redirect", {"tool_name": "Bash", "tool_input": {"command": f'echo broken >> "{TASK}"'}}, 2),
    ("relative redirect",    {"tool_name": "Bash", "tool_input": {"command": 'echo x > backlog/tasks/pnd-0001.md'}}, 2),
    ("tee into task md",     {"tool_name": "Bash", "tool_input": {"command": f'echo x | tee "{TASK}"'}}, 2),
    ("sed -i on task md",    {"tool_name": "Bash", "tool_input": {"command": f'sed -i "" s/a/b/ "{TASK}"'}}, 2),
    ("rm a task file",       {"tool_name": "Bash", "tool_input": {"command": f'rm "{TASK}"'}}, 2),
    ("mv a doc file",        {"tool_name": "Bash", "tool_input": {"command": 'mv backlog/docs/doc-0001.md /tmp/x'}}, 2),

    # --- reads over the same paths MUST stay allowed ---
    ("cat a task",           {"tool_name": "Bash", "tool_input": {"command": f'cat "{TASK}"'}}, 0),
    ("grep the board",       {"tool_name": "Bash", "tool_input": {"command": 'grep -rn PII backlog/tasks/'}}, 0),
    ("ls the docs",          {"tool_name": "Bash", "tool_input": {"command": 'ls backlog/docs/'}}, 0),

    # --- file-editing tools ---
    ("edit task md",         {"tool_name": "Edit",  "tool_input": {"file_path": TASK}}, 2),
    ("write doc md",         {"tool_name": "Write", "tool_input": {"file_path": f"{ROOT}/backlog/docs/doc-0002 - y.md"}}, 2),
    ("edit completed md",    {"tool_name": "Edit",  "tool_input": {"file_path": f"{ROOT}/backlog/completed/pnd-0009 - z.md"}}, 2),
    ("config.yml allowed",   {"tool_name": "Edit",  "tool_input": {"file_path": f"{ROOT}/backlog/config.yml"}}, 0),
    ("source file allowed",  {"tool_name": "Edit",  "tool_input": {"file_path": f"{ROOT}/packages/core/src/index.ts"}}, 0),
    ("AGENTS.md allowed",    {"tool_name": "Write", "tool_input": {"file_path": f"{ROOT}/AGENTS.md"}}, 0),
]

fails = 0
for name, payload, want in cases:
    r = subprocess.run([sys.executable, HOOK], input=json.dumps(payload),
                       capture_output=True, text=True, env=env)
    ok = r.returncode == want
    fails += not ok
    print(f"{'PASS' if ok else 'FAIL'}  exit={r.returncode} want={want}  {name}")

# garbage stdin must never block
r = subprocess.run([sys.executable, HOOK], input="not json", capture_output=True, text=True, env=env)
ok = r.returncode == 0
fails += not ok
print(f"{'PASS' if ok else 'FAIL'}  exit={r.returncode} want=0  garbage stdin never blocks")

total = len(cases) + 1
print(f"\n{total - fails}/{total} passed")
sys.exit(1 if fails else 0)
