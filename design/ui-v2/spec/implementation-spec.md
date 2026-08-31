# paperless-ngx-dedupe on m7kni Design System v2

Implementation spec. Everything an implementation agent needs to apply the v2 visual layer to
`packages/web/` without seeing the conversation that produced it.

Source of truth for the design system: `_ds/m7kni-design-system-v2-.../tokens/tokens.css`,
`FOUNDATIONS.md`, `guidelines/voice.md`, `guidelines/patterns/*`. Source of truth for the app:
`rknightion/paperless-ngx-dedupe@main`, read at commit tree `2fa76e7ee114`, notes in
`spec/source-notes.md`.

The stack does not change. SvelteKit 5 + Tailwind v4 stay; `@m7kni/ui` is React and does not apply.
This is a token, font, icon and pattern migration onto the existing internal Svelte component
library. Gate: `just check`.

**One writing rule that applies to every string in the app: never an em dash or an en dash. A
spaced hyphen is the only dash.** This includes strings in code comments, empty states, toasts,
error messages and docs.

---

## 1. What is in the export

| File | What it is |
| --- | --- |
| `Index.dc.html` | Contact sheet, links to every board |
| `01 App shell.dc.html` | Shell and navigation, light and dark, plus the narrow shell with the drawer open |
| `02 Dashboard.dc.html` | Dashboard, light and dark |
| `03 Documents list.dc.html` | List-page archetype, selection and bulk bar, empty result, narrow |
| `04 Duplicate group detail.dc.html` | The signature screen, light and dark, narrow |
| `05 Duplicates graph.dc.html` | Graph view restyled onto tokens |
| `06 Wizard.dc.html` | Stepped flow: confirm step, then execute and results |
| `07 Jobs.dc.html` | Job table with meters and mono timestamps |
| `08 Settings and forms.dc.html` | Form archetype with validation and unsaved changes, plus the confirm-destructive dialog |
| `09 AI review queue.dc.html` | Human-in-the-loop review |
| `10 System states.dc.html` | Skeleton, refresh, action states, empty, error, toasts |
| `spec/app.css` | The replacement token block, ready to paste |
| `spec/implementation-spec.md` | This file |
| `spec/source-notes.md` | What was read out of the repo, with the v1 values it replaces |
| `assets/regular/*.svg` | The Phosphor icons used, copied from `phosphor-icons/core@main` |
| `icons.js` | Sprite loader used by the boards only. Not for the app: the app uses `phosphor-svelte`. |

Each board file renders the same screen twice, once inside a `[data-theme="dark"]` wrapper. The
tokens re-point; no component in the board knows which theme it is in. That is the behaviour the
app should keep.

---

## 2. Token replacement

`spec/app.css` is the whole file. Paste it over the token layer of
`packages/web/src/app.css`. Notes on the swap:

- **Names are preserved wherever the meaning survives.** `--color-canvas`, `--color-surface`,
  `--color-ink*`, `--color-accent*`, `--color-ember`, `--color-success`, `--color-warn`,
  `--color-border`, `--color-chart-1..6` all keep their names, so most call sites compile
  untouched.
- **Hue moves from two families to one.** v1 had warm paper (hue 85) and cool ink (hue 260). v2
  puts every neutral on the accent hue, 227, at low chroma. Search for hardcoded `85` and `260`
  hues in inline styles; there are several in `EChart.svelte` fallbacks and
  `lib/theme/tokens.ts`.
- **New tokens** the app does not have yet and needs: `--color-selected` (selected table row),
  `--color-track`, `--color-inverse` and `--color-on-inverse` (bulk action bar),
  `--color-disabled` (placeholder and disabled only, never readable copy), `--furniture`
  (ink-derived in-cell furniture), `--radius-overlay`, `--row-table`, `--tracking-label`, the
  `--space-*` scale, and `--color-sidebar-ink*`.
- **Radius collapses.** `--radius-lg` and `--radius-xl` become `0px`, `--radius-sm`/`md` become
  `3px`. Every `rounded-lg` and `rounded-xl` in the app therefore becomes square without being
  touched; only `rounded-full` needs auditing, and it should survive on dots and nothing else.
  The pills in `Badge.svelte`, `StatusBadge.svelte` and `ConfidenceBadge.svelte` are replaced
  outright (section 6), so their `rounded-full` goes with them.
- **Shadows go to `none`** except overlays. `--shadow-panel` and `--shadow-sm` resolve to `none`
  so the existing `panel` utility flattens with no edits at the call sites.
- **`--press-scale` becomes 1** and the `button:active { transform: scale() }` rule is removed:
  v2 bans scale on press.
- **`--shadow-glow` becomes `none`.** Focus is a 2px accent outline at 2px offset,
  `:focus-visible` only.

### Non-mechanical dark deltas

Everything below needs a decision, not a value substitution.

1. **The accent takes dark ink text on dark.** `--color-on-accent` is `#0e161b` in the dark
   scope. Measured: `#0e161b` on `#66aecb` is 7.38:1; white on `#66aecb` is 2.4:1 and fails. Any
   place that writes `text-white` on an accent fill must become `text-on-accent`. Same rule for
   semantic fills: white on the dark ember `#d97b64` measures 3.01:1 and fails, while `#0e161b`
   on it measures 6.06:1. **The destructive button in dark mode takes dark text.** This was the
   one real contrast bug found while building the boards.
2. **The sidebar loses its own ramp.** v1 kept a near-black rail in both themes with a gradient
   and white text. v2 makes the rail a surface with a hairline and the active item an accent
   inset edge, so it inverts with everything else. The `--color-sidebar*` tokens still exist and
   now point at surface tokens; the white-text classes in `+layout.svelte` and
   `ThemeToggle.svelte` must be replaced with `text-sidebar-ink` / `text-sidebar-ink-active`.
