# Supabase & Cloudflare Pages Cloud Production Guide

A complete zero-cost, cloud-hosted architecture for **Personal Ledger** featuring multi-device real-time sync (iPhone, Android, Windows, Mac), automated cloud backups, and high availability.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────────────┐
                      │              Cloudflare Pages (CDN)           │
                      │   - Hosts Vite React SPA (Globally Distributed)│
                      │   - PWA Installable on iPhone & Android       │
                      │   - Instant edge routing via `_redirects`     │
                      └──────────────────────┬────────────────────────┘
                                             │
                       HTTPS / WSS (Realtime)│
                                             ▼
                      ┌───────────────────────────────────────────────┐
                      │              Supabase Cloud (PaaS)            │
                      │   - Managed PostgreSQL with RLS Policies      │
                      │   - Real-Time WebSocket Replication           │
                      │   - Automated Daily Cloud Backups             │
                      │   - Built-in Secure Email & OAuth Auth        │
                      └───────────────────────────────────────────────┘
```

---

## Step 1: Create Your Free Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**:
   - **Name:** `Personal Ledger`
   - **Database Password:** Choose a strong password (save it securely).
   - **Region:** Choose the region closest to you (e.g. `ap-south-1` Mumbai or `ap-southeast-1` Singapore).
   - **Pricing Plan:** Free ($0/month forever).
3. Once the database provisions (takes ~1-2 minutes):
   - Go to **Project Settings** (gear icon) > **API**.
   - Copy **Project URL** (`https://<project-ref>.supabase.co`).
   - Copy **Project API Keys** > `anon` `public` key.

---

## Step 2: Deploy the PostgreSQL Schema

1. In your Supabase Dashboard, click on **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open [`supabase_schema.sql`](file:///C:/Users/PC/.gemini/antigravity/scratch/personal-ledger/supabase_schema.sql) in this repository, copy its entire contents, and paste it into the SQL Editor.
4. Click **Run** (green button).
5. You should see `Success. No rows returned`.
   - All 11 tables (`accounts`, `transactions`, `recurring_bills`, `category_rules`, `loans`, `loan_payments`, `people_dues`, `settlements`, `budgets`, `savings_goals`, `notes`, `receipts` storage bucket) are created.
   - Row-Level Security (RLS) is automatically enabled on every table so your financial data is strictly private to your user account.
   - Real-time PostgreSQL replication (`supabase_realtime`) is activated.

---

## Step 3: Deploy Frontend to Cloudflare Pages (Free)

### Method A: Deploy via GitHub (Recommended for Continuous Updates)

1. Push your Personal Ledger repository to GitHub (Private repository).
2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and log in.
3. In the sidebar, navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
4. Select your GitHub repository.
5. In the build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js version:** Set environment variable `NODE_VERSION` to `20` or higher.
6. Under **Environment variables**:
   - `VITE_SUPABASE_URL`: `<your-supabase-project-url>`
   - `VITE_SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
7. Click **Save and Deploy**.
8. In less than 1 minute, Cloudflare Pages gives you a custom URL (e.g. `https://personal-ledger-xyz.pages.dev`).

### Method B: One-Command Direct Deploy via Wrangler CLI

If you don't want to use GitHub:
```bash
npm run build
npx wrangler pages deploy dist --project-name personal-ledger
```

---

## Step 4: Multi-Device Daily Use & PWA Installation

### On Your Mobile Phone (iPhone or Android):
1. Open your Cloudflare Pages URL in Safari (iOS) or Chrome (Android).
2. **Install as App:**
   - **iPhone (Safari):** Tap the **Share** button (box with upward arrow) > scroll down > tap **Add to Home Screen**.
   - **Android (Chrome):** Tap the three-dot menu > tap **Install app** or **Add to Home screen**.
3. The Personal Ledger icon will appear on your phone's home screen with zero browser bars, opening as an instant full-screen app.
4. Tap **Cloud Sync** > **Create Account** or **Sign In** with your email.
5. All transactions, accounts, and loans sync instantly!

### Real-Time Live Sync:
- When you add a transaction on your phone (e.g. UPI payment at a store), your desktop dashboard updates **instantly in real time** without having to refresh the page.

---

## Step 5: Automated Backups & Maintenance

### 1. Supabase Automated Cloud Backups
- Supabase automatically performs daily database backups and stores them across multiple availability zones.
- You can trigger a point-in-time snapshot or export any time from **Supabase Dashboard > Database > Backups**.

### 2. Dual-Mode Local + Cloud Redundancy
- You can also continue using or testing the local SQLite database offline on your desktop.
- Run `npm run backup:gdrive` to maintain a local archive synced to your Google Drive / OneDrive folder anytime.
- In the app, click **Cloud Sync** > **Upload Local Data to Supabase** to do a complete 1-click migration whenever you want.

---

## Environment Variables Reference

| Variable | Description | Where to Get |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Supabase Project URL | Supabase Dashboard > Settings > API |
| `VITE_SUPABASE_ANON_KEY` | Public Anon JWT key | Supabase Dashboard > Settings > API |
