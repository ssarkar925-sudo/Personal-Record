---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/workspaces/DashboardView.tsx","src/workspaces/MoneyCardsView.tsx","src/workspaces/LoansDuesView.tsx","src/workspaces/ReportsView.tsx","src/workspaces/NotesView.tsx","src/workspaces/VaultView.tsx"]
---

# Surface Brief: Personal Ledger Shell (`src/App.tsx`)

- **Scope & Visitor Mode:** Operate (authenticated local single-user finance, notes & vault desktop workspace on 127.0.0.1).
- **Audience & Job:** One owner checking liquid INR cash across Personal, Business, and Family banks, tracking credit card statements/due bills, EMI loans, people dues (Give/Need), interactive checklists, detailed P&L reports, and an isolated AES-GCM password vault with local WhatsApp QR bridge alerts.

## Direction contract

THESIS: A cool-slate physical-ledger-meets-instrument workbench (`#f6f7f9` canvas, crisp white cards, zero decorative glass/neon clutter) anchored by a multi-color animated gliding workspace tab bar and animated vector cashflow/allocation graphics. Refuses monolithic dark crypto-dashboards and stacked SaaS sidebars.

OWN-WORLD: Palette pairs light architectural stone (`#f6f7f9` canvas, `#ffffff` elevated hairline cards `#dfe4ec`) with semantic scope coding (`#2563eb` Personal cobalt, `#d97706` Business amber, `#059669` Family emerald, `#4f46e5` Reports indigo, `#0f766e` Notes teal, `#7c3aed` Vault violet) used purposefully inside animated tab active pills, scope badges, and SVG data bars/donuts. Typography binds `IBM Plex Sans` with strict `tabular-nums` alignment and `IBM Plex Mono` for card last-4/account figures.

STORY: On open, the user immediately sees aggregate Net Worth, three-scope bank liquidity, overdue/upcoming Action Needed alerts, an animated 6-month Cashflow bar comparison, and pinned clickable checklists—without locking financial tools behind a login wall. Only the Vault tab locks behind a Master Password.

FIRST VIEWPORT: Top 56px single-row command header (brand mark, WhatsApp Bridge status pill + Alert Inbox bell, `+ Quick Add (Ctrl+K)` primary cobalt action) above the 6-tab horizontal navigation bar (`Dashboard`, `Money & Cards`, `Loans & Dues`, `Reports`, `Notes`, `Vault`) featuring a spring-animated gliding colored underline/pill per tab. Directly beneath: scope filter pills (`All`, `Personal`, `Business`, `Family`) and the 3-column asymmetric Dashboard grid.

FORM: Horizontal Gliding-Tab Financial Workbench (Operate primary surface; position 1 of derived operate workbench directions), `seed:87f167a712b730d4`. Signature interaction: sliding tab indicator transitioning color and position per workspace, `Ctrl+K` instant modal, 1-click inline checklist ticking, and 1-click Card Bill Pay / Balance Reconcile.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
