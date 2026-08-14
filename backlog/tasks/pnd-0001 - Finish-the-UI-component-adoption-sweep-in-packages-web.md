---
id: PND-0001
title: Finish the UI component adoption sweep in packages/web
status: To Do
assignee: []
created_date: '2026-08-14 16:20'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 4 of the design-system adoption is the only part left. Phases 1, 2, 3 and 5 landed in 399b015, 15a7f60, d7a6584 and 56ab469: tokens, dark mode with a switcher, 13 ported components in packages/web/src/lib/components/ui/, and the colour-literal sweep.

What remains is substitution, not design. Measured 2026-08-09: 38 inline buttons across 23 files and 134 inline form controls still carry token classes directly instead of going through Button / TextField / SearchInput / Select. Re-measure before starting — the counts have had time to drift.

Be precise about what this is worth: these render correctly and on-brand today. The colour compliance sweep in 15a7f60 covered every one of them, so there is no visual or accessibility defect outstanding. The value is deduplication and maintenance, not appearance. That makes it safe to do incrementally and a poor candidate for a regex pass.

The form-control half is the larger and the riskier one. TextField and Select own their label, hint, error and aria-describedby wiring, so each substitution has to preserve markup that both the E2E suite and screen readers depend on.

Remaining files, grouped:
- AI Processing (7): +layout, queue, review, history, custom-fields, AiBulkActionBar, AiResultCard, AiResultDetailDrawer, AiDocumentPickerModal. No reference design exists for these screens, so this is component substitution only, not restructuring.
- Duplicates (3 + 2): BulkDeletePreview, GroupActionBar, RecycleBinPrompt, plus wizard and graph.
- Documents (2): DocumentLibraryFilters, DocumentLibraryTable.
- Settings (3): +page, AutomationSettings, CustomFieldPolicySettings.
- Other (3): jobs, +error, StaleAnalysisBanner.

Full background, including the phase history and the findings from phases 1-3 and 5, is held out of this public repo at docs/superpowers/specs/2026-08-14-design-system-adoption.md (gitignored, synced between machines). Imported from GitHub issue #530, which was deleted on 2026-08-14.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every inline button in the listed files goes through the Button component, or carries a comment naming why it cannot
- [ ] #2 Every inline form control in the listed files goes through TextField, SearchInput, Select, Toggle or Checkbox
- [ ] #3 Label, hint, error and aria-describedby wiring is preserved on every substituted form control
- [ ] #4 pnpm lint && pnpm format --write && pnpm check && pnpm test clean
- [ ] #5 pnpm build clean
- [ ] #6 pnpm test:e2e clean, with no test modified to accommodate changed markup
- [ ] #7 No new hardcoded colour literal outside the @theme and .dark blocks in packages/web/src
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 pnpm lint && pnpm format --write && pnpm check && pnpm test
- [ ] #2 pnpm build (core then web, in dependency order)
- [ ] #3 pnpm test:e2e (only if packages/web behaviour changed)
<!-- DOD:END -->