3. **Semantic tints are dark, not light.** `--color-*-light` in the dark scope are near-black
   tints (`#3a241f`, `#1f2f26`, `#332a17`), so a tinted region reads as a slightly warmer or
   cooler dark, not as a pastel. Contrast measured on the dark surface: success `#5fae7f` 6.38:1,
   warn `#c9a04a` 7.00:1, ember `#d97b64` 5.66:1.
4. **In-cell furniture must be derived, not fixed.** A meter track set to a fixed grey disappears
   on a hovered or selected row in one theme or the other. Use
   `color-mix(in oklab, var(--color-ink) 14%, var(--color-surface))` and, inside a selected row,
   mix against `--color-selected` instead. Every meter in the boards does this.
5. **Zero renders as nothing.** A meter at 0 shows a dim `0` in `--color-muted` with no track at
   all. `ProgressBar.svelte`'s indeterminate shimmer is the exception, and it only appears when
   there is genuinely no fraction to show.
6. **ECharts bakes theme values at `init()`.** The existing dispose-and-reinitialise on theme
   change stays; the palette it reads changes (section 5).

---

## 3. Type roles

Hanken Grotesk 400 / 500 / 600 / 700 for UI. JetBrains Mono 400 / 500 / 600 for machine text.
No other families, no other weights. Scale: 10 / 11 / 12.5 / 13.5 / 15 / 18 / 24.

| Role | Size | Weight | Family | Used for |
| --- | --- | --- | --- | --- |
| Page title | 18px | 600 | sans | The one `h1` in the top bar |
| Section heading | 15px | 600 | sans | Panel headings, two or three words |
| Body | 13.5px | 400 | sans | Everything unmarked |
| Body emphasis | 13.5px | 500 | sans | Document titles, job names, row identifiers |
| Secondary | 12.5px | 400 | sans | Helper text, descriptions, inline detail |
| Stat figure | 24px | 600 | sans, tabular | Stat strip values, dialog counts |
| Machine text | 12.5px | 400 | mono, tabular | Paperless ids, filenames, checksums, durations, percentages |
| Machine text small | 11.5px | 400 | mono, tabular | Relative times, log lines, freshness |
| Status word | 11.5px | 600 | mono, 0.04em | `■ OK`, `◆ WARN`, `● FAIL`, job and confidence bands |
| Micro-label | 10px | 500 | mono, 0.13em, uppercase | Column headers, stat labels, section kickers |

Rules that matter more than the table:

- **Mono means machine.** A document title is sans even though it comes from a file; a filename,
  an id, a hash, a count, a timestamp and a percentage are mono.
- **`tabular-nums` wherever digits are compared** down a column or across a strip.
- **Sentence case everywhere.** Product nouns keep their own capitalisation: Paperless, Paperless
  NGX, Paperless-NGX in prose that quotes the project name, OCR, MinHash, LSH, Jaccard.
- Column headers are the one uppercase context, and they are mono micro-labels.
- 24px is the largest type in the product. There is no display size.

---

## 4. Spacing, density and layout

4px base. Steps 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64. Never an intermediate step.

| Thing | Value |
| --- | --- |
| Sidebar width | 200px, fixed |
| Top bar | 10px vertical padding, 24px horizontal, one row, 1px bottom hairline |
| Page gutter | 24px |
| Stat strip cell | 12px 24px, cells divided by 1px rules, 4 cells maximum |
| Filter row | 8px 24px |
| Table row | 36px, 12px horizontal cell padding, 24px on the first and last cell |
| Table header | 6px vertical, sticky, 1px `--color-border-hover` bottom rule |
| Section gap | 24px |
| Panel padding | 16px, 12px 16px for header rows |
| Control height | 28px desktop, 32px narrow, 26px for segmented and inline controls |
| Bulk action bar | 10px 24px, pinned to the bottom edge of the content region |
| Detail panel | 300-380px, 16px padding, 1px left hairline |

Layout rules from `FOUNDATIONS.md` that the app must now follow:

- The shell never scrolls. The sidebar, top bar, stat strip and filter row are fixed; the table
  or content region is the only scrolling element, with a sticky header.
- Rules and hairlines over cards. One container level fewer than feels natural. The stat strip is
  divided cells, not card tiles: delete `StatCard.svelte`'s use on the dashboard and documents
  pages in favour of a strip.
- The bulk action bar is pinned to the bottom edge, not sticky at the top. `duplicates/+page.svelte`
  currently sticks it to the top; move it.
- Narrow: below 768px the rail leaves the flow and returns as a drawer over a scrim. Controls go
  to 32px so that with padding every target clears 44px. Tables become row lists rather than
  horizontal scrollers.

---

## 5. Chart palette

The design system defines no categorical palette, so one is derived. Precedent: derive from the
accent by OKLCH hue rotation.

**Derivation.** Take the accent hue as the anchor (Petrol `#1d6a8a` sits at hue 233 in OKLCH once
converted; the neutral ramp uses 227). Rotate by 48 degrees per step for six evenly spaced hues:
233, 281, 329, 17, 65, 161. Then, instead of holding lightness constant, walk it monotonically so
the series also separate in greyscale - an isoluminant set looks even but collapses in a black and
white print or for a viewer with severe colour deficiency. Chroma is nudged per hue so no series
reads as noticeably more saturated than its neighbours.

### Light series

