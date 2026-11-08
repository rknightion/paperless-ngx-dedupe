---
name: github-actions-security-review
description: Review GitHub Actions workflows and composite actions for the attack paths zizmor and actionlint cannot see, such as privileged triggers and suppressed findings on them, attacker values traced into composite actions, PR-controlled config read by privileged jobs, credential reach, and cache or artifact flow into privileged runs. Use when a diff touches .github/workflows or .github/actions, when asked to audit CI security, or when a zizmor finding needs an attack path. Every finding needs a concrete exploitation scenario.
license: Apache-2.0
---

# GitHub Actions security review

Source: https://github.com/getsentry/skills/blob/main/skills/gha-security-review/SKILL.md (Apache-2.0; attack patterns credited there to the StepSecurity HackerBot Claw campaign analysis, https://www.stepsecurity.io/blog/hackerbot-claw-github-actions-exploitation).

Changes from the source: cut to the checks zizmor and actionlint do not cover, since both run on every pull request; added the `workflow_run`, startup-permission and sink-tracing traps and the account's self-hosted runner rule.

Find exploitable vulnerabilities. Every exploit finding must carry a concrete exploitation scenario; if you cannot build the attack, do not report it.

## Scope

Workflows under `.github/workflows/`, local actions, and the files they load (`AGENTS.md`,
`CLAUDE.md`, `justfile`, shell under `.github/`). zizmor and actionlint already check action
pinning, excessive permissions, direct template injection in `run:`, dangerous checkouts and
known-vulnerable actions: do not repeat them, but an unresolved zizmor finding on the pull request
is never a pass, whether or not this repository makes it fail the build. Report only what
someone without write access can exploit (a fork pull request, an issue or comment, a branch name,
title or commit message, a compromised third-party action). Your proof is `just lint` plus the job's
command run locally; never trigger a workflow to test it.

## Residual checks

1. **Privileged triggers**, and every `# zizmor: ignore` on one (`pull_request_target`,
   `workflow_run`, `issue_comment`): no PR code runs where secrets or a write token exist;
   `workflow_run` gates on `conclusion == 'success'`, the triggering event and head repository (it
   matches the triggering workflow's `name:`, not its file). `github.sha` there is the default-branch
   HEAD, right for loading trusted scripts; `github.event.workflow_run.head_sha` is the triggering
   commit, which a fork controls, so it is read as data and never run with secrets or a write
   token. A comment handler checks `author_association`.
2. **Attacker values traced to their sink**: through `with:` or `env:` into a composite or local
   action's `run:`, and into an unquoted variable or `eval` in a later step.
3. **Config and prompt poisoning**: a privileged job that reads PR-supplied instructions or config
   (`AGENTS.md`, `CLAUDE.md`, `justfile`, scripts), or hands PR text to an AI agent with write access.
4. **Credential reach**: what each secret, token mint, OIDC role or deploy key can touch, and whether
   PR-controlled code runs in a job holding it; a cache or artifact written by a run that executes
   PR code and restored by a privileged run.
5. **Content resolved at run time behind a SHA pin**: a pinned action or reusable that fetches a
   mutable `@main` config, script or download.
6. **The startup-permission trap**: a caller's permissions cap a called workflow and are validated
   at startup, before any `if:`; removing one a skipped job needs is a `startup_failure` with no log.
7. **No self-hosted runners in a public repository**: a fork pull request can schedule onto one and
   persist there. This is a policy finding and needs no attack path.
8. **Every remote `uses:` (`owner/repo@...`) is pinned to a full 40-character SHA with a `# vX.Y.Z`
   comment**, first-party and cross-repository reusables included, never a tag or `@main`. A local
   `./` path cannot carry a ref and is exempt; a `docker://` image is pinned by digest. Also a policy
   finding with no attack path needed, reported even where zizmor is not enforced.

## Report

Per finding: id, title, `path:line`, trigger, then the exploitation steps, impact and fix. HIGH
needs the whole path traced; anything less is "needs verification" with what to verify. If nothing
is exploitable, say so in one line.
