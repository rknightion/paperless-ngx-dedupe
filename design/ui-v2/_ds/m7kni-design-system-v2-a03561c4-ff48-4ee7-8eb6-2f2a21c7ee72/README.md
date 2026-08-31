# m7kni design system

One design system for every m7kni / rknightion / BroTEK product surface. Web apps consume tokens +
components; marketing and docs sites consume tokens + CSS; SwiftUI apps consume generated
colour/spacing tokens with native controls.

**Start here: [`FOUNDATIONS.md`](FOUNDATIONS.md)** — the frozen decisions. Then
[`DESIGN.md`](DESIGN.md) (machine summary, generated from tokens), [`docs/voice.md`](docs/voice.md)
(voice + glossary), and [`docs/patterns/`](docs/patterns/) (page anatomies).

## Layout

- `packages/tokens/` — DTCG token sources → `dist/tokens.css` (`:root` + `[data-theme="dark"]`),
  built by Style Dictionary v5. The only place colour is defined.
- `packages/ui/` — the component library: shadcn-style copy-in sources on Base UI primitives with
  Phosphor icons, bridged to the tokens via Tailwind v4 `@theme inline` (`src/theme.css`).
  Storybook stories per component; `registry.json` + `public/r/` make every component installable
  with `npx shadcn add`.
- `tools/` — `contrast_check.py` (AA gate, 50 pairs, both themes), `gen_design_md.py`
  (DESIGN.md generator).
- `.claude/skills/design-system/` — the agent skill consumers load before doing UI work.

## Task interface

`just check` is the gate: token formatting, dist/DESIGN.md drift, AA contrast, ui typecheck,
and registry generation + drift (`packages/ui/registry.json`, `packages/ui/public/r`).
`just setup` installs dependencies; `just build` compiles tokens; `just --list` for the rest.

## Per-app designs

Screen mockups, IA and app-specific copy live in each product repo (`design/`), mapped to the
pattern docs here. This repo holds only what is shared.

## Claude Design

The design-system project **m7kni Design System v2** (`a03561c4-ff48-4ee7-8eb6-2f2a21c7ee72`) is
seeded from this repo via DesignSync — `claude-design-seed/` holds the preview cards it renders. The
v1 project (`441c8683-3b32-4b12-bcb9-10dd548ec2d3`) is retained as an archive only. Re-seed after
any token or component change; never edit the project by hand.
