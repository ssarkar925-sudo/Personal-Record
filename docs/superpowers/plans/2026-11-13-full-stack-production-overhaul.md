# Full-Stack Production & Quality Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Personal Ledger application into an enterprise-grade, high-performance, resilient local-first financial platform with sub-millisecond database queries, modular backend architecture, comprehensive stress and verbality test suites, Strix-hardened security, and an Impeccable accessible frontend UI with a global Command Palette (`Cmd+K`) and animated skeleton loaders.

**Architecture:** 
1. Database: Compound SQLite B-tree indexes, WAL auto-checkpointing, dynamic integrity verification (`PRAGMA integrity_check;`), and in-memory disaster recovery testing.
2. Backend: Clean separation of concerns with domain route controllers (`/api/accounts`, `/api/transactions`, `/api/notes`, `/api/vault`, `/api/tax`, `/api/advisor`, `/api/system`), rate-limiting, and graceful process lifecycle handling.
3. Quality & Testing: 10,000-row stress and concurrency test suite, full multi-lingual verbality testing across English, Hindi, and Bengali, and OWASP AppSec path-traversal hardening.
4. Frontend: Design tokens, keyboard-first Command Palette (`Cmd/Ctrl+K`), skeleton loading states, and mobile responsive bottom navigation bar with zero violet/purple violations.

**Tech Stack:** Node 24 (`--experimental-strip-types`, `node:sqlite`), React 19, TypeScript 5.8, Tailwind CSS, Lucide icons, Vite.

**Spec:** The 6-Milestone Specification approved in conversation: Database Indexing & Maintenance, Backend Modularization, Stress & Concurrency Testing, Multi-Language Verbality & Copy Humanization, Frontend UX & Command Palette, and AppSec Hardening.

## Global Constraints
- Node.js 24 native SQLite (`node:sqlite`) with `--experimental-strip-types`. No external ORM or heavy database dependencies.
- Zero `violet` or `purple` classes anywhere in frontend UI code (Impeccable strict rule).
- Pure local-first architecture: All data stays local in SQLite; Password Vault maintains strict zero-knowledge PBKDF2/AES-GCM encryption.
- No float math for currency: All monetary values stored in minor units (`minor` = paise/cents) or formatted through `formatINR`.
- Backward compatibility: Existing database tables, schemas, and historical records must migrate safely without data loss.

## Review Focus
1. SQLite WAL Locking Under Concurrency: 100 concurrent read requests must not fail or throw `SQLITE_BUSY` when batch transactions are writing.
2. Safe Database Integrity on Startup: Corrupted database or missing foreign keys must be trapped during boot and logged before opening HTTP listener.
3. Path Traversal & Injection Immunity: File downloads, backup exports, and PDF paths must strictly validate against base directory traversal.
4. i18n Verbality & Missing Key Safety: Missing translation keys must gracefully fall back to English without crashing the UI or rendering `undefined`.
5. Command Palette Keyboard Traps: Modal must cleanly trap focus, handle Escape, Arrow Up/Down, Enter, and close seamlessly without breaking existing hotkeys.

---

### Task 1: Database High-Speed Compound Indexes & Maintenance Engine

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/maintenance.ts`
- Create: `server/db/maintenance.test.ts`

- [ ] **Step 1: Write the failing maintenance test**
  Create `server/db/maintenance.test.ts` testing:
  - `runDatabaseIntegrityCheck(db)` verifies clean SQLite state.
  - `runMaintenanceOptimize(db)` executes WAL truncation and optimize pragma.
  - `verifyBackupSnapshot(db, backupPath)` verifies in-memory restoration.
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --experimental-strip-types --test server/db/maintenance.test.ts` (expect module not found).
- [ ] **Step 3: Implement compound indexes in `schema.ts`**
  Add indexes to `initSchema(db)`:
  - `idx_transactions_query`: `CREATE INDEX IF NOT EXISTS idx_transactions_query ON transactions(occurred_at DESC, account_id, scope);`
  - `idx_notes_filter`: `CREATE INDEX IF NOT EXISTS idx_notes_filter ON notes(archived, pinned DESC, updated_at DESC);`
  - `idx_vault_lookup`: `CREATE INDEX IF NOT EXISTS idx_vault_lookup ON vault_items(favorite DESC, category, title);`
  - `idx_loans_status`: `CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(direction, remaining_minor);`
