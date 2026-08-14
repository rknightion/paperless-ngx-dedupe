# GitHub Issues archive

`issues-dump.json` is the complete record of this repo's GitHub issue tracker as it stood on
**2026-08-14**, captured immediately before the project moved to the in-repo
[Backlog.md](https://backlog.md) tracker under `backlog/` and the migrated issues were deleted.

**This archive is the record, not a pointer.** The issues it describes no longer exist on
GitHub, so nothing here can be resolved with `gh issue view`.

## What is in it

All **17** issues that existed at capture time — 15 closed, 2 open — with body, comments,
labels, author, state, timestamps and URL. Read it with `jq`:

```bash
# one line per issue
jq -r '.[] | "#\(.number) [\(.state)] \(.title)"' archive/issues-dump.json

# a single issue in full
jq '.[] | select(.number == 469)' archive/issues-dump.json

# every comment on an issue
jq -r '.[] | select(.number == 469) | .comments[] | "--- \(.author.login) \(.createdAt)\n\(.body)"' \
  archive/issues-dump.json
```

## Completeness

`--json comments` paginates, so "comments are present" is not the same as "comments are
complete". Per-issue comment counts were summed from the REST API's own `.comments` field and
required to match the dump exactly:

```bash
gh api --paginate 'repos/rknightion/paperless-ngx-dedupe/issues?state=all&per_page=100' \
  --jq '.[]|select(.pull_request==null)|"\(.number) \(.comments)"'
```

Result at capture: **exact match on all 17 issues, 39 comments total.**

## Redaction

The dump was swept for identifiers on its **decoded fields**, never on the serialized JSON. That
distinction matters: in `json.dumps` output an escape such as `\n` leaves a literal `n`
immediately before the following word, which breaks a `\b` word boundary and lets a blob sweep
certify a file clean while it still leaks.

One real value maps to one stable token everywhere, so cross-issue correlation survives without
the identifier:

| Placeholder | What it replaced |
| --- | --- |
| `<DESIGN-PROJECT-ID>` | The internal design-project identifier cited in #530 |

### #530 is held out of git entirely

Issue **#530**'s body and comments are replaced with a marker rather than redacted in place.
They carried design-system internals — the project id, internal `guidelines/*.md` and
`ui_kits/*.jsx` references, and unreleased brand token values. This repository is public and
this archive is committed, so redacting in place would still have moved that content into
permanent public git history at the exact moment the issue was being deleted.

The full text is kept out of tree at
`docs/superpowers/specs/2026-08-14-design-system-adoption.md` (gitignored, synced between
machines by `codex-sync.sh`). The remaining work from it is tracked as **`PND-0001`**.

Phases 1, 2, 3 and 5 of that issue were complete at capture time (`399b015`, `15a7f60`,
`d7a6584`, `56ab469`); phase 4 was partial.

### Author handles are deliberately NOT redacted

Attribution is preserved. The four externally-reported issues (#33, #103, #228, #269) were
**not** deleted and remain publicly visible on GitHub under those same handles, so
placeholdering them here would destroy attribution without concealing anything.

## What was deleted, and what was not

Deleted (13) — issues authored by the repo owner and by its own bots:

`#397 #468 #469 #476 #477 #478 #480 #482 #483 #530` (owner) and `#4 #25 #221` (Renovate).

Kept (4) — issues filed by external contributors. The tracker stays enabled for external
reports, and these are install and compatibility reports others may still reach by search:

`#33 #103 #228 #269`.

Renovate's dependency dashboard is recreated automatically on its next run.
