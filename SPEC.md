# Specification: Personal Ledger & Vault

## Objective

Build a local-first, single-user INR (`₹`) personal command center uniting Personal, Business, and Family banking, multiple credit cards & bills, loans, people dues (give/need), income & expenses, recurring bills, notes with checklists, an isolated AES-256-GCM password vault, detailed financial reports, a one-glance dashboard, and an automated WhatsApp alert system via a Local Linked-Device QR Bridge.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui-pattern accessible primitives + Lucide icons + custom animated SVG/chart graphics
- **Backend:** Node 24 (`v24.20.0`) built-in `node:http` + `node:sqlite` (WAL mode) + `zod` + `@whiskeysockets/baileys` + `qrcode`
- **Shared Pure Core:** TypeScript module (`shared/ledger-core.ts`) for integer paise math, `en-IN` `₹` formatting, local `YYYY-MM-DD` calendar math, credit-card billing window & utilization, EMI amortization split, and alert evaluation logic
- **Testing:** Node built-in test runner (`node --test` via `--experimental-strip-types` or `tsx`/`vitest`) for unit, DB integration, API, crypto, and alert tests + headless browser verification

## Commands

```bash
# Install dependencies
npm install

# Run development server (Node API + Vite UI)
npm run dev

# Build production UI bundle
npm run build

# Run unit & integration test suite
npm test

# Typecheck
npm run typecheck
```

## Project Structure

```text
shared/
  ledger-core.ts          # Integer money math, date helpers, card cycles, EMI math, Zod schemas
  ledger-core.test.ts     # Pure unit tests
server/
  index.ts                # HTTP server (127.0.0.1), static dist serving, scheduler loop
  db/
    schema.ts             # SQLite WAL initialization & schema migrations
    accounts-repo.ts      # Banks, credit cards, statement bill calculations
    ledger-repo.ts        # Unified transactions, recurring bills, loans, people dues
    notes-repo.ts         # Notes + checklist items
    vault-repo.ts         # Ciphertext-only vault entries & security metadata
    alerts-repo.ts        # Alert rules & idempotent delivery log
    reports-repo.ts       # Dashboard KPIs, reports, CSV/JSON export & backup
  whatsapp/
    bridge.ts             # Baileys Local Linked-Device QR Bridge + status + reconnect
    scheduler.ts          # Cross-module rule evaluator + quiet hours + morning digest
  server.test.ts          # SQLite atomic TX, API validation, alert deduplication & bridge tests
src/
  App.tsx                 # 6-workspace shell, animated gliding tab bar, global Quick Add (Ctrl+K)
  lib/
    api.ts                # Typed REST client
    crypto.ts             # Web Crypto PBKDF2-SHA256 + AES-256-GCM client-side vault crypto
    format.ts             # INR ₹ formatting & date helpers
  components/
    ui/                   # Accessible button, card, dialog, tabs, input, select, badge, table
    charts/               # Animated SVG cashflow bars, donut/ring, card utilization & loan meters
    QuickAddModal.tsx     # Fast expense/income/transfer/due/checklist capture
  workspaces/
    DashboardView.tsx     # One-glance KPIs, Action Needed queue, animated charts, pinned checklists
    MoneyCardsView.tsx    # Transactions, P/B/F Banks (+Reconcile), Credit Cards & Bills, Recurring
    LoansDuesView.tsx     # Borrowed/Lent Loans (+Pay EMI) & People Dues Give/Need (+Settle +wa.me)
    ReportsView.tsx       # 6 interactive reports + Date/Scope/Account filters + CSV export
    NotesView.tsx         # Markdown notes + interactive checklist items + remind_at
    VaultView.tsx         # Master Password unlock, AES-256-GCM entries, auto-lock, timed copy
    AlertsSettingsModal.tsx # QR Bridge pairing render, test send, per-module rules, backup download
scripts/
  install-autostart.ps1   # Optional Windows Task Scheduler login/wake auto-start helper
```

## Boundaries

- **Always do:**
  - Store all money in integer paise (`amount_minor`) and calendar dates as `YYYY-MM-DD`.
  - Wrap cross-entity updates (card bill pay, loan EMI pay, due settlement) in SQLite `BEGIN IMMEDIATE ... COMMIT`.
  - Parameterize every SQL query; validate every API request with Zod returning structured `422` errors.
  - Keep Vault encryption/decryption strictly in browser memory (`PBKDF2` 600k + `AES-256-GCM`); never persist plaintext secrets or send secrets over WhatsApp.
  - Enforce `dedupe_key` on `alert_deliveries` so alerts never spam.
- **Ask first:** Switching database engine to Supabase, adding external cloud hosts, deleting existing user data.
- **Never do:**
  - Bind server to `0.0.0.0` locally, log plaintext passwords/tokens, store unlocked keys in `localStorage`, or compute credit-card bill payment as a second expense.

## Success Criteria

1. All 6 workspaces work end-to-end against real local SQLite persistence on `127.0.0.1`.
2. Automated unit & integration tests prove: integer INR formatting, zero double-count on card bill payment, atomic loan EMI + bank update, atomic partial due settlement + per-person netting, AES-256-GCM vault round-trip & wrong-password rejection, alert `dedupe_key` idempotency, and zero-secret WhatsApp payloads.
3. Baileys WhatsApp QR bridge initializes cleanly, generates QR code renderable in UI, and handles disconnect/retry safely.
4. UI runs cleanly in light mode with animated gliding tabs, multi-color animated charts/graphics, `tabular-nums`, keyboard accessibility, zero console errors, and passes `impeccable detect --json`.