| Series | OKLCH | Hex | vs surface | vs canvas |
| --- | --- | --- | --- | --- |
| 1 | `oklch(0.44 0.095 233)` | `#005a7e` | 7.23:1 | 6.80:1 |
| 2 | `oklch(0.48 0.115 281)` | `#53549c` | 6.41:1 | 6.03:1 |
| 3 | `oklch(0.52 0.105 329)` | `#8a5186` | 5.55:1 | 5.22:1 |
| 4 | `oklch(0.56 0.115 17)` | `#ad555c` | 4.72:1 | 4.44:1 |
| 5 | `oklch(0.57 0.1 65)` | `#a06a31` | 4.34:1 | 4.08:1 |
| 6 | `oklch(0.6 0.095 161)` | `#45926e` | 3.58:1 | 3.36:1 |

### Dark series

| Series | OKLCH | Hex | vs surface | vs canvas |
| --- | --- | --- | --- | --- |
| 1 | `oklch(0.86 0.075 233)` | `#a0dafb` | 11.31:1 | 12.10:1 |
| 2 | `oklch(0.82 0.09 281)` | `#b9befe` | 9.64:1 | 10.31:1 |
| 3 | `oklch(0.78 0.105 329)` | `#dd9fd9` | 8.15:1 | 8.73:1 |
| 4 | `oklch(0.74 0.11 17)` | `#e88d92` | 7.03:1 | 7.53:1 |
| 5 | `oklch(0.7 0.1 65)` | `#c99159` | 6.24:1 | 6.68:1 |
| 6 | `oklch(0.66 0.09 161)` | `#5ca380` | 5.69:1 | 6.09:1 |

Measured against light surface `oklch(0.982 0.004 227)` and light canvas `oklch(0.962 0.007 227)`;
dark surface `oklch(0.225 0.011 227)` and dark canvas `oklch(0.195 0.01 227)`. Every series clears
3:1 against both backgrounds in both themes, which is the threshold for a non-text graphical
object. The lowest value in the set is light series 6 at 3.36:1 on canvas.

**Greyscale separation between consecutive series** (light): 1.13, 1.16, 1.17, 1.09, 1.21. Dark:
1.17, 1.18, 1.16, 1.13, 1.10. Series 1 against series 6 is 2.35:1 light, 1.99:1 dark.

Those consecutive steps are real but small. The honest conclusion: **the palette is a support, not
the carrier.** Any chart with more than three series must label its series directly rather than
relying on a legend swatch. The dashboard charts in the boards are single-series for exactly this
reason.

### Chart rules

- Single-series charts use series 1. It is petrol, and that is fine: a chart is not an
  interactive control, and the accent-means-interactive rule is about chrome. What is banned is a
  chart series that reads as a *button*.
- Confidence and score bars are **not** categorical. They use the semantic band colour
  (`--color-success` / `--color-warn` / `--color-ember`) and are always accompanied by the shape
  and the word.
- Axis labels and legends: `--color-muted`, mono, 11px. Grid and axis lines: `--color-border`.
- Tooltip: `--color-surface-raised` fill, `--color-border` hairline, 6px radius, `--color-ink-light`
  text, mono.
- `backgroundColor: 'transparent'`; the panel behind the chart provides the surface.
- The treemap gap colour must follow `--color-surface`, as it already does.

### Graph view: status needs a second carrier

The graph encoded connection status in colour alone, using the product violet for pending. With
the violet retired, status now reads as colour **and** line style:

| Status | Colour | Line |
| --- | --- | --- |
| pending | chart series 1 | solid |
| deleted | `--color-success` | solid |
| false positive | `--color-muted` | dashed, `5 3` |
| ignored | `--color-muted` | dotted, `1.5 3` |

Node colour still cycles the six series by correspondent, node size is still group count, line
width is still confidence. The legend now states what each variable means in words rather than
only showing swatches.

---

## 6. Retiring the product violet

**Decision: retire it.** `--color-accent-product` and `--color-accent-product-light` are mapped
onto the accent in `spec/app.css` for one release so no import breaks, then deleted.

Why: v2 fixes exactly one accent and defines semantics as ok / warn / fail. A second brand-level
accent has nowhere to sit in that model - it is neither the interactive colour nor a state - and
the three places it was used all had a better home:

1. `StatusBadge.svelte`, `paused` state. Paused is a state, so it becomes `◆ PAUSED` on
   `--color-warn`: a paused job is something you need to come back to.
2. Graph view, pending edges. Pending is the default state of a connection, so it takes chart
   series 1 with a solid line, and the three non-default states carry the line-style variation.
3. Chart series 1, where the v1 comment said it was violet "so a single-series chart never looks
   like a primary action". Under v2 that concern is handled by the shape of the thing: charts sit
   inside a panel with a mono axis and no interactive affordance.

If a per-product accent is ever wanted again, it belongs in the design system as a named token
with its own AA table, not invented per repo.

---

## 7. Icon map: lucide to Phosphor

Phosphor, regular weight, one set everywhere. 16px in navigation, table cells and buttons; 14px
inside 26-28px controls; 20-22px only for a placeholder glyph. Icons are `currentColor` and never
carry meaning alone.

In the app use `phosphor-svelte` (`import { FileText } from 'phosphor-svelte'`) and drop
`lucide-svelte` from `package.json`. `Button.svelte`, `PageHeader.svelte` and `EmptyState.svelte`
type their icon prop as `typeof LucideIcon`; that becomes Phosphor's component type.

Every icon in the current source, in alphabetical order:

