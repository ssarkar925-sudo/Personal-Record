# Five-Pillar Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Personal Ledger with all 5 ecosystem capabilities: Progressive Web App (PWA) with offline caching and mobile install prompt, 1-Click Desktop App Launcher (.bat/.vbs in app window mode), Local Inbox Auto-Sync Watcher for automatic statement PDF/CSV drop ingestion, Multi-Device Local LAN Encrypted Sync with QR code pairing, and Live Financial Data Seeding for immediate onboarding.

**Architecture:**
1. **PWA & Offline Mobile Support:** Web manifest, service worker (`public/sw.js`) with cache-first static assets and network-first API requests, and an in-app "Install App" prompt modal.
2. **1-Click Desktop Launcher:** Dedicated Windows launcher scripts (`scripts/launch-desktop.bat` and `scripts/launch-desktop.vbs`) running the backend server and launching Edge/Chrome in dedicated application mode (`--app=http://127.0.0.1:4173`).
3. **Local Inbox Auto-Sync Watcher:** Automated file watcher monitoring `data/inbox/`, auto-ingesting PDF/CSV/image statement drops using the offline parser and moving them to `processed/`.
4. **Local LAN Encrypted Sync:** Zero-cloud peer-to-peer sync engine exposing pairing QR tokens, differential changelog pull/push, and AES-GCM encrypted replication.
5. **Live Data Seeding & Onboarding:** Realistic financial seed generator for bank accounts, credit cards, loans, dues, and recurring templates with an API trigger and Command Palette shortcut.

**Tech Stack:** Node 24 native SQLite, React 19, TypeScript 5.8, Tailwind CSS, Lucide icons, Vite, Web Crypto API.

---

## Global Constraints
- Node 24 native SQLite (`node:sqlite`) with `--experimental-strip-types`.
- Strict ZERO `violet` or `purple` CSS classes anywhere in frontend UI code (Impeccable strict rule).
- Local-first architecture: All data remains local; zero third-party cloud sync or telemetry.
- No float math for currency: All monetary values stored in minor units (`paise`/`cents`).
- Path traversal protection: All file operations validate base directory containment using `path.resolve`.

## Review Focus
1. Service Worker Caching: Must not cache `/api/*` endpoints to prevent stale financial balances or replay attacks.
2. Inbox Watcher Race Conditions: Must wait for file write streams to finish before reading to avoid partial PDF/CSV ingestion.
3. LAN Sync Conflict Resolution: Use Last-Write-Wins (LWW) based on ISO timestamp to prevent data overwriting.
4. Desktop Launcher Port Collision: Script must check if server is already running before spawning duplicate instances.
5. Safe Seeding: Ingesting sample data must never wipe existing user transactions unless explicitly instructed with confirmation.

---

### Task 1: PWA & Mobile Installation Engine

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `src/components/ui/InstallPwaPrompt.tsx`
- Modify: `src/App.tsx`
- Modify: `index.html`

- [ ] **Step 1: Create `public/manifest.webmanifest`**
  Define standard PWA metadata: `name: "Personal Ledger"`, `short_name: "Ledger"`, `start_url: "/"`, `display: "standalone"`, `theme_color: "#0f172a"`, `background_color: "#020617"`, and standard app icons.
- [ ] **Step 2: Create `public/sw.js`**
  Implement service worker:
  - Cache static core assets (`index.html`, CSS, JS, icons).
  - Cache-first strategy for static assets.
  - Network-first strategy for `/api/*` requests with offline fallback response.
- [ ] **Step 3: Create `src/components/ui/InstallPwaPrompt.tsx`**
  Create mobile install banner capturing the `beforeinstallprompt` event with "Install to Home Screen" and "Dismiss" buttons.
- [ ] **Step 4: Wire PWA registration into `index.html` and `src/App.tsx`**
  Add `<link rel="manifest" href="/manifest.webmanifest">` and register service worker in production.

---

### Task 2: 1-Click Desktop App Launcher

