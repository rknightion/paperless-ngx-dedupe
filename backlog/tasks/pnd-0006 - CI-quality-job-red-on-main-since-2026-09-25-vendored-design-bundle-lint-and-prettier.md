---
id: PND-0006
title: >-
  CI: quality job red on main since 2026-09-25 (vendored design bundle lint and
  prettier)
status: To Do
assignee: []
created_date: '2026-09-26 17:29'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during fleet CI hygiene (PND-0005). The quality job, and so ci-success, has failed on every main push since about 2026-09-25: lint errors in the vendored design-system JS bundle under design/ (React, cva and cn undefined; no-func-assign) plus prettier drift. Because ci-success is the required check in the fleet main ruleset, a red ci-success blocks Renovate auto-merge on this repo until this is fixed. Either exclude the vendored bundle from lint/format the way generated code is excluded, or fix the bundle. Also seen locally: 4 flaky lease-recovery tests in backup.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 quality passes on main
- [ ] #2 ci-success is green on main
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 just check
- [ ] #2 just build
- [ ] #3 just test-e2e (only if packages/web behaviour changed)
<!-- DOD:END -->
