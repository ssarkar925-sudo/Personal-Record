# Design System: Personal Ledger & Vault

Derived directly from the built artifact (`src/index.css`, `src/components/ui/Primitives.tsx`, `src/components/charts/AnimatedCharts.tsx`, `src/App.tsx`).

## Visual World & Surface Role

- **Mode:** Crisp Architectural Light Workbench (`#f6f7f9` canvas, `#ffffff` elevated cards with `#dfe4ec` hairlines).
- **Refusals:** Zero neon/dark crypto themes, zero glassmorphic blur cards, zero decorative fake gradients, zero stacked sidebars.

## Color Tokens & Semantic Palette

| Role | Token / Hex | Meaning |
| --- | --- | --- |
| Canvas | `#f6f7f9` | Cool stone desktop ground |
| Surface | `#ffffff` | Card, modal, table elevation |
| Hairline Border | `#dfe4ec` / `#e2e8f0` | Structural card & row dividers |
| Primary Text | `#111827` / `#0f172a` | Headings, INR totals, primary actions |
| Muted Text | `#475569` / `#64748b` | Field labels, timestamps, deltas |
| Personal Scope | `#2563eb` (Cobalt) | Personal banks, expenses, Dashboard tab |
| Business Scope | `#d97706` (Amber) | Business banks, Loans & Dues tab |
| Family Scope | `#059669` (Emerald) | Family banks, Money & Cards tab, Income bars |
| Reports Workspace | `#4f46e5` (Indigo) | Detailed Reports tab & Credit Card accent |
| Notes Workspace | `#0f766e` (Teal) | Notes & Interactive Checklists tab |
| Vault Workspace | `#7c3aed` (Violet) | Isolated AES-GCM Vault lock & actions |

## Typography & Numeric Discipline

- **UI Sans:** `IBM Plex Sans`, system-ui fallback.
- **Data Mono:** `IBM Plex Mono` (`last4`, passwords, PowerShell snippets).
- **Tabular Alignment:** `.tabular-nums` applied on every `₹` amount, percentage, date cell, and KPI card.

## Motion & Multi-Color Animation

- **Gliding Workspace Tabs (`AnimatedTabs`):** Measures active button offset via `ResizeObserver` + `useLayoutEffect` and smoothly translates a `3px` colored bar (or elevated subtle pill) transitioning into that tab's `accentHex`.
- **Animated Graphics:** `CashflowTrendChart` (`barRise` cubic-bezier entrance per column + hover/focus inspection), `ScopeDonutChart` (`strokeDasharray` + `strokeDashoffset` smooth 500ms ring animation), and `MeterBar` horizontal threshold gauges.
- **Reduced Motion:** `@media (prefers-reduced-motion: reduce)` disables keyframes and clamps transitions to `0.01ms`.