| lucide | Phosphor | Where |
| --- | --- | --- |
| Activity | `Pulse` | dashboard current activity |
| AlertCircle | `WarningCircle` | AI errors, skipped, re-run warning |
| AlertTriangle | `Warning` | ConfirmDialog, StaleAnalysisBanner, custom fields |
| Archive | `Archive` | settings maintenance report |
| ArrowDown | `ArrowDown` | sort descending |
| ArrowLeft | `ArrowLeft` | group detail back link |
| ArrowRight | `ArrowRight` | next action, apply audit |
| ArrowUp | `ArrowUp` | sort ascending |
| Ban | `Prohibit` | field disabled by config |
| BarChart3 | `ChartBar` | queue stats |
| Brain | `Brain` | AI Processing nav and header |
| CalendarClock | `CalendarDots` | automation schedule |
| Check | `Check` | apply, checkbox, settings confirm |
| CheckCircle | `CheckCircle` | keep all, wizard results |
| CheckCircle2 | `CheckCircle` | readiness strip |
| CheckSquare | `CheckSquare` | queue select all |
| ChevronDown | `CaretDown` | select, scope menu, expander |
| ChevronLeft | `CaretLeft` | pagination, visual compare |
| ChevronRight | `CaretRight` | pagination, visual compare |
| ChevronUp | `CaretUp` | expander |
| CircleAlert | `WarningCircle` | ErrorState, dashboard action error |
| CircleCheck | `CheckCircle` | AI applied, toasts |
| CircleDot | `RadioButton` | AI pending review |
| CircleX | `XCircle` | AI rejected, toasts |
| Clock | `Clock` | documents processing stat |
| Copy | `Copy` | Duplicates nav, duplicate involvement |
| Database | `Database` | readiness strip, custom fields |
| DatabaseBackup | `FloppyDisk` | settings database backup |
| DollarSign | `CurrencyDollar` | AI cost |
| Download | `DownloadSimple` | export CSV, diagnostics |
| Equal | `Equals` | field diff, no change |
| ExternalLink | `ArrowSquareOut` | open in Paperless |
| Eye | `Eye` | wizard group preview |
| FileStack | `Files` | total documents |
| FileText | `FileText` | Documents nav, document glyphs, empty state |
| FolderOpen | `FolderOpen` | grouped AI results |
| History | `ClockCounterClockwise` | Jobs nav, AI history |
| Inbox | `Tray` | queue empty |
| Info | `Info` | tooltips, resume hint |
| LayoutDashboard | `SquaresFour` | Dashboard nav |
| LayoutGrid | `GridFour` | wizard grid view |
| Link | `Link` | settings connection |
| List | `List` | wizard list view, narrow drawer toggle |
| Loader2 | `CircleNotch` | spinners, with a 1s linear rotation |
| Menu | `List` | narrow disclosure |
| Minus | `Minus` | field will clear, indeterminate checkbox |
| Monitor | `Desktop` | theme: system |
| Moon | `Moon` | theme: dark |
| Network | `Graph` | similarity graph |
| Pause | `Pause` | pause a job |
| Play | `Play` | run analysis, process new, resume |
| Plus | `Plus` | field will create |
| RefreshCw | `ArrowsClockwise` | sync, retry, reprocess |
| RotateCcw | `ArrowCounterClockwise` | reset group status |
| Search | `MagnifyingGlass` | search inputs |
| Server | `HardDrives` | readiness strip |
| Settings | `GearSix` | Settings nav |
| Shuffle | `Shuffle` | queue random sample |
| SlidersHorizontal | `SlidersHorizontal` | settings deduplication, AI filters |
| Sparkles | `Sparkle` | AI result list, custom field discovery |
| Square | `Square` | queue deselect all |
| Sun | `Sun` | theme: light |
| Trash2 | `Trash` | delete, purge, clear history |
| TriangleAlert | `Warning` | low confidence, AI failed |
| Type | `TextAa` | average word count |
| Undo2 | `ArrowUUpLeft` | AI reverted |
| UserMinus | `UserMinus` | remove from group |
| Wand2 | `MagicWand` | bulk operations wizard |
| X | `X` | close, dismiss, reject |
| XCircle | `XCircle` | not duplicates, wizard failures |
| Zap | `Lightning` | AI outcome summary |

Two lucide names collapse onto one Phosphor icon in three places (`CircleAlert` and `AlertCircle`
both to `WarningCircle`; `CheckCircle` and `CheckCircle2` to `CheckCircle`; `XCircle` and
`CircleX` to `XCircle`). That is a deduplication, not a loss: the pairs were already used
interchangeably.

Status shapes are **not** icons. `■ ◆ ●` and `◇ ▸ ○` are mono glyphs in the text run, so they
inherit the type and copy cleanly. Do not swap them for Phosphor shapes.

---

## 8. Per-primitive restyle notes

`packages/web/src/lib/components/ui/` and the composites that carry the app's identity.

### Badge.svelte
Was: `rounded-full` tinted pill, six tones. Becomes: **delete the pill entirely.** v2 has no
tinted-pill vocabulary; state is a mono status word and metadata is plain mono text. Where Badge
carried a count, use mono tabular text; where it carried a state, use the status word. Keep the
component only if a hard container is genuinely needed, and then: square 3px corners, 1px
hairline, no fill, `--color-ink-light` text, 11px mono, 2px 6px padding.

### Button.svelte
Keep the variant and size API. Changes: radius 3px at every size (`SIZES` currently maps to
`rounded-lg` / `rounded-xl`); heights 28px `md`, 26px `sm`, 32px for narrow layouts; text 12.5px
500; `--shadow-sm` resolves to none so the shadow classes can stay; remove the press scale;
`destructive` uses `bg-ember text-on-accent` and the dark scope makes that text dark, which is the
fix for the one contrast failure found. Icon sizes become 13 / 14 / 16. Keep the rule that there
is no semantic-tint variant.

### Checkbox.svelte
14px box, 3px radius, 1px `--color-border-hover` border, `--color-accent` fill when checked with
`--color-on-accent` check. `Check` and `Minus` become Phosphor. In narrow layouts the box is 16px
inside a 44px target. Selected rows also carry a 2px accent inset edge, so the checkbox is not the
only signal.

