# Implementation Plan: Personal Ledger & Vault

## Architecture Decisions

- **Single Minor-Unit Ledger:** Banks (`personal | business | family`) and Credit Cards live in `accounts`. Swipes are `expense`; paying a card bill is `transfer` (`Bank -> Card`).
- **Node 24 Native Core:** Uses Node 24's built-in `node:sqlite`, `node:http`, and `--experimental-strip-types` (no native C++ compiler or heavy ORM required on Windows).
- **Isolated Client-Side Vault:** Browser Web Crypto derives AES-256-GCM key via PBKDF2-SHA256 (600,000 iterations) in memory only; server persists ciphertext + IV + salt + hygiene timestamps.
- **Pluggable WhatsApp Transport:** `alerts-engine` evaluates all modules every 60s and on-demand, writes idempotent `alert_deliveries`, and dispatches via `@whiskeysockets/baileys` Linked-Device QR Bridge (plus `wa.me` deep link fallback).
- **Supabase-Ready Boundaries:** All SQL isolated cleanly inside `server/db/*-repo.ts` with UUID primary keys and standard relational columns.

## Task List

### Phase 1: Pure Core & Persistence
- [ ] Task 1: `shared/ledger-core.ts` — integer paise math, `en-IN` formatter, date helpers, card cycle window & utilization, EMI amortization split, Zod schemas + unit tests
- [ ] Task 2: `server/db/schema.ts` & repositories (`accounts`, `ledger`, `notes`, `vault`, `alerts`, `reports`) + DB atomicity tests

### Checkpoint: Foundation
- [ ] Pure math & SQLite atomic transaction tests pass

### Phase 2: API Server & WhatsApp QR Bridge
- [ ] Task 3: `server/whatsapp/bridge.ts` & `scheduler.ts` — Baileys QR generation, session persistence, cross-module alert evaluator, `dedupe_key`, quiet hours, morning digest + unit/integration tests
- [ ] Task 4: `server/index.ts` — REST endpoints for all modules, `127.0.0.1` binding, security headers, 1-click SQLite/JSON backup, optional Windows autostart script + API tests

### Checkpoint: Backend Complete
- [ ] Full backend & alert tests pass; API boots cleanly

### Phase 3: Operate-Mode Light UI & Animated Graphics
- [ ] Task 5: Frontend scaffold (Vite + React + Tailwind + design tokens + gliding animated tab shell + Quick Add `Ctrl+K`)
- [ ] Task 6: Dashboard + Money & Cards (Banks, Credit Cards & Bills, Recurring Bills, Reconcile) + animated SVG charts/gauges
- [ ] Task 7: Loans & People Dues (`Give`/`Need`, partial settle, `wa.me` nudge) + Reports (6 report views + CSV export)
- [ ] Task 8: Notes & Checklists + Password Vault (PBKDF2/AES-GCM client crypto + auto-lock) + WhatsApp QR & Alert Rules Modal

### Checkpoint: Complete & Verified
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass
- [ ] `impeccable detect --json` reviewed and clean
- [ ] Live browser verification across all 6 workspaces with zero console errors
