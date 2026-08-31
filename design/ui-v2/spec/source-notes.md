# Source notes - paperless-ngx-dedupe (read from repo @ 2fa76e7ee114, branch main)

Working notes taken from the real source. Everything in the redesign traces back to a line here.

## Stack

SvelteKit 5 + Tailwind v4, `packages/web/`. Fonts: `@fontsource/geist-sans`,
`@fontsource-variable/jetbrains-mono`. Icons: `lucide-svelte` v1. Charts: `echarts` ^6.
Theme: class-based dark (`@custom-variant dark (&:where(.dark, .dark *))`), three-way
preference in `lib/theme/ThemeStore.svelte.ts`, painted early by an inline script in `app.html`.

## v1 token block (app.css, `@theme static`) - every token needing a v2 value

Surfaces: canvas `oklch(0.975 0.006 85)`, canvas-deep `0.945 0.009 85`, surface `oklch(1 0 0)`,
surface-raised `oklch(1 0 0)`.
Ink: ink `0.2 0.02 260`, ink-light `0.35 0.02 260`, ink-faint `0.48 0.015 260`, muted `0.55 0.015 260`.
Accent (jade): accent `0.49 0.13 165`, accent-hover `0.42 0.13 165`, accent-light `0.93 0.035 165`,
accent-subtle `0.965 0.018 165`, on-accent `oklch(1 0 0)`.
Product accent (violet): accent-product `0.53 0.16 300`, accent-product-light `0.93 0.04 300`.
Semantic: ember `0.52 0.2 25` / ember-light `0.92 0.05 25`; success `0.49 0.15 155` /
success-light `0.92 0.04 155`; warn `0.52 0.15 85` / warn-light `0.94 0.04 85`.
Borders: soft `0.885 0.009 85`, border `0.9 0.007 85`, border-hover `0.8 0.011 85`.
Sidebar ramp: sidebar `0.18 0.025 260`, sidebar-top `0.22 0.03 260`, sidebar-hover `0.3 0.02 260`,
sidebar-active `0.36 0.06 165`, sidebar-border `0.28 0.02 260`.
Charts 1-6: `0.52 0.16 300`, `0.55 0.14 245`, `0.55 0.1 205`, `0.58 0.13 70`, `0.58 0.16 10`,
`0.55 0.1 130`.
Type: `--font-sans` Geist Sans, `--font-mono` JetBrains Mono Variable; tracking-tight -0.02em,
tracking-wider 0.1em.
Shadows: sm/md/lg/panel/glow (glow = `0 0 0 3px accent/0.15`). Ease `cubic-bezier(0.4,0,0.2,1)`.
`:root` extras: durations 150/200/300ms, press-scale 0.98, sidebar-width-wide 16rem,
content-max 72rem, panel-padding 1.75rem, panel-inset-padding 1.25rem, stack-gap 2rem,
aliases text-heading/body/secondary/link/link-hover/on-accent, focus-ring.
Dark scope re-points all of the above (canvas 0.165, surface 0.205, raised 0.225, accent 0.68 0.12 165,
on-accent 0.16 0.01 165, ink-faint 0.61 - measured, not the system's 0.58).
Utilities: `panel` (surface, 1px border, radius-xl, p-4, shadow-panel), `panel-inset` (canvas,
radius-lg, p-3), `panel-raised` (raised, radius-xl, shadow-lg), `divider` (1px gradient hairline).
Base layer: global `box-sizing: border-box` (load-bearing), `:focus-visible` 2px accent outline
offset 2px, `button:active` scale(0.98), 150ms transitions on a/button/input/select/textarea,
mono for code/kbd/pre/samp, custom `details > summary` triangle marker.
Keyframes: fade-in-up (8px/300ms), scale-in (0.96), slide-down (4px), slide-in-right (1rem),
shimmer, pulse-soft. `prefers-reduced-motion` collapses all.

## App shell (routes/+layout.svelte)

Fixed 16rem (w-64) sidebar, `linear-gradient(180deg, sidebar-top, sidebar)`, white text,
right border `sidebar-border`. Brand row p-6: `/m7kni-mark.svg` 36px rounded-lg + "Paperless NGX
Dedupe" (text-lg font-bold). Comment in source: never CSS-filter the mark.
Nav (px-3, gap-1, rounded-lg px-3 py-2 text-sm font-medium): Dashboard (LayoutDashboard, `/`),
Documents (FileText), Duplicates (Copy), AI Processing (Brain, only when `data.aiEnabled`),
Jobs (History), Settings (Settings). Active = `bg-sidebar-active text-white`, else
`text-white/70 hover:bg-sidebar-hover`. Dashboard matches exactly; others own their subtree.
Footer: ThemeToggle (3-way radiogroup Sun/Moon/Monitor, bordered, in the rail's own ramp)
+ `text-xs text-white/40` "Paperless NGX Dedupe".
Main: `bg-canvas min-h-screen flex-1 p-4 sm:p-6 md:ml-64 md:p-8`. Mobile: sidebar translates
off-canvas, `bg-black/40` backdrop, hamburger (Menu) top-left of main, closes on navigation.
Also mounted: `ActivityPanel` (floating job panel) and `ActivityLiveRegion` (aria live).

## Pages (13) and their content

### `/` dashboard (routes/+page.svelte)
h1 "Dashboard" + "Start with readiness, then move through the work that needs you."
Sections in order:
1. panel "First-run checklist" - "Work through these in order. Nothing here changes Paperless
   without your review." 3 panel-inset cells: "1. Connect to Paperless" / "Confirm the connection
   in Settings."; "2. Sync your library" / "Copy document metadata into the local review
   database."; "3. Run duplicate analysis" / "Review matches before any Paperless change."
   NOTE: never dismisses - the pain point the user asked to fix.
2. `ReadinessStrip` (readiness + automation; icons CheckCircle2, CircleAlert, Database, Server)
3. `NextActions` (icons ArrowRight, Play, RefreshCw) - Sync / Analysis buttons, disabled while
   a job of that type is active.
4. action error alert (CircleAlert) "The sync could not be started. Please try again." /
   "Duplicate analysis could not be started. Please try again."
5. panel "Current activity" (Activity icon) - "Live updates continue if you navigate elsewhere."
   Per job: label (type with underscores replaced, title-cased), message or "Waiting for an
   update", status text (or "Updates delayed" when `connection === 'degraded'`), 2px progress
   track `bg-canvas-deep` + `bg-accent` fill. Empty: "Nothing is running right now."
6. `OutcomeSummary` (AlertCircle, Brain, CheckCircle, Clock, FileStack, Zap)
7. `CompactTrends` - topCorrespondents + duplicate confidence distribution (ECharts)

### `/documents` (routes/documents/+page.svelte)
Two modes: `?library=true` (the list page) and statistics-only.
Library mode: PageHeader "Document Library" / "Find synced documents and move directly into the
relevant review workflow." action "View statistics only". Then `DocumentLibraryFilters`,
`DocumentQualitySummary`, `DocumentLibraryTable`.
Stats mode: PageHeader "Documents" / "Library statistics and document overview." action
"Browse document library".
Table (`DocumentLibraryTable`): h2 "Documents" / "Newest Paperless additions appear first.",
"Documents per page" select 25/50/100. Columns: Document (title links to
`{paperlessUrl}/documents/{id}/details` + ExternalLink, second line "Paperless #1234"),
Classification (correspondent / "No correspondent"; documentType / "No document type"; tags
joined), OCR ("Present" text-success / "Missing" text-ember), Duplicate review
("N group(s)" link + status), AI review (aiStatus link or "Unprocessed" + freshness
fresh/stale), Added (locale date). Zebra rows bg-surface/bg-canvas, min-w-760px, overflow-x-auto.
Empty: "No documents match these filters." / "Clear or broaden the filters to see more documents."
Pagination: cursor based, "Previous page" (session-stored predecessor) / "Next page";
"Previous page unavailable for this direct link."
Stat cards: Total Documents (FileStack), OCR Coverage (% + ProgressBar "X of Y documents"),
Processing (Clock, "completed / total", "N pending"), Avg Word Count (Type),
Duplicate Involvement (Copy, %, "X of Y documents").
Section dividers: uppercase tracking-wider labels "Overview", "Analytics", "Data Quality" + hairline.
Charts: Documents Over Time (line+area, smooth), Word Count Distribution (bar), Top
Correspondents (horizontal bar), Document Types (donut 40/70%), Tag Frequency (treemap, gap
colour = surface token). Data Quality: 3 figures No Correspondent / No Document Type / No Tags.
Deduplication Activity: Groups Actioned, Documents Deleted (cumulative).
Footer panels: "AI Classification" / "Select documents to classify with AI metadata extraction."
-> "Go to AI Processing"; "Manage Documents" / "Open Paperless-NGX to manage individual
documents." -> "Open Paperless-NGX".

### `/duplicates` list (routes/duplicates/+page.svelte)
h1 "Duplicate Groups" + total count pill. Actions: "Similarity Graph" (Network),
"Export CSV" (Download), "Bulk Operations Wizard" (Wand2, the one primary),
"Purge N Deleted" (Trash2, only when deletedGroupCount > 0).
Standing note: "Review likely matches before acting. Paperless-NGX deletions go to its recycle
bin and are not permanently removed by this workflow."
`DuplicateInboxFilters` (queue pending/..., sort ArrowUp/ArrowDown, pagination mode).
Bulk bar (appears at top, sticky, accent-light) : "N selected", "Not Duplicates"
(-> status false_positive), "Keep All" (-> ignored), "Delete Non-Primary" (destructive),
"Clear selection", plus live delete progress message.
`BulkDeletePreview` dialog before deletion. Purge ConfirmDialog: title "Purge Deleted Groups",
message "This permanently removes N deleted group records from this app. Paperless-NGX documents
are not affected.", confirm "Purge", variant ember.
Post-delete dialog: "Delete complete" + `RecycleBinPrompt`.

### `/duplicates/[id]` group detail - THE SIGNATURE SCREEN
Back link "Back to Duplicates" / "Back to Documents" (ArrowLeft).
Header: h1 = primary title, `ConfidenceBadge` (percent), `StatusBadge`.
Sub-line: "Algorithm v{n} · Created {date} · {id.slice(0,8)}…" (id in mono).
`GroupActionBar` (icons XCircle, CheckCircle, Trash2, RotateCcw).
Divider "Confidence" -> `ConfidenceBreakdown` panel: h3 "Confidence Breakdown" + badge, ECharts
horizontal bars for "Jaccard (Shingles) (w%)", "Fuzzy Text (w%)", "Discriminative (Penalty n%)",
bar colour by band, `N/A` when null.
Divider "Members" -> panel "Members" + count pill; table columns Title, Correspondent, Role
(Primary pill or -), Actions ("Set as Primary" secondary sm + ExternalLink to Paperless).
Divider "Comparison" -> h3 "Document Comparison"; secondary switcher (<=4 buttons, else select).
`MatchExplanation`: h3 "Why these matched" / "Structured details found in both documents. These
support the match but should still be reviewed." shared categories as mono chips; fallback
"No shared structured details were extracted. Review the scoring details and key differences
before deciding."; h3 "Key differences" / "Check these values before choosing which document to
keep." two columns primary vs comparison, mono chips, "Not found".
Per-document actions row: "Actions for <title>:" + "Remove from Group" (UserMinus) +
"Delete from Paperless" (destructive, Trash2).
`DocumentCompare` (side-by-side metadata, ExternalLink), `TextDiff` (OCR diff),
h3 "Visual Comparison" + `DocumentVisualCompare` (ChevronLeft/Right thumbnails).
ConfirmDialogs: "Remove from Group" / "This will remove the document from this duplicate group.
The document will remain in Paperless-NGX." confirm "Remove"; "Delete from Paperless" / "This
will delete the document from Paperless-NGX (moved to recycle bin) and remove it from this group.
This can be undone from the Paperless-NGX recycle bin." confirm "Delete Document", variant ember.
Deleted groups show an Archive divider + "This group was resolved on {date}. N documents were
originally in this group. Member details are no longer available."

### `/duplicates/graph`
h1 "Similarity Graph" + "Back to List". Info bar: "Showing X of Y groups (N documents,
M connections)". Filter panel: Min Confidence (number 0-100), Max Groups (25/50/100/200/500),
Status (All/Pending/False Positive/Ignored/Deleted).
ECharts force graph, 560px, roam+draggable, repulsion 200, edgeLength 80-250, gravity 0.1,
emphasis focus adjacency. Node size `max(16, min(40, 12 + groupCount*8))`, node colour cycles
the 6-series palette by correspondent, edge width `max(1, confidence*5)`, edge colour by status:
pending = accent-product, false_positive = muted, ignored = accent, deleted = success.
Legend overlay bottom-left: "Edge Colors" (4 swatches), "Node Size" = "Larger = appears in more
groups", "Node Color" = "Grouped by correspondent", "Edge Width" = "Thicker = higher confidence".
Detail panel w-80: Document Details (Title, Paperless ID, Correspondent, Document Type, Appears
in Groups) or Connection Details (Confidence 1dp %, Documents A ↔ B, Status) + "View Group",
"Close panel". Empty: "No data to display. Try adjusting filters or run analysis first."

### `/duplicates/wizard`
6 steps, `stepLabels = ['Filter','Review','Action','Confirm','Execute','Results']`, numbered
step indicator with completed/current states. Step 1 filter (min confidence etc + match count),
step 2 review groups (list/grid toggle List/LayoutGrid, `WizardGroupCard`, Eye preview,
ThumbnailPreview, sort ArrowUp/ArrowDown), step 3 select action, step 4 confirm, step 5 execute
(ProgressBar), step 6 results (CheckCircle/XCircle, RecycleBinPrompt).

### `/jobs`
h1 "Job History" / "View and manage the history of all background jobs." max-w-4xl.
Filter panel: Type (All Types, Sync, Analysis, Batch Delete, AI Processing, AI Apply, AI Revert,
Custom Field Discovery), Status (All Statuses, Pending, Running, Paused, Completed, Failed,
Cancelled), Jobs per page (10/25/50/100), "Clear History" (Trash2, ember tint, disabled when
`counts.clearable === 0`; confirm text "Clear all completed, failed, and cancelled jobs from
history?"). Feedback "Cleared N jobs".
`JobStatusCard` per job: type label + StatusBadge, ProgressBar when running/paused, error line
when failed, result summary lines - sync "N added, N updated, N failed" / "No changes";
analysis "N new docs analyzed", "N skipped" (tooltip: skip reasons No text content / Too few
words (<20) / Processing failed), "(of N total)", "N groups created/updated/removed",
"No duplicates found"; batch_operation "N documents deleted, N groups resolved, N errors";
ai_processing "N processed/succeeded/failed/auto-applied"; ai_apply "N of M applied";
custom_field_discovery "N candidates from M documents". Duration mono right-aligned (`1m 12s`).
Relative created date beneath ("just now", "4m ago", "3h ago", "2d ago", else locale date).
Empty: "No jobs found." / "No jobs found matching filters."

### `/ai-processing` (+layout.svelte, tabs) and sub-pages
Header: Brain in accent tile + h1 "AI Processing" / "Extract and apply document metadata using
AI." Primary "Process New" / "Resume" (Play, Loader2 while running) + scope dropdown
(ChevronDown): "Process New", "Retry Failed" (RefreshCw, when failed > 0), "Process Selected..."
(FileText), separator, "Re-run Entire Library" (AlertCircle, ember).
Stat tiles (6, 7 with skipped), each a link: Processed (FileText, accent-subtle) -> history;
Pending (CircleDot, warn) -> review; Applied (CircleCheck, success); Rejected (CircleX, neutral);
Reverted (Undo2, accent); Failed (TriangleAlert, ember); Skipped (AlertCircle, warn) -> queue.
Progress panel while running: Loader2 + "Processing documents..." + "Pause" (Pause icon) +
ProgressBar. Error banner "Processing failed" + message + dismiss (X). Resume hint (Info):
"Processing paused" / "N documents remaining. Click "Resume" to continue from where you left off."
Tabs with counts: Queue (accent), Review (warn), History (neutral), Custom Fields.
ConfirmDialog "Re-run Entire Library?" / "This will re-process all documents in your library.
Existing AI results will be overwritten. This may take a significant amount of time and API
usage." confirm "Re-run All", ember.
Review row (`AiResultRow`): checkbox, thumbnail 32px (fallback FileText tile), document title,
Title / Correspondent / Document Type columns showing `current` struck through above `suggested`,
Tags as accent pills + "+N custom" success pill, confidence column with 4 labelled
ConfidenceBadges (TITLE / CORR / TYPE / TAGS), status pill (Pending Review / Applied / Partial /
Rejected / Failed), row actions Check (apply, success) and X (reject). Active row gets a 2px
accent left border and accent-subtle tint. Failure pills: "No OCR Text", "No Suggestions",
"Failed" (AlertCircle).
Field diff card (`AiFieldDiffCard`): checkbox + field label + ConfidenceBadge or "Disabled"
(Ban); value diff `old → new` (old struck, new accent); tag diff (kept accent, removed struck
50%, added accent + success ring); warnings row "Low confidence" (TriangleAlert, warn),
"Will create new" (Plus, accent), "Will clear existing" (Minus, ember), "No change" (Equal,
muted).
Queue page icons: FileText, AlertCircle, RefreshCw, ChevronLeft/Right, CheckSquare, Square,
Play, Inbox, CircleX, DollarSign, BarChart3. History page: Search, ChevronLeft/Right,
CircleCheck, CircleX, Undo2, AlertCircle, ExternalLink, Loader2, RefreshCw, History.
Custom fields page: AlertTriangle, Database, Loader2, Sparkles.

### `/settings`
h1 + "Configure Paperless-NGX connection and deduplication parameters."
Section switcher: Connection, Deduplication, AI, Automation, System.
Connection: h2 "Paperless-NGX Connection" (Link icon) / "Connection settings are managed by
environment variables." URL field (read-only), "Authentication: ..." line, "Test Connection"
button, success/error status.
Deduplication (SlidersHorizontal): threshold, weight jaccard %, weight fuzzy %, penalty
strength, advanced numeric fields num-perms, num-bands, ngram-size, min-words, fuzzy-sample,
each with an Info tooltip. Save -> "Configuration saved" / "Save failed".
AI (Brain): Model select, metadata field toggles, reference data toggles, ai-max-content,
ai-batch, ai-delay, ai-retries, confidence thresholds - global plus per-field Title /
Correspondent / Document Type / Tags. Prompt + tag alias YAML with revert. Save ->
"AI configuration saved".
Automation (CalendarClock, Play): schedule + run now. System: Maintenance report (Archive),
Database backup (DatabaseBackup, Download), Diagnostics (Download), AlertTriangle for warnings,
Check for confirmations.

## Internal primitive library (`lib/components/ui`, 25 files)

Badge (tones neutral/accent/success/warn/ember/product; deliberately no solid variant; pill,
rounded-full, px-2 py-0.5 text-xs), Button (variants primary/secondary/ghost/destructive/outline,
sizes sm/md/lg -> rounded-lg/rounded-xl, icon 14/16/18, loading Spinner, press scale, no
semantic-tint variant by design), Checkbox (Check/Minus icons), ConfidenceBadge (3 bands:
>=0.9 success, >=0.75 warn, else ember; ring-1 ring-success/30 on high; percent or 2dp),
ConfirmDialog (AlertTriangle, variants accent/ember), EChart (registers the token theme,
re-inits on theme change), EmptyState (FileText default icon), ErrorState (CircleAlert),
InfoIcon, JobStatusCard, PageHeader (icon in accent tile, h1 text-2xl font-bold, description),
ProgressBar (h-3 rounded-full track bg-soft, fill accent / success at 100% / warn when paused,
indeterminate shimmer when 0 and animated, mono % right, ETA "~2m 14s remaining"), RichTooltip,
SearchInput (Search + X), Select (ChevronDown), Skeleton, Spinner, StaleAnalysisBanner
(AlertTriangle), StatCard (accent tile icon or 2px accent bar, label / 2xl value / trend
arrow ↑↓→), StatusBadge (pending warn, running accent, completed success, failed ember, paused
product violet, cancelled/false_positive neutral, ignored accent, deleted success), Tabs,
TextField, ThemeToggle, Toggle, Tooltip.

## Complete lucide icon inventory (for the Phosphor map)

Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban,
BarChart3, Brain, CalendarClock, CalendarClock, Check, CheckCircle, CheckCircle2, CheckSquare,
ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, CircleCheck, CircleDot, CircleX,
Clock, Copy, Database, DatabaseBackup, DollarSign, Download, Equal, ExternalLink, Eye, FileStack,
FileText, FolderOpen, History, Inbox, Info, LayoutDashboard, LayoutGrid, Link, List, Loader2,
Menu, Minus, Monitor, Moon, Network, Pause, Play, Plus, RefreshCw, RotateCcw, Search, Server,
Settings, Shuffle, SlidersHorizontal, Sparkles, Square, Sun, Trash2, TriangleAlert, Type, Undo2,
UserMinus, Wand2, X, XCircle, Zap

## Chart usage inventory (ECharts, must move to a token-derived palette)

- dashboard `CompactTrends`: top correspondents, confidence distribution
- documents: line+area over time, bar word count, horizontal bar correspondents, donut document
  types, treemap tag frequency
- group detail `ConfidenceBreakdown`: horizontal bars coloured by confidence band (semantic, not
  categorical)
- graph view: force graph, node colour = correspondent (cycles the 6 series), edge colour =
  status (semantic)
- wizard step 1: distribution bar
`lib/theme/tokens.ts` resolves tokens to strings for the canvas and holds SSR fallbacks; the
ECharts theme object maps textStyle/title/legend/tooltip/categoryAxis/valueAxis to tokens.
