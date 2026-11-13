# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite + React + TypeScript + Tailwind CSS + shadcn/ui frontend; local Node 24 HTTP API (`127.0.0.1`) with built-in `node:sqlite` (WAL mode) and `@whiskeysockets/baileys` for the Local Linked-Device WhatsApp QR Bridge. Repository boundary in `server/db/` is kept clean for a future Supabase (Postgres) migration without dead abstraction layers.

## Users

Single primary owner (solo user) managing personal, family, and business finances, passwords, notes/checklists, and WhatsApp due reminders on Windows.

## Product Purpose

One private, local-first personal command center combining a unified INR (`₹`) financial ledger across Personal, Business, and Family scopes with an interactive checklist-enabled Notes workspace, a zero-plaintext Password Vault, detailed financial reports, and automated cross-module WhatsApp alerts.

## Positioning

Unlike fragmented finance apps or bloatware SaaS trackers, every money entity (banks, credit cards, loans, people dues, recurring bills, and income/expenses) shares one atomic minor-unit ledger while the Password Vault remains cryptographically isolated client-side.

## Operating Context

- Daily desktop usage in **light mode** for fast expense logging (`< 5s` via Quick Add), bill checks, and deep reporting.
- Dashboard opens immediately on launch; **only the Password Vault** locks behind a Master Password (auto-locking after inactivity).
- Local-first single `.sqlite` database file with 1-click backup download; WhatsApp alerts dispatch via a Local Linked-Device QR Bridge rendered inside the app + background wakeup/scheduler.

## Capabilities and Constraints

- **Currency & Math:** INR (`₹`) exclusively, Indian grouping (`en-IN`), stored as integer paise (`amount_minor`) and `YYYY-MM-DD` local calendar dates.
- **Scopes:** Strictly `personal`, `business`, `family` across bank accounts, credit cards, transactions, loans, and people dues (plus `general` on notes).
- **Modules:**
  1. **Dashboard:** 1-glance net position, liquid cash by scope, Action Needed queue, animated monthly cashflow & card utilization graphics, pinned notes/checklists.
  2. **Money & Cards:** Transactions (`income` / `expense` / `transfer`), Personal/Business/Family bank accounts with 1-click Reconcile Balance, multiple credit cards (statement cycle, due date, bill payment transfer), and Recurring Bill templates.
  3. **Loans & People Dues:** Borrowed/lent loans with EMI principal/interest splits; People Dues (`give` payables & `need` receivables) grouped per person with partial settlements.
  4. **Reports:** Cashflow P&L, Category Spend, Credit Card Bills & Utilization, Bank Ledger & Net Worth, Loan Amortization, People Dues Aging, CSV/JSON export.
  5. **Notes & Checklists:** Scoped Markdown notes, toggleable checklist items, pinning, `remind_at` alerts.
  6. **Password Vault:** Client-side PBKDF2 + AES-256-GCM encryption; server stores ciphertext only; zero secrets ever sent over WhatsApp.
  7. **WhatsApp Alert Engine:** Per-module threshold/due rules, `dedupe_key` anti-spam, quiet hours, optional morning digest, Local QR Bridge rendered in UI + Windows wakeup/autostart helper + 1-click `wa.me` fallback.

## Brand Commitments

- **No vibe-coding aesthetic:** Crisp light-mode surfaces, clean workhorse typography with `tabular-nums`, neutral gliding animated tab bar, distinct tasteful colors for scopes and animated dashboard/report charts/graphics without neon clutter.

## Evidence on Hand

Greenfield local project created at `C:\Users\PC\.gemini\antigravity\scratch\personal-ledger`. Real user data will be entered after launch; sample/seed data should be optional (or isolated to tests) so the user starts clean or can load demo data intentionally.

## Product Principles

1. **One ledger, zero drift:** Every bill payment, EMI, and due settlement updates balances atomically.
2. **Vault isolation is absolute:** Plaintext secrets never touch disk, logs, or WhatsApp messages.
3. **Zero extra junk:** No SMS/PDF scrapers, multi-currency FX, or multi-user login locally.
4. **Fast daily capture:** Log an expense or check a dashboard item in seconds.
5. **Verify before trusting:** Automated tests for all money math, SQLite atomicity, encryption, and alert deduplication.