### ConfidenceBadge.svelte
**The one component that changes behaviour, not just style.** Was: a tinted pill carrying a
percentage, three bands separated by colour alone. Becomes a status word plus the literal number:

| Band | Range | Render | Colour |
| --- | --- | --- | --- |
| high | `>= 0.90` | `■ HIGH 97.4%` | `--color-success` |
| medium | `0.75 - 0.90` | `◆ MEDIUM 82.0%` | `--color-warn` |
| low | `< 0.75` | `● LOW 68.5%` | `--color-ember` |

Mono, 11.5px, 600, 0.04em tracking, `white-space: nowrap`, no fill, no border. Keep the existing
band thresholds and the `percent` / `decimal` format prop. In a tight cell the word may be dropped
and the shape kept (`■ 97.4%`); the shape may never be dropped. Drop the `ring-1 ring-success/30`
on the high band: the word carries it now. The band legend
(`■ HIGH >= 90 · ◆ MEDIUM 75-90 · ● LOW < 75`) appears once per screen, next to the headline
score, not on every row.

### ConfirmDialog.svelte
6px radius, `--color-surface-raised` fill, `--shadow-lg`, scrim `oklch(0.2 0.01 227 / 0.55)`,
max width 560px. Title is a question naming the target with its count in mono. Description is two
paragraphs: what happens, then what will *not* happen. Footer: Cancel on the left of the
destructive button, focus opens on Cancel, only the destructive button carries colour. Drop the
`AlertTriangle` glyph - the words carry it. Add a `requireTyped` prop: when set, a mono input must
match the literal count before the destructive button enables, and the button stays disabled with
a helper line saying why. Use it for document deletion and for "delete all analysis data"; do not
use it for reversible actions like marking a group not-duplicate.

### EChart.svelte
No structural change. Re-point the theme (section 5) and keep the dispose-and-reinitialise on
theme change. Set `renderer: 'svg'` so text in charts renders with the real font.

### EmptyState.svelte
Delete the default `FileText` glyph. One or two sentences in `--color-muted`, centred in the
region the content would occupy, saying what happened then what to do next, with at most one
outline button beneath. No illustration, no headline, no emoji.

### ErrorState.svelte
Inline in the region that failed. `● FAIL` status word, then a bold line naming what failed, then
a plain-language sentence with the fix, then the mono request detail
(`GET /api/v1/duplicates · 504 · 14:22:41`), then `Try again`. 1px `--color-ember` border on a
7% ember tint. Never raw API text as the message.

### InfoIcon.svelte / Tooltip.svelte / RichTooltip.svelte
`Info` becomes Phosphor at 13px. Tooltip surface: `--color-surface-raised`, 6px radius, 1px
hairline, `--shadow-md`, 12.5px text, mono for values. 160ms fade with a 4px rise.

### JobStatusCard.svelte
Becomes a table row rather than a card (see `07 Jobs`). The per-type result summaries are good copy
and should survive verbatim; they move into a `Detail` cell in `--color-ink-light`. Duration and
timestamps go mono tabular and right-align. State becomes the job status word (section 9).

### PageHeader.svelte
The accent icon tile goes. The page title moves into the shell's top bar at 18px 600, with the
mono context string beside it and the actions right-aligned. `PageHeader` becomes a thin adapter
that feeds the shell, or is deleted; either way no page renders its own `h1` in the content area.

### ProgressBar.svelte
Track 4px in a table cell, 6px in a panel, no radius, `--furniture` fill. Bar: `--color-accent`
running, `--color-success` at 100%, `--color-warn` paused. Percentage is mono tabular. The ETA
string stays as it is - literal and unrounded is exactly right. Keep the indeterminate shimmer but
prefer a phase label: never a fabricated percentage.

### SearchInput.svelte
28px high, 3px radius, `--color-surface-raised` fill, 1px `--color-border` border,
`MagnifyingGlass` at 14px inset 8px, mono 11px placeholder ending in the `/` shortcut hint. Focus
is the 2px accent outline; the border does not change colour.

### Select.svelte
Same metrics as the input. `CaretDown` at 14px. Value text mono when the options are machine
values (page sizes, counts) and sans when they are labels.

### Skeleton.svelte
Rows match the real row height and column widths. Fill is a shimmer between 9% and 15% ink mixed
into the surface, 1.5s loop, only after 200ms.

### Spinner.svelte
`CircleNotch` at 14px with a 1s linear rotation, `currentColor`. `prefers-reduced-motion` stops
the rotation and shows a static glyph.

### StaleAnalysisBanner.svelte
Becomes a hairline row above the table: `◆ WARN` then the sentence then the action. No tint, no
icon tile.

### StatCard.svelte
Replaced by the stat strip: divided cells on the surface, mono micro-label, 24px 600 tabular
figure, mono note beneath. Four cells maximum. The trend arrows go; the note says the change in
words and numbers.

### StatusBadge.svelte
Becomes the status word. Mapping (shape, word, colour):

| Status | Render | Colour |
| --- | --- | --- |
| pending | `◇ PENDING` | `--color-muted` |
| running | `▸ RUNNING` | `--color-ink` |
| paused | `◆ PAUSED` | `--color-warn` |
| completed | `■ COMPLETED` | `--color-success` |
| failed | `● FAILED` | `--color-ember` |
| cancelled | `○ CANCELLED` | `--color-muted` |
| false_positive | `○ FALSE POSITIVE` | `--color-muted` |
| ignored | `○ IGNORED` | `--color-muted` |
| deleted | `■ DELETED` | `--color-success` |

One status word per row. Where a row has two candidate states, roll up to the worst and put the
detail in the row's note or the detail view.

