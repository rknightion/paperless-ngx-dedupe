---
id: PND-0008
title: Update Node and container trust for eMudhra remediation
status: In Progress
assignee: []
created_date: '2026-10-21T23:42:00Z'
updated_date: '2026-10-21T23:47:00Z'
labels: []
dependencies: []
references:
  - 'https://emudhra.we-have-a-problem.com/'
priority: high
type: bug
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The release branch still uses Node 24.22.0 in both dependency and runtime images. That predates the Node 24.22.1 eMudhra distrust fix. The Bugbot branch refresh and formatting repair do not remediate runtime certificate trust.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All selected Node build and runtime versions include the eMudhra fix, with compatible pins updated together
- [ ] #2 The published runtime CA package is verified against a patched distribution version and both incident hosts fail certificate verification
- [ ] #3 Existing local and exact-head CI gates pass before the patched release is published
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 just check
- [ ] #2 just build
- [ ] #3 just test-e2e (only if packages/web behaviour changed)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace both Node image pins with the verified patched image digest; validate the existing gate and built runtime trust before publication.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both verified Node 24.22.1 image stages install ca-certificates 20250419+deb13u1. Full just check and Docker build pass. Actual built runtime Node and OpenSSL clients reject both incident chains. Await exact-head CI and released image proof.
<!-- SECTION:NOTES:END -->
