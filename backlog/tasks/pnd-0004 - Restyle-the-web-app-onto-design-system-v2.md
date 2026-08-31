---
id: PND-0004
title: Restyle the web app onto design system v2
status: To Do
assignee: []
created_date: '2026-08-31 14:05'
labels:
  - design-system
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The complete v2 design is committed at design/ui-v2/: ten archetype canvases plus per-screen and narrow-variant boards, an Index, screenshots/, Phosphor assets, and spec/ containing implementation-spec.md, a READY-TO-PASTE app.css (the drop-in replacement for packages/web/src/app.css - the token swap is designed to be mechanical) and source-notes.md recording the exact source commit the design was read from. Read the spec in full before any code change; review the assumptions and opportunistic-fixes sections and surface anything that looks wrong rather than building on it.

Scope: SvelteKit 5 + Tailwind v4 stack STAYS; @m7kni/ui is React and does not apply - the migration is tokens, fonts, icons and patterns onto the existing internal Svelte component library. The current v1 layer (jade OKLCH tokens, Geist via fontsource, lucide-svelte icons) is retired: spec's app.css lands (petrol, hue-227 neutrals, both themes), fonts move to Hanken Grotesk + JetBrains Mono, icons to Phosphor per the spec's lucide-to-Phosphor mapping, the ECharts palette moves to the spec's petrol-derived series (bridged through src/lib/theme/tokens.ts). The three-way light/dark/system toggle stays. IA untouched: 13 pages, same navigation and purposes. Confidence bands move onto the StatusWord/semantic-plus-shape treatment (required, in the archetypes); the first-run checklist gets the designed completion/dismissal rule; other opportunistic fixes in the spec are optional - take or defer each explicitly. Narrow variants for shell, documents list and duplicate group detail are drawn; the 390px comparison stacking decision is in the canvas, do not re-derive it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app renders on the spec's app.css in all three theme modes; no jade/Geist/lucide remaining in packages/web/src
- [ ] #2 ECharts series use the petrol-derived palette via the tokens.ts bridge in both themes
- [ ] #3 all 13 pages render per their archetype; confidence bands use the semantic-plus-shape treatment
- [ ] #4 narrow behaviour matches the three drawn variants
- [ ] #5 AA pairs from the spec hold; axe e2e checks pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 just check
- [ ] #2 just build
- [ ] #3 just test-e2e (only if packages/web behaviour changed)
- [ ] #4 just check green
- [ ] #5 playwright e2e suite green
<!-- DOD:END -->