### Tabs.svelte
Underline tabs on the surface: 36px high, 14px horizontal padding, 2px accent bottom border when
selected, `--color-ink` selected and `--color-muted` otherwise, count beside the label in mono
tabular `--color-muted`. Segmented filters inside a filter row are a different control: a single
bordered group, 26px high, 1px dividers, `--color-selected` fill on the active segment.

### TextField.svelte
Label above at 12.5px 500, field, then helper text at 12.5px `--color-muted`. Error state: 1px
`--color-ember` border and a message line prefixed with `●` saying what to do, not what went
wrong. `aria-describedby` wires the helper and the error. Read-only fields take the canvas fill,
`--color-ink-light` text and a mono `READ ONLY` chip; environment-managed values are shown
read-only rather than hidden.

### ThemeToggle.svelte
Stays a three-way radiogroup with `Sun` / `Moon` / `Desktop`, pinned to the bottom of the rail.
Restyle against surface tokens instead of the old dark rail: 1px hairline group, 3px radius,
`--color-selected` fill on the active option, `--color-muted` on the rest.

### Toggle.svelte
Prefer a checkbox with a label and helper text for settings. Keep the switch only where the change
applies immediately without a save; then 28x16 track, `--color-track` off, `--color-accent` on,
full radius on the thumb only.

### ActivityPanel.svelte / ActivityLiveRegion.svelte
The floating panel becomes a bottom-right overlay at 6px radius with `--shadow-lg`, listing
running jobs with their status word and meter. The live region text should say the state word and
the literal fraction, which it can now take verbatim from the status word and meter.

### Duplicates composites
- `ConfidenceBreakdown.svelte`: the ECharts bar chart is replaced by three inline meters with
  their weights and band words (see `04`). Rationale: this is a magnitude readout in a panel, and
  meters make the weighting legible without a canvas. ECharts stays everywhere else.
- `DocumentCompare.svelte` / `DocumentVisualCompare.svelte`: same fields in the same order on both
  sides, with every differing value prefixed by a mono `≠` in `--color-warn`. This is the change
  that makes the screen work; do not drop it.
- `TextDiff.svelte`: `-` and `+` prefixes in mono, removed lines on a 12% ember mix, added lines on
  a 12% success mix. Prefix and colour, never colour alone.
- `MatchExplanation.svelte`: shared values as square mono chips on the canvas fill with a hairline.
  The existing copy is good; keep it.
- `GroupActionBar.svelte`: moves into the top bar. Not duplicates (ghost), Keep all (secondary),
  Delete N non-primary (destructive, names its count).
- `WizardGroupCard.svelte`: square, hairline, mono id and confidence word.

### AI composites
- `AiResultRow.svelte`: one line per result, six columns: select, document, suggested title, fields,
  confidence, actions. Current value struck through, mono arrow, new value in `--color-ink` 500.
  Two collapses, both for the same reason - the proposed title is the thing being approved and it
  needs the width: (1) the four per-field confidence badges become the row's worst band plus a note
  naming the weakest field; (2) the separate correspondent, type and tags columns become one mono
  `Fields` column listing only the codes for the fields this result proposes (`TI CO TY TG`,
  `TI TG`), in `--color-fg-soft` mono with a legend in the filter row. Absence is the carrier:
  untouched fields are omitted, never greyed, so no colour does semantic work and
  `--color-disabled` stays decorative-only as the system requires. The per-field values live in the
  detail panel,
  which is what the panel is for. Measured: the diff cell needs 218-283px for real titles, so eight
  columns cannot fit the 940px content region at compact density - dropping the column count is the
  fix, not narrowing the widths.
- `AiFieldDiffCard.svelte`: keep the checkbox-per-field model - a partial apply is a normal
  outcome. Warnings become `Plus` / `Minus` / `Equals` / `Warning` at 13px with their sentence.
  Tag diffs: added tags get a success hairline and a `+` prefix, removed tags are struck through in
  `--color-muted`.
- `AiToastContainer.svelte`: bottom right, 6px radius, 4s, dismissible, never more than two.
- `AiBulkActionBar.svelte`: becomes the shell's pinned bulk bar on `--color-inverse`, with the
  literal count and the consequence sentence.

---

## 9. Interaction states

| State | Treatment |
| --- | --- |
| Hover, row | `--color-bg-hover` fill. Nothing moves, nothing scales. |
| Hover, button | Secondary and ghost take `--color-bg-hover`; primary takes `--color-accent-hover`. |
| Hover, link | `--color-accent-hover`, underline only if it was already underlined. |
| Focus | `:focus-visible` only: 2px `--color-accent` outline at 2px offset, 3px radius. No glow, no border colour change, never a persistent ring after a click. |
| Active / pressed | Colour only. No scale, no translate. |
| Selected, row | `--color-selected` fill plus a 2px `--color-accent` inset left edge, plus the checked checkbox. Three carriers. |
| Selected, segment | `--color-selected` fill, `--color-ink` text, 500 weight. |
| Disabled | `--color-disabled` text, `--color-border` hairline, transparent fill, `cursor: not-allowed`, and an `aria-describedby` line saying why. A disabled control that does not say why is a bug. |
| Loading, button | Stays disabled, swaps its icon for `CircleNotch` at 1s linear, and changes its label to the present participle: `Analysing...`. |
| Read-only | Canvas fill, `--color-ink-light` text, mono `READ ONLY` chip. |
| Error, field | 1px `--color-ember` border and a `●`-prefixed message naming the fix. |

Motion: 120ms for colour, 160ms for surfaces appearing, 200ms for progress fills. Ease-out. Menus
and dialogs fade and rise 4px; toasts slide 12px from the right; skeletons shimmer on a 1.5s loop.
`prefers-reduced-motion` collapses all of it.

---

## 10. Page to archetype map

All 13 pages. "Archetype" is the board in this export that defines the layout.

