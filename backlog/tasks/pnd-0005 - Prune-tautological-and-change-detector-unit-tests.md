---
id: PND-0005
title: Prune tautological and change-detector unit tests
status: To Do
assignee: []
created_date: '2026-09-25 08:05'
labels:
  - testing
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-09-25 fleet test-signal audit (sampled read-only). Delete or consolidate tautological tests (restating the implementation) and change-detector tests (pinning incidental text, markup, counts or internals). Keep parsing, state-machine, retry, security/PII, wire-contract and incident regression tests. Re-verify each candidate before deleting it; the list below comes from a sample and is not exhaustive. Candidates: packages/core/src/ai/__tests__/config.test.ts:18-33 (restates default-config literals); packages/core/src/jobs/__tests__/manager.test.ts:29-46 (exact legacy job column key list); packages/core/src/ai/__tests__/custom-field-discovery-v2.test.ts:627 (two fields of one result asserted equal). Roughly 20% of the sample was trivial default or constructor checks; sweep for more.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each listed candidate is deleted, consolidated or kept with a one-line reason in the notes
- [ ] #2 Other tests in the same pattern found during the work are handled the same way
- [ ] #3 The repo's check recipe passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 just check
- [ ] #2 just build
- [ ] #3 just test-e2e (only if packages/web behaviour changed)
<!-- DOD:END -->