**Files:**
- Create: `scripts/launch-desktop.bat`
- Create: `scripts/launch-desktop.vbs`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/launch-desktop.bat`**
  Batch script checking if port 4173 is active. If not, boots `node --experimental-strip-types server/index.ts` in background, waits for port readiness, then launches Microsoft Edge or Google Chrome in app mode (`--app=http://127.0.0.1:4173`).
- [ ] **Step 2: Create `scripts/launch-desktop.vbs`**
  VBScript wrapper to launch `launch-desktop.bat` with hidden console window for seamless native feel.
- [ ] **Step 3: Add `npm run desktop` to `package.json`**

---

### Task 3: Local Inbox Auto-Sync & Statement Watcher

**Files:**
- Create: `server/watcher/inbox-watcher.ts`
- Create: `server/watcher/inbox-watcher.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write inbox watcher test**
  In `server/watcher/inbox-watcher.test.ts`:
  - Tests dropping sample CSV statement into test inbox directory.
  - Asserts watcher processes file, inserts transactions into database, and moves file to `processed/`.
- [ ] **Step 2: Implement `server/watcher/inbox-watcher.ts`**
  Implement `startInboxWatcher(options: { db, inboxDir, processedDir, failedDir })`.
  - Supports `.csv`, `.txt`, `.pdf`, `.png`, `.jpg`.
  - Uses `parseStatementInput` and `extractBankPdfText`.
  - Atomic transaction insertion.
- [ ] **Step 3: Connect inbox watcher to `server/index.ts`**
  Initialize watcher on boot pointing to `data/inbox/`.

---

### Task 4: Multi-Device Local LAN Encrypted Sync

**Files:**
- Create: `server/sync/lan-sync.ts`
- Create: `server/sync/lan-sync.test.ts`
- Modify: `server/index.ts`
- Create: `src/components/ui/LanSyncModal.tsx`

- [ ] **Step 1: Write LAN sync unit tests**
  In `server/sync/lan-sync.test.ts`:
  - Test pairing code generation.
  - Test differential export of changelog.
  - Test encrypted payload exchange.
- [ ] **Step 2: Implement `server/sync/lan-sync.ts`**
  - Detect local LAN IPv4 address (`os.networkInterfaces()`).
  - Manage one-time pairing PIN / token.
  - Differential changelog extraction (`getChangesSince(db, timestamp)`).
  - Apply changes with Last-Write-Wins resolution (`applyChanges(db, changes)`).
- [ ] **Step 3: Expose LAN sync endpoints in `server/index.ts`**
  - `GET /api/sync/status`
  - `POST /api/sync/pairing-token`
  - `GET /api/sync/export`
  - `POST /api/sync/import`
- [ ] **Step 4: Create `src/components/ui/LanSyncModal.tsx`**
  Add modal with local network QR code, pairing code, and "Sync Now" button.

---

### Task 5: Live Financial Data Seeding & Onboarding

**Files:**
- Create: `server/db/seed.ts`
- Create: `server/db/seed.test.ts`
- Modify: `server/index.ts`
- Modify: `src/components/ui/CommandPalette.tsx`

- [ ] **Step 1: Implement `server/db/seed.ts`**
  Seed realistic demo financial scenario:
  - 2 Bank accounts (Salary Bank, Savings).
  - 1 Credit card with ₹1,50,000 limit.
  - 1 Cash wallet.
  - 1 Active personal loan with EMI schedule.
  - 2 People dues (borrowed/lent).
  - 10+ Categorized transactions with realistic Indian expenses.
  - 2 Pinned notes with checklists.
- [ ] **Step 2: Write seed test `server/db/seed.test.ts`**
  Verify seed populates all tables without violating foreign keys or invariants.
- [ ] **Step 3: Expose `POST /api/system/seed` in `server/index.ts`**
- [ ] **Step 4: Add "Seed Demo Financial Data" to Command Palette**

---

### Task 6: Verification & End-to-End Testing

- [ ] Run `npm run typecheck` (assert 0 errors).
- [ ] Run `npm run test:all` (assert all test suites pass).
- [ ] Run `npm run build` (assert Vite builds cleanly).
- [ ] Run browser subagent to verify PWA meta, LAN sync modal, and seed action.
