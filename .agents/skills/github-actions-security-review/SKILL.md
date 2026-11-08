---
name: github-actions-security-review
description: Review GitHub Actions workflows and composite actions for weaknesses an outside attacker could exploit, such as pwn requests, expression injection, comment-triggered commands, workflow_run trust, credential escalation, cache and artifact poisoning, and unpinned third-party actions in privileged jobs. Use when a diff touches .github/workflows or .github/actions, when asked to audit CI security, or when a zizmor finding needs an attack path. Every exploit finding needs a concrete exploitation scenario; it does not repeat what zizmor and actionlint already check.
license: Apache-2.0
---

# GitHub Actions security review

Source: https://github.com/getsentry/skills/blob/main/skills/gha-security-review/SKILL.md (Apache-2.0; attack patterns credited there to the StepSecurity HackerBot Claw campaign analysis, https://www.stepsecurity.io/blog/hackerbot-claw-github-actions-exploitation).

Changes from the source: the eight reference files are folded into short checks; added the `workflow_run`, startup-permission and sink-tracing traps, the account's two pinning and runner rules as policy checks, and the split with the zizmor and actionlint linters these repositories already run.

Find exploitable vulnerabilities. Every exploit finding must carry a concrete exploitation scenario; if you cannot build the attack, do not report it.

## Boundaries

- Workflows under `.github/workflows/`, local actions (`action.yml`, `.github/actions/*/action.yml`), and the files and scripts they load (`AGENTS.md`, `CLAUDE.md`, `justfile`, shell under `.github/`).
- CI runs actionlint and zizmor, and `just lint` usually does too. Do not repeat their findings. Add what they cannot see: the full attack path across workflows, the real attacker control of a value, and the blast radius of a credential.
- A workflow change is a sensitive change. Your proof is `just lint` plus the job's own command run locally. Never trigger a workflow to test it; a maintainer proves a workflow change on a branch. A PR that changes `.github/workflows/` or `.github/actions/` carries no closing keyword: write `Task: none, <reason>` and a plain `Refs #N`.

## Threat model

Report only what someone **without write access** can exploit: anyone who can open a PR from a fork, create an issue or comment, choose a branch name, title or commit message, or who publishes a compromised third-party action. Input to `workflow_dispatch`, `schedule` triggers, `push` to protected branches and `workflow_call` inputs whose callers are all internal need write access and are out of scope.

## Confidence

Report HIGH and MEDIUM only. HIGH means you traced the whole path and give all five: the entry point, the payload, how it executes, the impact, and a short proof sketch. If any element is missing, report it as MEDIUM, "needs verification", and say what to verify. Do not report theory and do not invent findings: zero findings is a valid result.

## Checks

Run only the checks the triggers in the file make relevant.

1. **Pwn request.** `pull_request_target` together with a checkout of the PR head (`ref:` pointing at the head, or a local action that would come from the fork), or a `run:` step executing checked-out PR code. `pull_request_target` without a checkout of fork code is safe; plain `pull_request` runs with a read-only token and no secrets.
2. **Expression injection.** `${{ }}` inside a `run:` block where the value is attacker text (PR title, body, branch name, head ref, comment body, commit message, label). Safe in place: numeric ids, SHAs, `github.repository`, `secrets.*`, and expressions in `if:`. A value passed through `with:` or step `env:` is not interpolated there, but trace it to its final sink: a composite or local action can put an input into a `run:` command, and a later step can use the variable unquoted or in `eval`. The fix is to pass the value through `env:` and quote it as a shell variable at every sink.
3. **Comment-triggered commands.** An `issue_comment` or `pull_request_review_comment` workflow that runs a command without an `author_association` check, or whose handler also interpolates the comment.
4. **`workflow_run` trust.** It matches the triggering workflow's `name:`, not its filename, and fires for failed runs too. In it `github.sha` is the default-branch HEAD, so use `github.event.workflow_run.head_sha` for the triggering commit and gate on `conclusion == 'success'`. Validate every API value before it reaches a command, and never check out or run a fork's head in a privileged job.
5. **Credential escalation.** What does each secret, token mint, OIDC role or deploy key reach (package write, release, cloud credentials, another repository)? Can PR-controlled code run in a job holding it, or in a job that restores something PR code wrote?
6. **Config and prompt poisoning.** A privileged job that loads instructions or configuration from PR-supplied files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `justfile`, scripts) or feeds PR text to an AI agent holding write access.
7. **Supply chain.** A third-party action or reusable workflow on a tag or branch matters as an exploit only where the job has secrets, OIDC, a write token, or release, deploy, package or signing power. Unprivileged read-only CI is not an exploit finding. Same-repository local actions are not a supply-chain issue (review them under check 1).
8. **Permissions and secrets.** The top level `permissions:` should be minimal and each job should grant only what it needs. A caller's permissions cap a called workflow and are validated at startup, before any `if:`, so removing a permission a skipped job needs is a `startup_failure` with no log.
9. **Runners, caches and artifacts.** A cache or artifact written by a run that executes PR code and restored by a privileged run (cache poisoning), runner state that persists between jobs, and secrets reachable from a runner a fork can schedule onto.

## Policy checks

These are the account's standing rules. Report a violation as a policy finding, separate from exploit findings; it needs no attack path.

- **Never call a cross-repository reusable workflow or action at `@main`** or any branch. Callers pin `uses: owner/repo/path@<full 40 character SHA> # vX.Y.Z`. Pin every external `uses:` the same way, first-party `actions/*` included, with the version comment the dependency bot maintains.
- **Public-repository CI never runs on self-hosted runners.** A fork PR can schedule code onto a self-hosted runner and persist on it. A `runs-on:` naming a self-hosted label in a public repository is a finding.

## Validate before reporting

Read the whole workflow, not grep output. Trace the trigger and the `if:` gates, confirm the expression or checkout really sits where you say, confirm the attacker controls the value, and check the mitigations (env wrapping, `author_association`, permissions, SHA pins). A broken link means MEDIUM or drop it.

## Report

For each finding give an id, a short title, severity, `path:line`, trigger, confidence, the exploitation scenario in numbered steps, the impact and a concrete fix. Then "Policy findings", "Needs verification" for MEDIUM items, and "Reviewed and cleared" for workflows you checked and found safe. If nothing is exploitable, say so in one line.