- [ ] **Step 4: Implement `server/db/maintenance.ts`**
  Implement:
  - `checkDatabaseHealth(db: DatabaseSync)`: Runs `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
  - `checkpointAndOptimize(db: DatabaseSync)`: Runs `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA optimize`.
  - `verifyBackupIntegrity(backupDbPath: string)`: Opens backup in temporary memory or checks integrity.
- [ ] **Step 5: Run tests and verify green**
  Run `node --experimental-strip-types --test server/db/maintenance.test.ts`.

---

### Task 2: Backend Architecture & Modular Route Controllers

**Files:**
- Create: `server/routes/system-routes.ts`
- Create: `server/middleware/security.ts`
- Modify: `server/index.ts`
- Test: `server/routes.test.ts`

- [ ] **Step 1: Write route integration tests**
  Create `server/routes.test.ts` testing:
  - `GET /healthz` returns `{ ok: true, status: 'healthy', database: 'ok', memory: ... }`.
  - `GET /api/system/maintenance` triggers WAL checkpoint and returns health status.
  - Rate limiter blocks excessive verification attempts on `/api/preferences/pin/verify`.
  - Security headers present on responses (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).
- [ ] **Step 2: Implement `server/middleware/security.ts`**
  - In-memory sliding-window rate limiter for sensitive routes (`/api/preferences/pin/verify`, `/api/vault/auth`).
  - Security headers injector middleware.
  - Safe error envelope formatter (`{ ok: false, error: message, code: code }`).
- [ ] **Step 3: Implement `server/routes/system-routes.ts`**
  Expose `/healthz`, `/api/system/diagnostics`, `/api/system/maintenance`.
- [ ] **Step 4: Wire into `server/index.ts`**
  Connect health checks and security middleware into the server request pipeline.
- [ ] **Step 5: Run test suite to verify green**
  Run `node --experimental-strip-types --test server/routes.test.ts`.

---

### Task 3: Stress Testing & Concurrency Benchmark Suite

**Files:**
- Create: `server/stress.test.ts`

- [ ] **Step 1: Write stress test suite**
  Write tests in `server/stress.test.ts`:
  - 1. **Batch Ingestion Benchmark**: Ingest 5,000 transactions in atomic batch and verify total time < 400ms.
  - 2. **Concurrent Read/Write Stress**: Spin up 50 parallel asynchronous read queries while streaming 1,000 new transactions; assert 100% completion with 0 `SQLITE_BUSY` errors.
  - 3. **Ledger Aggregation Benchmark**: Query full balance and P&L summaries over 6,000 transactions; assert response time < 35ms.
  - 4. **Memory Stability**: Verify heap usage remains bounded before and after stress execution.
- [ ] **Step 2: Run stress test suite**
  Execute `node --experimental-strip-types --test server/stress.test.ts` and verify performance metrics pass.

---

### Task 4: Multi-Language "Verbality" & Humanized Copy Suite

**Files:**
- Modify: `shared/i18n.ts`
- Create: `shared/i18n.test.ts`

- [ ] **Step 1: Write verbality and language completeness test**
  Create `shared/i18n.test.ts` verifying:
  - English (`en`), Hindi (`hi`), and Bengali (`bn`) all possess 100% matching translation keys across all namespaces (`common`, `nav`, `dashboard`, `money`, `notes`, `vault`, `tax`, `scopes`, `advisor`).
  - Zero missing keys, empty strings, or undefined values.
  - Formatting functions support language-specific number/currency presentation.
- [ ] **Step 2: Update and complete `shared/i18n.ts`**
  Fill in any missing keys across command palette, maintenance, and system alerts for Hindi and Bengali.
  Humanize error strings so no raw technical SQL errors leak to user-facing strings.
- [ ] **Step 3: Run i18n test suite**
  Run `node --experimental-strip-types --test shared/i18n.test.ts` and confirm 100% parity.

---

### Task 5: Frontend Command Palette (`Cmd+K`), Skeleton Loaders & User-Friendliness

**Files:**
- Create: `src/components/ui/CommandPalette.tsx`
- Create: `src/components/ui/Skeleton.tsx`
- Modify: `src/App.tsx`
- Modify: `src/workspaces/DashboardView.tsx`

- [ ] **Step 1: Implement `src/components/ui/Skeleton.tsx`**
  Create accessible animated skeleton component variants (`CardSkeleton`, `RowSkeleton`, `MetricsSkeleton`) with subtle pulse animation and clean slate styling.
- [ ] **Step 2: Implement `src/components/ui/CommandPalette.tsx`**
  Create a global search and command palette (`Cmd/Ctrl+K`):
  - Fast workspace switching (`Dashboard`, `Money & Accounts`, `Notes`, `Password Vault`, `Reports & Tax`, `AI Billboard`).
  - Quick action shortcuts (`+ Add Expense`, `+ Add Bank Account`, `+ New Note`, `Export CA Pack`, `Lock Vault`).
  - Keyboard navigation (Arrow Up/Down, Enter to activate, Escape to close).
  - Search filtering by keyword in active language.
- [ ] **Step 3: Integrate Command Palette and Quick Action into `src/App.tsx`**
  - Add global keydown listener (`keydown` for `Ctrl+K` or `Meta+K`).
  - Add keyboard shortcut indicator in top navigation bar (`⌘K` / `Ctrl+K`).
  - Render Command Palette portal.
- [ ] **Step 4: Verify typecheck & build**
  Run `npm run typecheck` and `npm run build`.

---

### Task 6: AppSec Hardening & Production Verification

**Files:**
- Modify: `package.json` (add `npm run test:stress`, `npm run start:prod`)
- Modify: `server/index.ts` (path traversal sanitation on exports/backups)
- Run: Full automated test suite across all 26+ test files.
- Run: Browser QA verification subagent on `http://127.0.0.1:4173`.

- [ ] **Step 1: Sanitize and harden file export boundaries**
  Ensure backup directory, report file downloads, and PDF attachment paths use `path.resolve` and verify child containment within authorized directories to prevent directory traversal.
- [ ] **Step 2: Add production scripts to `package.json`**
  Add `"start:prod": "node --experimental-strip-types server/index.ts"` and `"test:stress": "node --experimental-strip-types --test server/stress.test.ts"`.
- [ ] **Step 3: Run comprehensive verification**
  - `npm run typecheck`: 0 errors.
  - `npm test`: All test suites pass.
  - `npm run test:stress`: Stress test passes.
  - `npm run build`: Production bundle builds cleanly.
- [ ] **Step 4: Launch browser subagent for live visual & UX QA**
  Verify Command Palette (`Ctrl+K`), skeleton loading, mobile responsive layout, and zero console errors.
