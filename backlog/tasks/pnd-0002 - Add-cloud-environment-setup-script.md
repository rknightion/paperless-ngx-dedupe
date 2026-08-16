---
id: PND-0002
title: Add cloud environment setup script
status: Done
assignee: []
created_date: '2026-08-16 11:37'
updated_date: '2026-08-16 11:46'
labels: []
dependencies: []
references:
  - 'https://learn.chatgpt.com/docs/environments/cloud-environment#manual-setup'
  - 'https://code.claude.com/docs/en/cloud-environments#setup-scripts'
modified_files:
  - scripts/cloud-environment-setup.sh
type: chore
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Provide a repository-owned manual setup script for Codex Cloud Tasks and Claude Code cloud environments. It must provision the Node/pnpm toolchain, project dependencies, Backlog.md CLI, and browser/testing dependencies needed by future agents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 scripts/cloud-environment-setup.sh begins with a warning that non-cloud agents must not run it
- [x] #2 The script installs and verifies Node.js 24, the lockfile-pinned pnpm version, Backlog.md CLI 1.50.1, project dependencies, and Playwright Chromium dependencies
- [x] #3 The script is safe to rerun and compatible with Codex and Claude Code Ubuntu cloud environments
- [x] #4 Shell syntax, lint, type-check, and the full build pass; any unrelated baseline failures are documented
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 pnpm lint && pnpm format --write && pnpm check && pnpm test
- [x] #2 pnpm build (core then web, in dependency order)
- [ ] #3 pnpm test:e2e (only if packages/web behaviour changed)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a fail-fast, idempotent Bash script that detects the repository root and provisions Node.js 24 across the Codex and Claude Ubuntu images.

2. Activate the lockfile-declared pnpm version, install Backlog.md and frozen project dependencies, and install Playwright Chromium system/browser dependencies.

3. Validate shell syntax, formatting, lint, type-check, unit tests, and the full build; then finalize and commit the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the cloud-only setup script with a portable Node.js 24 installer, pinned global pnpm and Backlog.md CLIs, frozen dependency installation, and Playwright Chromium plus Ubuntu dependency installation.

Validation found two unrelated repository baseline issues: Prettier reports five existing/generated Markdown or YAML files, and the existing bounded AI inbox detail test consistently exceeds its 5-second timeout. Lint, type-check, build, script syntax, archive discovery, and diff checks pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an executable, idempotent cloud-only provisioning script for Codex and Claude Code that installs Node.js 24, pnpm 11.18.0, Backlog.md 1.50.1, frozen workspace dependencies, and Playwright Chromium dependencies. Verified its contract and Bash syntax, plus repository lint, type-check, and build; documented unrelated baseline format and unit-test failures.
<!-- SECTION:FINAL_SUMMARY:END -->
