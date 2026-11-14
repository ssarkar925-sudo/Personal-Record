-- ==============================================================================
-- PERSONAL LEDGER - PRODUCTION SUPABASE POSTGRESQL SCHEMA
-- Multi-Device Real-Time Sync, Row-Level Security (RLS) & Cloud Storage
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ACCOUNTS (Banks, Credit Cards, Cash & Wallets)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card')),
    account_group TEXT NOT NULL DEFAULT 'bank',
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    institution TEXT NOT NULL DEFAULT '',
    last4 TEXT NOT NULL DEFAULT '',
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    min_balance_minor BIGINT NOT NULL DEFAULT 0,
    credit_limit_minor BIGINT NOT NULL DEFAULT 0,
    statement_day INT NOT NULL DEFAULT 15,
    due_day INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_scope ON public.accounts(user_id, scope);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own accounts" ON public.accounts
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 3. TRANSACTIONS (Unified Ledger: Incomes, Expenses, Transfers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT NOT NULL,
    to_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    category TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    occurred_at DATE NOT NULL,
    party TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    source_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tx_user_occurred ON public.transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_account ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_scope_category ON public.transactions(user_id, scope, category);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own transactions" ON public.transactions
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 4. RECURRING BILLS & AUTO-POSTING RULES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.recurring_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    title TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    frequency TEXT NOT NULL DEFAULT 'monthly',
    day_of_month INT NOT NULL DEFAULT 1,
    next_due_date DATE,
    auto_post BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own recurring bills" ON public.recurring_bills
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own category rules" ON public.category_rules
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 5. LOANS & AMORTIZATION PAYMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    direction TEXT NOT NULL CHECK (direction IN ('borrowed', 'lent')),
    principal_minor BIGINT NOT NULL CHECK (principal_minor > 0),
    remaining_minor BIGINT NOT NULL,
    interest_rate_apr NUMERIC(5, 2) NOT NULL DEFAULT 0,
    monthly_emi_minor BIGINT NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    due_date DATE,
    institution TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own loans" ON public.loans
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.loan_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
    payment_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    principal_component_minor BIGINT NOT NULL DEFAULT 0,
    interest_component_minor BIGINT NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own loan payments" ON public.loan_payments
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 6. PEOPLE DUES (Khatabook / Udhar Ledger)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.people_dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    person_name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    direction TEXT NOT NULL CHECK (direction IN ('need', 'give')),
    original_minor BIGINT NOT NULL CHECK (original_minor > 0),
    remaining_minor BIGINT NOT NULL,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_paid', 'settled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.people_dues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own people dues" ON public.people_dues
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.person_due_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    due_id UUID REFERENCES public.people_dues(id) ON DELETE CASCADE NOT NULL,
    settlement_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.person_due_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own due settlements" ON public.person_due_settlements
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 7. BUDGETS (Category & Scope Caps)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.category_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    category TEXT NOT NULL,
    monthly_limit_minor BIGINT NOT NULL CHECK (monthly_limit_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, scope, category)
);

ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own category budgets" ON public.category_budgets
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scope_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    monthly_limit_minor BIGINT NOT NULL CHECK (monthly_limit_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, scope)
);

ALTER TABLE public.scope_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own scope budgets" ON public.scope_budgets
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 8. SAVINGS GOALS & INVESTMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    title TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    target_minor BIGINT NOT NULL CHECK (target_minor > 0),
    current_minor BIGINT NOT NULL DEFAULT 0,
    target_date DATE,
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own savings goals" ON public.savings_goals
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.savings_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    goal_id UUID REFERENCES public.savings_goals(id) ON DELETE CASCADE NOT NULL,
    contribution_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own savings contributions" ON public.savings_contributions
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    title TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('personal', 'business', 'family')),
    asset_type TEXT NOT NULL CHECK (asset_type IN ('mutual_fund', 'stock', 'fixed_deposit', 'gold', 'crypto', 'real_estate', 'other')),
    invested_minor BIGINT NOT NULL CHECK (invested_minor >= 0),
    current_value_minor BIGINT NOT NULL CHECK (current_value_minor >= 0),
    units NUMERIC(14, 4) NOT NULL DEFAULT 0,
    purchase_date DATE NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own investments" ON public.investments
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 9. KEEP NOTES & CHECKLIST ROUTINES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'default',
    pinned BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    tags TEXT[] NOT NULL DEFAULT '{}',
    scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'business', 'family')),
    order_index INT NOT NULL DEFAULT 0,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notes_user_filter ON public.notes(user_id, archived, pinned DESC, updated_at DESC);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own notes" ON public.notes
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 10. RECEIPT & STATEMENT ATTACHMENTS (Cloud Storage Metadata)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.receipt_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    storage_bucket TEXT NOT NULL DEFAULT 'receipts',
    ocr_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.receipt_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own receipts" ON public.receipt_attachments
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 11. ENCRYPTED PASSWORD VAULT (Zero-Knowledge Ciphertext Storage)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.vault_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
    label TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Login',
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    last_rotated_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.vault_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own vault entries" ON public.vault_entries
    FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.vault_meta (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    salt TEXT NOT NULL,
    canary_ciphertext TEXT NOT NULL,
    canary_iv TEXT NOT NULL,
    canary_tag TEXT NOT NULL,
    recovery_key_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.vault_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own vault meta" ON public.vault_meta
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 12. APP PREFERENCES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    system_language TEXT NOT NULL DEFAULT 'en',
    privacy_masked BOOLEAN NOT NULL DEFAULT false,
    auto_lock_minutes INT NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own preferences" ON public.app_preferences
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- 13. CLOUD STORAGE BUCKET FOR RECEIPTS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own receipts" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own receipts" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own receipts" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ==============================================================================
-- 14. REALTIME REPLICATION (Instant Multi-Device Sync)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE 
    public.accounts, 
    public.transactions, 
    public.recurring_bills, 
    public.loans, 
    public.people_dues, 
    public.notes;