| Route | Page | Archetype | Notes |
| --- | --- | --- | --- |
| `/` | Dashboard | 02 Dashboard | Stat strip, next actions, current activity, outcomes, two charts. First-run checklist gains a completion rule (section 12). |
| `/documents` | Documents, statistics mode | 02 Dashboard | Same anatomy as the dashboard: strip plus charts. Section dividers become panel headings. |
| `/documents?library=true` | Document library | 03 Documents list | The canonical list page. Columns unchanged. |
| `/duplicates` | Duplicate groups | 03 Documents list | Same archetype: strip, filter row with the queue segments, table of groups, bulk bar. Confidence column uses the band word. Move the bulk bar from the top to the bottom edge. |
| `/duplicates/[id]` | Group detail | 04 Duplicate group detail | The signature screen. |
| `/duplicates/graph` | Similarity graph | 05 Duplicates graph | Status needs the line-style carrier. |
| `/duplicates/wizard` | Bulk operations wizard | 06 Wizard | Six steps unchanged. Step 4 gains the typed confirmation. |
| `/jobs` | Job history | 07 Jobs | Cards become rows. |
| `/settings` | Settings | 08 Settings and forms | Five sections unchanged: Connection, Deduplication, AI, Automation, System. |
| `/ai-processing` | AI processing shell | 09 AI review queue | Header, stat strip, tabs. The 6-7 stat tiles reduce to a 4-cell strip; rejected and reverted move to the History tab, which is where they are actioned. |
| `/ai-processing/queue` | Queue | 03 Documents list | List page over unprocessed documents, with the queue filter bar and the cost estimate in the strip. |
| `/ai-processing/review` | Review | 09 AI review queue | The human-in-the-loop pattern. |
| `/ai-processing/history` | History | 03 Documents list | List page with the applied / rejected / reverted / failed segments and a revert action per row. |
| `/ai-processing/custom-fields` | Custom fields | 08 Settings and forms | Form archetype: discovery run, candidate table, policy toggles. |
| `+error.svelte` | Error page | 10 System states | Page-level error only when the shell itself cannot render. |

---

## 11. Accessibility note per archetype

Every fg/bg pair in these boards is AA in both themes. Beyond contrast:

**01 App shell.** The rail is a `nav` with `aria-current="page"` on the active item, which is what
carries the state for a screen reader; the accent inset edge and the fill are for everyone else.
Counts beside nav items are inside the link, so they are announced with it. The theme control is a
`radiogroup` with `aria-checked`, and each option has an `aria-label` because it is icon-only. In
the narrow shell the disclosure button is labelled, the drawer traps focus while open, and Escape
closes it.

**02 Dashboard.** Every status is shape plus word plus colour. The progress bar is a real fraction
with the percentage in text, not only in the bar width. The activity list is a live region that
announces the state word and the fraction, not a colour. Charts are single-series and captioned by
the heading and description above them, so the chart is never the only place a number appears.

**03 Documents list.** Sticky header cells are `th` with `scope`. The select-all checkbox is
labelled, and every row checkbox names its document. Selection is carried by three things - fill,
inset edge, checked state - so it survives greyscale and high-contrast mode. The meter is
`aria-hidden` and the count beside it is the accessible value. The empty state is a sentence, not
an image, so it reads as content.

**04 Duplicate group detail.** Confidence never depends on colour: shape, word and number. The
`≠` marker on a differing value is in the text run, so it is announced. The two comparison columns
are `article` elements with headings, and the field lists are `dl` pairs, so a screen reader can
walk field by field rather than left to right. The destructive button names its count.

**05 Duplicates graph.** The graph is decorative for assistive technology: the same relationships
are reachable as the duplicates list, and the detail panel repeats the selected connection as text.
Status has a non-colour carrier (line style) and the legend states each variable in words. The
graph is keyboard-pannable and the detail panel is focusable.

**06 Wizard.** Step state is a number and a check glyph, not a colour. The current step is
announced through `aria-current="step"`. Progress is a real fraction. The destructive button is
disabled until the typed confirmation matches, and it is wired to a visible reason with
`aria-describedby`.

**07 Jobs.** One status word per row. Duration and timestamps are tabular so they can be compared
by scanning. A failed row states the reason as text on the row, so the failure is not only a
colour. Live-updating rows are inside a polite live region that announces the state change, not
every percentage tick.

**08 Settings and forms.** Every field has a `label`, helper text wired with `aria-describedby`,
and an error message that says what to do. The unsaved bar is a live region naming the count of
changed fields. The disabled save button states its reason. In the confirm dialog, focus opens on
Cancel, the dialog is `aria-modal` with a labelled title, and the typed confirmation has its own
label rather than only a placeholder.

**09 AI review queue.** Each row states the current and proposed values as text, with the arrow in
the run, so a diff is readable without colour. Per-field checkboxes are labelled with the field
name. The confidence band is shape plus word plus number. Apply and reject are `button`s with
`aria-label`s, not icon-only glyphs without names.

**10 System states.** Skeletons are `aria-hidden` and the region carries `aria-busy="true"`, so a
screen reader hears "busy" rather than a wall of empty rows. Errors are `role="alert"`. Toasts are
`role="status"` and never carry an error the user has to act on. Spinners have a text label beside
them; a spinner alone is never the only signal.

---

## 12. Opportunistic fixes

Each one optional and independent of the migration. Flagged so they can be taken or left.

**a. First-run checklist completion rule.** Requested, and designed into board 02.
The checklist currently renders unconditionally with three hardcoded steps, so it is permanent
furniture on a library of 12,418 documents. Proposed rule, using the states pattern:

- Each step has a real condition: (1) connection test passes; (2) at least one completed sync job
  exists; (3) at least one completed analysis job exists.
