import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_LEDGER_EMAIL,
  DEFAULT_LEDGER_PASS,
} from '../src/lib/supabase.ts';
import { parseStatementInput } from '../src/lib/statement-parser.ts';
import { computeCardCycle, todayISO, rupeesToPaise } from '../shared/ledger-core.ts';
import type { AccountRecord, TransactionRecord } from '../src/lib/api.ts';

async function runFoundationalSetupAndSync() {
  console.log('🚀 [Setup & Sync Verification] Starting foundational accounts, bills, statement import & multi-device sync test...');

  // Initialize Supabase client
  const clientA = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(errA);
  const userId = authA.user.id;
  console.log(`✅ Device A authenticated as sovereign user: ${authA.user.email} (${userId})`);

  // =========================================================================
  // STEP 1: INITIALIZE CORE FOUNDATIONAL ACCOUNTS IN SUPABASE POSTGRESQL
  // =========================================================================
  console.log('\n--- Step 1: Initializing Core Accounts in Supabase PostgreSQL ---');

  // Check existing accounts
  const { data: existingAccounts, error: fetchErr } = await clientA
    .from('accounts')
    .select('*')
    .eq('user_id', userId);
  assert.ifError(fetchErr);

  let bankAcc = existingAccounts?.find((a) => a.name === 'Primary Savings Account');
  if (!bankAcc) {
    const id = crypto.randomUUID();
    const { data, error } = await clientA
      .from('accounts')
      .insert({
        id,
        user_id: userId,
        name: 'Primary Savings Account',
        type: 'bank',
        account_group: 'bank',
        scope: 'personal',
        institution: 'HDFC Bank',
        last4: '1024',
        opening_balance_minor: 2500000, // ₹25,000.00
        min_balance_minor: 500000,     // ₹5,000.00
        credit_limit_minor: 0,
        statement_day: 1,
        due_day: 1,
      })
      .select()
      .single();
    assert.ifError(error);
    bankAcc = data;
    console.log(`   ✅ Created Primary Savings Account (HDFC Bank ...1024): ₹25,000 opening`);
  } else {
    console.log(`   ℹ️ Primary Savings Account already exists (${bankAcc.id})`);
  }

  let creditCardAcc = existingAccounts?.find((a) => a.name === 'Core Credit Card');
  if (!creditCardAcc) {
    const id = crypto.randomUUID();
    const { data, error } = await clientA
      .from('accounts')
      .insert({
        id,
        user_id: userId,
        name: 'Core Credit Card',
        type: 'credit_card',
        account_group: 'credit_card',
        scope: 'personal',
        institution: 'ICICI Bank',
        last4: '8842',
        opening_balance_minor: 0,
        min_balance_minor: 0,
        credit_limit_minor: 15000000, // ₹1,50,000.00
        statement_day: 15,
        due_day: 5,
      })
      .select()
      .single();
    assert.ifError(error);
    creditCardAcc = data;
    console.log(`   ✅ Created Core Credit Card (ICICI ...8842): Limit ₹1,50,000, Stmt Day: 15th, Due Day: 5th`);
  } else {
    console.log(`   ℹ️ Core Credit Card already exists (${creditCardAcc.id})`);
  }

  let cashAcc = existingAccounts?.find((a) => a.name === 'Cash Wallet');
  if (!cashAcc) {
    const id = crypto.randomUUID();
    const { data, error } = await clientA
      .from('accounts')
      .insert({
        id,
        user_id: userId,
        name: 'Cash Wallet',
        type: 'bank',
        account_group: 'cash',
        scope: 'personal',
        institution: 'Physical Cash',
        last4: '',
        opening_balance_minor: 500000, // ₹5,000.00
        min_balance_minor: 0,
        credit_limit_minor: 0,
        statement_day: 1,
        due_day: 1,
      })
      .select()
      .single();
    assert.ifError(error);
    cashAcc = data;
    console.log(`   ✅ Created Cash Wallet: ₹5,000 opening`);
  } else {
    console.log(`   ℹ️ Cash Wallet already exists (${cashAcc.id})`);
  }

  // =========================================================================
  // STEP 2: CONFIGURE RECURRING UTILITY BILLS IN SUPABASE POSTGRESQL
  // =========================================================================
  console.log('\n--- Step 2: Configuring Recurring Utility Bills in Supabase ---');

  const { data: existingBills, error: billFetchErr } = await clientA
    .from('recurring_bills')
    .select('*')
    .eq('user_id', userId);
  assert.ifError(billFetchErr);

  let fiberBill = existingBills?.find((b) => b.title === 'Broadband / Fiber Internet');
  if (!fiberBill) {
    const id = crypto.randomUUID();
    const { data, error } = await clientA
      .from('recurring_bills')
      .insert({
        id,
        user_id: userId,
        title: 'Broadband / Fiber Internet',
        scope: 'personal',
        kind: 'expense',
        account_id: bankAcc.id,
        category: 'Utilities & Telecom',
        amount_minor: 99900, // ₹999.00
        frequency: 'monthly',
        day_of_month: 10,
        auto_post: false,
        active: true,
      })
      .select()
      .single();
    assert.ifError(error);
    fiberBill = data;
    console.log(`   ✅ Created Recurring Bill: Broadband / Fiber Internet (₹999 on 10th of month)`);
  } else {
    console.log(`   ℹ️ Broadband bill already exists (${fiberBill.id})`);
  }

  let powerBill = existingBills?.find((b) => b.title === 'Electricity / Power');
  if (!powerBill) {
    const id = crypto.randomUUID();
    const { data, error } = await clientA
      .from('recurring_bills')
      .insert({
        id,
        user_id: userId,
        title: 'Electricity / Power',
        scope: 'personal',
        kind: 'expense',
        account_id: bankAcc.id,
        category: 'Utilities & Telecom',
        amount_minor: 250000, // ₹2,500.00
        frequency: 'monthly',
        day_of_month: 18,
        auto_post: false,
        active: true,
      })
      .select()
      .single();
    assert.ifError(error);
    powerBill = data;
    console.log(`   ✅ Created Recurring Bill: Electricity / Power (₹2,500 on 18th of month)`);
  } else {
    console.log(`   ℹ️ Electricity bill already exists (${powerBill.id})`);
  }

  // =========================================================================
  // STEP 3: DEMONSTRATE & VERIFY BANK STATEMENT / CSV IMPORT
  // =========================================================================
  console.log('\n--- Step 3: Bank Statement (CSV & SMS Text) Ingestion & Parse ---');

  // Sample real-world CSV statement input
  const sampleCsvStatement = `Date,Narration / Merchant,Debit,Credit,Balance
2026-11-10,UPI/Swiggy Food Order/Bangalore,450.00,,24550.00
2026-11-12,UPI/Amazon India Shopping/Mumbai,1299.00,,23251.00
2026-11-14,Airtel Broadband Recharge,999.00,,22252.00
2026-11-15,Salary Credited by TechCorp Solutions,,85000.00,107252.00`;

  const accountsForParser: AccountRecord[] = [
    {
      id: bankAcc.id,
      name: bankAcc.name,
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC Bank',
      last4: '1024',
      openingBalanceMinor: 2500000,
      minBalanceMinor: 500000,
      creditLimitMinor: 0,
      statementDay: 1,
      dueDay: 1,
      currentBalanceMinor: 2500000,
      cardCycle: null,
      createdAt: bankAcc.created_at,
    },
    {
      id: creditCardAcc.id,
      name: creditCardAcc.name,
      type: 'credit_card',
      scope: 'personal',
      institution: 'ICICI Bank',
      last4: '8842',
      openingBalanceMinor: 0,
      minBalanceMinor: 0,
      creditLimitMinor: 15000000,
      statementDay: 15,
      dueDay: 5,
      currentBalanceMinor: 0,
      cardCycle: null,
      createdAt: creditCardAcc.created_at,
    },
  ];

  const parsedCsvCandidates = parseStatementInput({
    rawText: sampleCsvStatement,
    accounts: accountsForParser,
    existingTransactions: [],
    defaultAccountId: bankAcc.id,
    defaultScope: 'personal',
  });

  console.log(`   ✅ Parsed ${parsedCsvCandidates.length} statement rows from CSV:`);
  for (const c of parsedCsvCandidates) {
    console.log(`      • [${c.occurredAt}] ${c.kind.toUpperCase()} ₹${(c.amountMinor / 100).toFixed(2)} | Party: "${c.party}" | Category: ${c.category} | Scope: ${c.scope}`);
  }
  assert.equal(parsedCsvCandidates.length, 4);
  assert.equal(parsedCsvCandidates[0].category, 'Food & Dining');
  assert.equal(parsedCsvCandidates[1].category, 'Shopping & Groceries');
  assert.equal(parsedCsvCandidates[2].category, 'Utilities & Telecom');
  assert.equal(parsedCsvCandidates[3].category, 'Salary');
  assert.equal(parsedCsvCandidates[3].kind, 'income');

  // Also verify bank SMS text statement parsing
  const sampleSmsAlerts = `Sent Rs.3,450.00 via ICICI Card ending 8842 to Croma Electronics on 16-Nov-2026. Avbl Lmt: Rs.1,46,550.00
Spent Rs.750.00 on ICICI Card 8842 at Starbucks Coffee on 18-Nov-2026. Ref: 98124`;

  const parsedSmsCandidates = parseStatementInput({
    rawText: sampleSmsAlerts,
    accounts: accountsForParser,
    existingTransactions: [],
    defaultAccountId: creditCardAcc.id,
    defaultScope: 'personal',
  });
  console.log(`   ✅ Parsed ${parsedSmsCandidates.length} SMS card spend alerts:`);
  for (const s of parsedSmsCandidates) {
    console.log(`      • [${s.occurredAt}] ${s.kind.toUpperCase()} ₹${(s.amountMinor / 100).toFixed(2)} | Account: ${s.accountName} (...${accountsForParser.find(a => a.id === s.accountId)?.last4}) | Category: ${s.category}`);
  }
  assert.equal(parsedSmsCandidates.length, 2);
  assert.equal(parsedSmsCandidates[0].accountId, creditCardAcc.id);
  assert.equal(parsedSmsCandidates[0].amountMinor, 345000);
  assert.equal(parsedSmsCandidates[1].accountId, creditCardAcc.id);
  assert.equal(parsedSmsCandidates[1].amountMinor, 75000);

  // Commit these parsed transactions directly to Supabase PostgreSQL
  console.log('\n--- Step 4: Committing Ingested Transactions to Cloud PostgreSQL ---');
  const allImportItems = [
    ...parsedCsvCandidates.map((c) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      kind: c.kind,
      scope: c.scope,
      account_id: c.accountId,
      category: c.category,
      amount_minor: c.amountMinor,
      occurred_at: c.occurredAt,
      party: c.party,
      note: c.note,
      source_ref: 'statement_csv',
    })),
    ...parsedSmsCandidates.map((s) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      kind: s.kind,
      scope: s.scope,
      account_id: s.accountId,
      category: s.category,
      amount_minor: s.amountMinor,
      occurred_at: s.occurredAt,
      party: s.party,
      note: s.note,
      source_ref: 'sms_alert',
    })),
  ];

  const { data: insertedTxs, error: txInsertErr } = await clientA
    .from('transactions')
    .insert(allImportItems)
    .select();
  assert.ifError(txInsertErr);
  console.log(`   ✅ Successfully committed ${insertedTxs.length} transactions directly to Supabase PostgreSQL!`);

  // =========================================================================
  // STEP 5: VERIFY CREDIT CARD CYCLE CALCULATION
  // =========================================================================
  console.log('\n--- Step 5: Verifying Credit Card Billing Cycle & Statement Separation ---');

  // Convert inserted transactions to TransactionRecord format
  const cardTxs: TransactionRecord[] = insertedTxs
    .filter((t) => t.account_id === creditCardAcc.id)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      scope: t.scope,
      accountId: t.account_id,
      accountName: creditCardAcc.name,
      toAccountId: null,
      toAccountName: null,
      category: t.category,
      amountMinor: t.amount_minor,
      occurredAt: t.occurred_at,
      party: t.party,
      note: t.note,
      sourceRef: t.source_ref,
      createdAt: t.created_at,
    }));

  const cycle = computeCardCycle({
    statementDay: 15,
    dueDay: 5,
    creditLimitMinor: 15000000,
    referenceDate: '2026-11-19',
    transactions: cardTxs.map((t) => ({
      kind: t.kind,
      amountMinor: t.amountMinor,
      occurredAt: t.occurredAt,
      direction: (t.kind === 'income' ? 'in' : 'out') as 'in' | 'out',
    })),
  });

  console.log(`   Credit Card Cycle Analysis (as of 2026-11-19):`);
  console.log(`      • Total Outstanding Debt : ₹${(cycle.totalOutstandingMinor / 100).toFixed(2)}`);
  console.log(`      • Last Statement Date    : ${cycle.lastStatementDate} (15th)`);
  console.log(`      • Next Statement Date    : ${cycle.nextStatementDate}`);
  console.log(`      • Next Due Date          : ${cycle.nextDueDate} (5th)`);
  console.log(`      • Days Until Due         : ${cycle.daysUntilDue} days`);
  console.log(`      • Billed Statement Due   : ₹${(cycle.statementDueMinor / 100).toFixed(2)}`);
  console.log(`      • Unbilled Fresh Spends  : ₹${(cycle.unbilledMinor / 100).toFixed(2)}`);
  console.log(`      • Credit Utilization     : ${cycle.utilizationPct}%`);

  // The transactions occurred on 2026-11-16 and 2026-11-18, which is AFTER the 15th statement date!
  // Therefore they should correctly be classified as unbilled spend!
  assert.equal(cycle.totalOutstandingMinor, 345000 + 75000);
  assert.equal(cycle.unbilledMinor, 420000); // ₹4,200 unbilled
  assert.equal(cycle.statementDueMinor, 0);   // ₹0 billed due (cycle ended on 15th)
  console.log(`   ✅ Credit Card statement separation verified: Spends after 15th correctly isolated in unbilled pool.`);

  // =========================================================================
  // STEP 6: VERIFY MULTI-DEVICE SYNC WITH DEVICE B
  // =========================================================================
  console.log('\n--- Step 6: Verifying Multi-Device Sync (Device B - Mobile Client Simulation) ---');

  const clientB = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(errB);
  console.log(`   ✅ Device B authenticated to Supabase Auth.`);

  // Device B pulls cloud accounts, recurring bills, and transactions
  const [bAccs, bBills, bTxs] = await Promise.all([
    clientB.from('accounts').select('*').eq('user_id', authB.user.id),
    clientB.from('recurring_bills').select('*').eq('user_id', authB.user.id),
    clientB.from('transactions').select('*').eq('user_id', authB.user.id),
  ]);

  assert.ifError(bAccs.error);
  assert.ifError(bBills.error);
  assert.ifError(bTxs.error);

  console.log(`   Device B Cloud Read:`);
  console.log(`      • Accounts Found        : ${bAccs.data.length} (Expected >= 3)`);
  console.log(`      • Recurring Bills Found : ${bBills.data.length} (Expected >= 2)`);
  console.log(`      • Transactions Found    : ${bTxs.data.length} (Expected >= 6)`);
  assert.ok(bAccs.data.length >= 3);
  assert.ok(bBills.data.length >= 2);
  assert.ok(bTxs.data.length >= 6);

  // Device B adds a transaction (e.g. mobile user buys coffee ₹220)
  console.log('\n   Device B posting mobile transaction to Supabase PostgreSQL...');
  const mobileTxId = crypto.randomUUID();
  const { data: newMobileTx, error: mobErr } = await clientB
    .from('transactions')
    .insert({
      id: mobileTxId,
      user_id: authB.user.id,
      kind: 'expense',
      scope: 'personal',
      account_id: cashAcc.id,
      category: 'Food & Dining',
      amount_minor: 22000, // ₹220.00
      occurred_at: todayISO(),
      party: 'Blue Tokai Coffee',
      note: 'Mobile Cash Spend',
      source_ref: 'mobile_sync_test',
    })
    .select()
    .single();
  assert.ifError(mobErr);
  console.log(`   ✅ Device B posted mobile transaction: ${newMobileTx.party} (₹220.00)`);

  // Device A verifies the mobile transaction exists immediately in Supabase
  const { data: aSeenMobileTx, error: aSeenErr } = await clientA
    .from('transactions')
    .select('*')
    .eq('id', mobileTxId)
    .single();
  assert.ifError(aSeenErr);
  assert.equal(aSeenMobileTx.party, 'Blue Tokai Coffee');
  assert.equal(aSeenMobileTx.amount_minor, 22000);
  console.log(`   ✅ Device A successfully retrieved Device B's mobile transaction in real-time from Supabase!`);

  console.log('\n🎉 [Success] Foundational accounts, recurring bills, statement parser, and multi-device cloud sync fully verified!');
}

runFoundationalSetupAndSync().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
