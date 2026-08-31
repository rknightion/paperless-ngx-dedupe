repo: rknightion/paperless-ngx-dedupe
branch: main
path: packages/web

## Last sync

date: 2026-08-31T11:13:50Z

### Updated in this project

- Ten archetype screens redesigned on m7kni Design System v2, light and dark, plus narrow variants of the shell, documents list and group detail.
- `spec/app.css`: complete replacement token block for `packages/web/src/app.css`, light and dark, in OKLCH.
- `spec/implementation-spec.md`: lucide to Phosphor map, per-primitive restyle notes, chart palette derivation with contrast measurements, page to archetype map, assumptions.
- Confidence bands and job states moved onto shape plus word plus number; the product violet is retired.

## Screen map

| Project screen | Repo files |
| --- | --- |
| 01 App Shell | `packages/web/src/routes/+layout.svelte`, `src/lib/components/ui/ThemeToggle.svelte`, `src/app.css` |
| 02 Dashboard | `src/routes/+page.svelte`, `src/lib/components/dashboard/*` |
| 03 Documents | `src/routes/documents/+page.svelte`, `src/lib/components/documents/DocumentLibraryTable.svelte` |
| 04 Duplicate group detail | `src/routes/duplicates/[id]/+page.svelte`, `src/lib/components/duplicates/ConfidenceBreakdown.svelte`, `MatchExplanation.svelte` |
| 05 Duplicates graph | `src/routes/duplicates/graph/+page.svelte`, `src/lib/theme/tokens.ts` |
| 06 Wizard | `src/routes/duplicates/wizard/+page.svelte` |
| 07 Jobs | `src/routes/jobs/+page.svelte`, `src/lib/components/ui/JobStatusCard.svelte`, `ProgressBar.svelte` |
| 08 Settings | `src/routes/settings/+page.svelte`, `src/lib/components/settings/*` |
| 09 AI review queue | `src/routes/ai-processing/+layout.svelte`, `src/lib/components/ai/AiResultRow.svelte`, `AiFieldDiffCard.svelte` |
| 10 System states | `src/lib/components/ui/{Skeleton,Spinner,EmptyState,ErrorState}.svelte`, `src/lib/components/ai/AiToastContainer.svelte` |
| Implementation spec | `src/app.css`, `src/lib/theme/tokens.ts`, `src/lib/components/ui/*` |
