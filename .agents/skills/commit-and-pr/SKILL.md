---
name: commit-and-pr
description: Write commit messages, pull request titles and pull request bodies that release-please can version and the acceptance evidence check accepts. Use when committing, drafting or fixing a commit message, choosing a pull request's squash title, or writing or refreshing a pull request description. Covers commit types, breaking changes, closing forms, the acceptance evidence table, the Task line, staging by pathspec and what never goes in commit or pull request text.
license: Apache-2.0
---

# Commit and pull request writing

Sources: https://github.com/getsentry/skills/blob/main/skills/commit/SKILL.md and
https://github.com/getsentry/skills/blob/main/skills/pr-writer/SKILL.md

Changes from the source: the fixed type list is replaced by the types in the repository's
`release-please-config.json` when it has one, and by a default set when it has none, the subject is lower case, the pull request title is the squash commit
subject, and added the closing forms, the acceptance evidence table, the `Task:` line, pathspec
staging and fork rules.

Inside the owner's agent loop, the repository's `LOOP.md` overrides this skill where they differ.

Commit, push or open a pull request only when the person you work for has asked you to. Work on a
branch. Contributors always land through a pull request; anything else about landing is the
repository's `AGENTS.md`'s call.

## Commit type

If the repository has a `release-please-config.json` at its root, read `changelog-sections` in it
and use only the types it lists. A type it marks `hidden` is valid but stays out of the changelog. A
type it does not list (`ref`, `meta`, `license` and the like) never reaches the changelog: do not
invent one. If the repository has none, use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`,
`build` or `perf`.

Pick the narrowest accurate type for the dominant change: `feat` for new capability (minor bump),
`fix` for a defect (patch), `refactor` for no behaviour change. Add a scope for the area when it
helps (`api`, `chart`, `docs`, `ci`).

`!` after the type, or a `BREAKING CHANGE:` footer, produces a major bump. Use it only for a
deliberate break of something users depend on (a flag, an API field, a config key, a chart value),
and say in the body what breaks and how to migrate.

Where the repository uses release-please, it owns `CHANGELOG.md`, `.release-please-manifest.json`
and every file the config lists under `extra-files`. Never hand-edit them.

## Message

```text
<type>(<scope>): <subject>

<body: what changed and why, only when useful>

Task: #<N>
```

- Subject: imperative, lower case after the colon, no trailing period, 72 characters or fewer. Say
  the behaviour, not the files. Avoid `update`, `cleanup`, `misc`, `address feedback`.
- Body lines wrap at about 100 characters. Explain why, the previous behaviour or the risk. Do not
  narrate attempts.
- Trailer: `Task: #<N>` for work on an issue of this repository, `Task: none, <reason>` for work on
  none. Add any attribution line your tool requires.
- One coherent, independently reviewable change per commit.

## Staging

Bound the commit by paths, never by the index: `git add -- <path>...`, then
`git commit -- <path>...`. A path commit records the working tree content of those paths, so read
`git diff HEAD -- <path>...` just before committing. Never `git add -A`, `git add .` or
`git commit -a`: another session may have staged work. Preserve unrelated changes in a dirty tree.

## Pull request title

Pull requests are squash merged: the title becomes the commit subject on the default branch, and
release-please versions from it. It must be a valid conventional commit that describes the whole
branch, not its last commit. Never put `WIP` or `DO NOT MERGE` in it; open a draft instead. Refresh
the title when follow-up commits change the scope.

## Pull request body

Fill the repository's `.github/pull_request_template.md` when it has one. Write it as a cover note
for reviewers: what behaviour changed and who is affected, then why, then what you verified and what
you did not. A contract change names the field, flag or key, before and after, and the
compatibility story. No pasted CI logs, commit lists or file lists. When follow-up commits change
the picture, rewrite the body around the current full diff.

## Closing an issue

Who closes depends on who you are:

- **An outside contributor** (anyone who is not a maintainer of this repository, and the agent
  working for them) writes `Refs #N` on a line of its own, never a closing keyword, and says in the
  body how the change was verified. A maintainer adds the acceptance evidence and closes the issue.
  Skip the rest of this section.
- **A maintainer, or the owner's agent,** writes `Closes #N` with the evidence table, as below.

The rest of this section is for maintainers:

- A closing form is one keyword (`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`,
  `resolves`, `resolved`, any case, optional colon) then the issue (`#N`, `<owner>/<repo>#N` or the
  issue URL) on one line outside an HTML comment. Write `Closes #N` on a line of its own for each
  issue the change completes. The issue must be in the repository the pull request targets.
- Any such pair in the body closes the issue, prose included ("this fixes #12"), so an outside
  contributor must avoid it in prose too. Write `Refs #N` for an issue you only mention.
- A pull request that closes an issue carries an `Acceptance evidence` table with one row per
  criterion of each closed issue, in the issue's order:

  ```text
  | Issue | AC | AC text | Evidence class | Proof |
  | --- | --- | --- | --- | --- |
  | #12 | AC1 | <the criterion word for word> | code | `path/to/test_file.py` test_name_that_proves_it |
  ```

  The AC text is copied exactly from the issue's `- [ ] ACn` line (write a pipe as `\|`). The class
  is `code`, `live` or `browser`. Put repository paths in backticks, and only paths: the check
  confirms each one exists at the head commit. Write commands and read-backs without backticks.
- A pull request that closes nothing says `Task: none, <reason>` on a line of its own.
- A pull request that changes `.github/workflows/` or `.github/actions/` carries no closing
  keyword: write `Task: none, <reason>` and a plain `Refs #N`, and a maintainer closes the issue.
- After editing the body, re-run the acceptance evidence job if it did not re-run on its own.

## What never goes in commit or pull request text

Commit messages and pull request text are public on a public repository and permanent in history.
Never include secrets, personal data, credentials or real identifiers: hostnames, IP addresses,
account or tenant IDs, email addresses, usernames, serial numbers. Describe the technical symptom
with a stand-in instead. Run the repository's privacy sweep, if it has one
(`python3 .github/privacy/sweep --staged`), before you commit.

## Before you open it

Prove the final tree as the repository's `AGENTS.md` says and run `pre-pr-review` on the diff.
Write the body to a file and pass it with `gh pr create --body-file <file>`. After that the review is
the pull request's: its required checks and any review bots it runs, handled as the `AGENTS.md`
review findings rule says.
