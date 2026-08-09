// ── m7kni design system components ──────────────────────────────────────
// Svelte 5 ports of the shared system's component contracts. Read the
// component's own header before using one; several encode rules that are not
// preferences (Badge has no solid variant, Button has no semantic tint).
export { default as Button } from './ui/Button.svelte';
export { default as Badge } from './ui/Badge.svelte';
export { default as Spinner } from './ui/Spinner.svelte';
export { default as Skeleton } from './ui/Skeleton.svelte';
export { default as TextField } from './ui/TextField.svelte';
export { default as SearchInput } from './ui/SearchInput.svelte';
export { default as Select } from './ui/Select.svelte';
export { default as Toggle } from './ui/Toggle.svelte';
export { default as Checkbox } from './ui/Checkbox.svelte';
export { default as EmptyState } from './ui/EmptyState.svelte';
export { default as ErrorState } from './ui/ErrorState.svelte';
export { default as PageHeader } from './ui/PageHeader.svelte';
export { default as Tabs } from './ui/Tabs.svelte';
export { default as ThemeToggle } from './ui/ThemeToggle.svelte';

export { default as ProgressBar } from './ui/ProgressBar.svelte';
export { default as ConfidenceBadge } from './ui/ConfidenceBadge.svelte';
export { default as StatusBadge } from './ui/StatusBadge.svelte';
export { default as StatCard } from './ui/StatCard.svelte';
export { default as JobStatusCard } from './ui/JobStatusCard.svelte';
export { default as EChart } from './ui/EChart.svelte';
export { default as ConfirmDialog } from './ui/ConfirmDialog.svelte';
export { default as ConfidenceBreakdown } from './duplicates/ConfidenceBreakdown.svelte';
export { default as DocumentCompare } from './duplicates/DocumentCompare.svelte';
export { default as TextDiff } from './duplicates/TextDiff.svelte';
export { default as GroupActionBar } from './duplicates/GroupActionBar.svelte';
export { default as Tooltip } from './ui/Tooltip.svelte';
export { default as RichTooltip } from './ui/RichTooltip.svelte';
export { default as InfoIcon } from './ui/InfoIcon.svelte';
export { default as ConfidenceTooltipContent } from './duplicates/ConfidenceTooltipContent.svelte';
export { default as GroupPreviewModal } from './duplicates/GroupPreviewModal.svelte';
export { default as DocumentVisualCompare } from './duplicates/DocumentVisualCompare.svelte';
export { default as MatchExplanation } from './duplicates/MatchExplanation.svelte';
export { default as RecycleBinPrompt } from './duplicates/RecycleBinPrompt.svelte';
export { default as ThumbnailPreview } from './duplicates/ThumbnailPreview.svelte';
export { default as WizardGroupCard } from './duplicates/WizardGroupCard.svelte';
export { default as AiResultList } from './ai/AiResultList.svelte';
export { default as AiResultRow } from './ai/AiResultRow.svelte';
export { default as AiResultCard } from './ai/AiResultCard.svelte';
export { default as AiResultDetailDrawer } from './ai/AiResultDetailDrawer.svelte';
export { default as AiFieldDiffCard } from './ai/AiFieldDiffCard.svelte';
export { default as AiBulkActionBar } from './ai/AiBulkActionBar.svelte';
export { default as AiFilterBar } from './ai/AiFilterBar.svelte';
export { default as AiToastContainer } from './ai/AiToastContainer.svelte';
export { default as AiDocumentPreview } from './ai/AiDocumentPreview.svelte';
export { default as AiKeyboardHandler } from './ai/AiKeyboardHandler.svelte';
export { default as AiDocumentPickerModal } from './ai/AiDocumentPickerModal.svelte';
export { default as AiPreflightDialog } from './ai/AiPreflightDialog.svelte';
export { default as AiResultGroupedList } from './ai/AiResultGroupedList.svelte';
export { default as AiReviewPresets } from './ai/AiReviewPresets.svelte';
export { default as StaleAnalysisBanner } from './ui/StaleAnalysisBanner.svelte';