- While any step is unmet, the panel shows all three with `■ DONE` / `◆ TODO` per step, in order,
  with the action on the first unmet step.
- When all three are met, the panel collapses to one hairline row: `■ OK`, "Setup is complete. All
  three first-run steps are done, so the checklist is out of the way.", the mono `3 / 3`, and two
  controls - `Review steps` (expands it again, read-only) and `Dismiss`.
- Dismissal is persisted server-side with the config, not in localStorage, so it does not come back
  on another browser.
- It returns only if a step regresses - the connection test starts failing, or the analysis data is
  cleared - and then it says which one, in the same words.

**b. Roll the documents table down to one status column.** Optional. The list-page pattern wants
one status word per row, and the library table has OCR, duplicate review and AI review side by
side. Boards keep all three columns (the brief says keep the columns) and give only OCR the
shape-plus-word treatment, which is compliant but busier than the pattern intends. The alternative
is a single `Status` column rolled up to the worst of the three with a note naming the reason, and
the detail moved to the row's detail view. Rationale for leaving it: the three columns are
genuinely three different jobs a user filters by, and collapsing them costs a filterable column.

**c. Retire the zebra striping in the library table.** Optional, recommended. The table currently
alternates `bg-surface` and `bg-canvas` per row. With 36px rows, hairlines and a hover fill, the
stripe fights the selected-row tint and the hover state. Boards use hairlines only.

**d. One primary action per view region.** Optional. `duplicates/+page.svelte` renders four
buttons of near-equal weight in its header. Boards make the wizard the one primary and demote the
rest to secondary and ghost, which is also what `FOUNDATIONS.md` asks for.

**e. Stop truncating titles in JavaScript.** Optional. Several places slice titles to 30 or 40
characters. CSS ellipsis with a `title` attribute keeps the full string available to search,
selection and assistive technology.

**f. Give the confidence legend one home.** Optional. The band thresholds appear nowhere in the UI
today, so a 74% and a 76% look arbitrarily different. Boards print the legend once beside the
headline score.

**g. Replace `confirm()` in the jobs page.** Optional, small. `clearHistory()` uses the native
`confirm()`. It should use `ConfirmDialog` like every other destructive action, with the count in
the title.

---

## 13. Assumptions

Where the repo and the brief left a gap, this is what was assumed and why.

1. **Product mark.** The v2 brand set (`cards/marks.js`) contains marks for m7kni, BrewMDM,
   TrustHeader, Portie and Backpocket. There is no Paperless Dedupe mark. The boards use the
   **m7kni house mark** at 20px with the product name beside it, drawn from the shipped path data
   at stroke weight 4 (the small cut, correct at 24px and below), never redrawn and never
   recoloured beyond `currentColor`. This also matches what the app does today with
   `/m7kni-mark.svg`. If a product mark is wanted, it should be added to the brand set using the
   documented construction rather than invented here.
2. **Product name.** "Paperless NGX Dedupe" is kept verbatim from `+layout.svelte`. At 200px the
   rail wraps it to two lines. The alternative is a shorter display name, which is a product
   decision, not a design one.
3. **Version string in the rail.** The v2 shell has a slot for a mono version beside the product
   name. `packages/web/package.json` reads `0.0.1`, which is a workspace placeholder rather than a
   release, so the slot is left empty and the rail's bottom row carries sync freshness instead.
4. **Sidebar counts.** The shell pattern shows a mono count beside nav items. The app does not
   expose those counts to the layout today; the boards show document, group, pending-AI and active-job
   counts, which the existing dashboard and stats endpoints already return.
5. **Top bar context string.** The pattern has a mono breadcrumb slot. The boards use the Paperless
   host (`paperless.home.arpa`) on the dashboard and a route path elsewhere. If the host is
   considered sensitive on a shared screen, the route path alone is fine.
6. **Confidence band words.** The code names its three bands high / medium / low, so those are the
   words. No new vocabulary was invented.
7. **Job state words.** `RUNNING`, `QUEUED`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED` are the
   existing statuses, uppercased. `▸`, `◇` and `○` extend the system's `■ ◆ ●` shape set because
   the system only defines shapes for ok / warn / fail and a job list needs neutral and in-progress
   states too. If that extension is unwelcome, `QUEUED` and `RUNNING` can drop to word-only.
8. **Stat strip cell count.** The pattern caps the strip at four cells. `/ai-processing` currently
   shows six or seven tiles. The boards keep the four that drive a decision and move rejected and
   reverted to the History tab.
9. **Thumbnails.** Document thumbnails come from
   `/api/v1/paperless/documents/[id]/thumb` at runtime. The boards show a hairline placeholder with
   a mono page label in that slot; no imagery was generated.
10. **Numbers.** Every figure in the boards is plausible fabricated data for a 12,418-document
    library, not a real measurement.
11. **Failure toast.** `guidelines/patterns/states.md` says toasts are never for errors. The brief
    asks for a failure toast. Board 10 shows one, scoped narrowly: a background job that failed
    while the user was elsewhere, reporting the outcome and linking to the job. Anything the user
    must fix in place stays inline. Worth a ruling.
12. **Fonts.** The boards load the design system's bundled Hanken Grotesk and JetBrains Mono woff2
    files. In the app, `@fontsource/hanken-grotesk` at 400/500/600/700 replaces
    `@fontsource/geist-sans`; JetBrains Mono is already there.
13. **Icons in the export.** The boards inline Phosphor SVG art as a same-document sprite because
    the preview sandbox blocks external SVG references. The app should use `phosphor-svelte`
    components, not this sprite.
14. **Narrow breakpoint.** 768px, matching the app's existing `md:` boundary. The narrow boards are
    drawn at 420px.
