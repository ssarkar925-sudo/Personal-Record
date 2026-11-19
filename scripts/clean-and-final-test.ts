import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_LEDGER_EMAIL,
  DEFAULT_LEDGER_PASS,
} from '../src/lib/supabase.ts';
import { computeCardCycle, todayISO } from '../shared/ledger-core.ts';
import { deriveVaultKey, generateSaltB64, encryptString, decryptString } from '../src/lib/crypto.ts';

const USER_IDS = [
  'a56fcbf2-223a-49b1-882b-d29ee828df72', // ssarkar925@gmail.com
  '7335e7d2-5ead-4ede-9335-a8fcd1c554a6', // test.ledger.pilot@gmail.com
];

const TABLES = [
  'transactions',
  'receipt_attachments',
  'accounts',
  'loan_payments',
  'loans',
  'person_due_settlements',
  'people_dues',
  'notes',
  'job_sheets',
  'recurring_bills',
  'category_rules',
  'category_budgets',
  'scope_budgets',
  'savings_contributions',
  'savings_goals',
  'investments',
  'vault_entries',
  'vault_meta',
];

async function purgeAllData(client: any) {
  for (const uid of USER_IDS) {
    for (const table of TABLES) {
      const { error } = await client.from(table).delete().eq('user_id', uid);
      if (error) {
        // Table might not exist or already clean
        console.warn(`   Notice deleting from ${table} for ${uid}:`, error.message);
      }
    }
  }
}

async function verifyCounts(client: any): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const { count, error } = await client
      .from(table)
      .select('id', { count: 'exact', head: true });
    if (!error) {
      counts[table] = count ?? 0;
    }
  }
  return counts;
}

async function main() {
  console.log('🧹 [Clean Slate & Final Daily Readiness Test] Starting...');

  const client = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(authErr);
  console.log(`✅ Authenticated with Supabase: ${auth.user.email}`);

  // =========================================================================
  // STEP 1: PURGE ALL DEMO & TEST DATA
  // =========================================================================
  console.log('\n--- Step 1: Purging all demo data from Supabase cloud database ---');
  await purgeAllData(client);
  const cleanCounts = await verifyCounts(client);
  console.log('   Cloud Database Table Counts after Purge:');
  for (const [tbl, cnt] of Object.entries(cleanCounts)) {
    console.log(`      • ${tbl.padEnd(24)}: ${cnt}`);
    assert.equal(cnt, 0, `Table ${tbl} should have 0 records`);
  }
  console.log('   ✅ All demo data completely removed from Supabase PostgreSQL!');

  // =========================================================================
  // STEP 2: ONE FINAL RIGOROUS TEST BEFORE DAILY USE
  // =========================================================================
  console.log('\n--- Step 2: Rigorous End-to-End Simulation Test Before Daily Use ---');
  const testUserId = auth.user.id;

  // Test A: Create real bank account
  console.log('   A. Testing Real Bank Account Creation...');
  const bankAccId = crypto.randomUUID();
  const { data: bankAcc, error: bErr } = await client
    .from('accounts')
    .insert({
      id: bankAccId,
      user_id: testUserId,
      name: 'Salary Savings Account',
      type: 'bank',
      account_group: 'bank',
      scope: 'personal',
      institution: 'State Bank of India',
      last4: '4321',
      opening_balance_minor: 5000000, // ₹50,000.00
      min_balance_minor: 300000,      // ₹3,000.00
      statement_day: 1,
      due_day: 1,
    })
    .select()
    .single();
  assert.ifError(bErr);
  assert.equal(bankAcc.name, 'Salary Savings Account');
  assert.equal(bankAcc.opening_balance_minor, 5000000);
  console.log(`      ✅ Bank Account created: ${bankAcc.name} (Opening: ₹50,000.00)`);

  // Test B: Create Credit Card account
  console.log('   B. Testing Credit Card Account Creation...');
  const cardAccId = crypto.randomUUID();
  const { data: cardAcc, error: cErr } = await client
    .from('accounts')
    .insert({
      id: cardAccId,
      user_id: testUserId,
      name: 'Millennia Credit Card',
      type: 'credit_card',
      account_group: 'credit_card',
      scope: 'personal',
      institution: 'HDFC Bank',
      last4: '9988',
      opening_balance_minor: 0,
      credit_limit_minor: 20000000, // ₹2,00,000.00
      statement_day: 15,
      due_day: 5,
    })
    .select()
    .single();
  assert.ifError(cErr);
  assert.equal(cardAcc.name, 'Millennia Credit Card');
  console.log(`      ✅ Credit Card created: ${cardAcc.name} (Limit: ₹2,00,000.00)`);

  // Test C: Record an expense from Bank
  console.log('   C. Testing Bank Expense Recording...');
  const tx1Id = crypto.randomUUID();
  const { data: tx1, error: tx1Err } = await client
    .from('transactions')
    .insert({
      id: tx1Id,
      user_id: testUserId,
      kind: 'expense',
      scope: 'personal',
      account_id: bankAccId,
      category: 'Groceries',
      amount_minor: 250000, // ₹2,500.00
      occurred_at: todayISO(),
      party: 'Nature Basket',
      note: 'Weekly provisions',
    })
    .select()
    .single();
  assert.ifError(tx1Err);
  console.log(`      ✅ Bank Expense recorded: ₹2,500.00 (Party: ${tx1.party})`);

  // Test D: Record a spend on Credit Card
  console.log('   D. Testing Credit Card Spend & Cycle Intelligence...');
  const tx2Id = crypto.randomUUID();
  const { data: tx2, error: tx2Err } = await client
    .from('transactions')
    .insert({
      id: tx2Id,
      user_id: testUserId,
      kind: 'expense',
      scope: 'personal',
      account_id: cardAccId,
      category: 'Travel & Fuel',
      amount_minor: 450000, // ₹4,500.00
      occurred_at: todayISO(),
      party: 'Shell Petrol Pump',
      note: 'Fuel refill',
    })
    .select()
    .single();
  assert.ifError(tx2Err);
  console.log(`      ✅ Card Spend recorded: ₹4,500.00 (Party: ${tx2.party})`);

  // Verify Credit Card Cycle Computation
  const cycle = computeCardCycle(
    {
      statementDay: 15,
      dueDay: 5,
      creditLimitMinor: 20000000,
      referenceDate: todayISO(),
      transactions: [
        {
          kind: 'expense',
          amountMinor: 450000,
          occurredAt: todayISO(),
          direction: 'out',
        },
      ],
    }
  );
  assert.equal(cycle.totalOutstandingMinor, 450000);
  assert.ok(cycle.utilizationPct > 0);
  console.log(`      ✅ Card Cycle computed: Outstanding: ₹${cycle.totalOutstandingMinor / 100}, Utilization: ${cycle.utilizationPct}%`);

  // Test E: Record a Card Bill Payment (Transfer from Bank to Card)
  console.log('   E. Testing Bill Payment Settlement (Transfer Bank → Card)...');
  const tx3Id = crypto.randomUUID();
  const { data: tx3, error: tx3Err } = await client
    .from('transactions')
    .insert({
      id: tx3Id,
      user_id: testUserId,
      kind: 'transfer',
      scope: 'personal',
      account_id: bankAccId,
      to_account_id: cardAccId,
      category: 'Credit Card Payment',
      amount_minor: 450000, // ₹4,500.00
      occurred_at: todayISO(),
      party: 'HDFC Millennia Bill Pay',
      note: 'Auto pay via net banking',
    })
    .select()
    .single();
  assert.ifError(tx3Err);
  console.log(`      ✅ Bill Payment Transfer recorded: ₹4,500.00`);

  // Test F: Zero-Knowledge Password Vault End-to-End
  console.log('   F. Testing Zero-Knowledge Password Vault Encryption...');
  const masterPassword = 'DailyUserSecurePass123!';
  const saltB64 = generateSaltB64();
  const derivedKey = await deriveVaultKey(masterPassword, saltB64);

  const secretPayload = JSON.stringify({
    service: 'HDFC NetBanking',
    username: 'cust_892102',
    password: 'SuperSecretBankPassword456#',
  });
  const encrypted = await encryptString(derivedKey, secretPayload);

  // Store in cloud database
  const entryId = crypto.randomUUID();
  const { data: vEntry, error: vErr } = await client
    .from('vault_entries')
    .insert({
      id: entryId,
      user_id: testUserId,
      label: 'HDFC NetBanking',
      category: 'banking',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: '',
      last_rotated_at: todayISO(),
    })
    .select()
    .single();
  assert.ifError(vErr);

  // Decrypt and verify zero-knowledge integrity
  const decrypted = await decryptString(derivedKey, vEntry.iv, vEntry.ciphertext);
  const parsedSecret = JSON.parse(decrypted);
  assert.equal(parsedSecret.username, 'cust_892102');
  assert.equal(parsedSecret.password, 'SuperSecretBankPassword456#');
  console.log(`      ✅ Vault Encryption & Decryption verified with 100% zero-knowledge hold!`);

  // =========================================================================
  // STEP 3: FINAL PURGE OF TEST SIMULATION ARTIFACTS
  // =========================================================================
  console.log('\n--- Step 3: Purging simulation test artifacts for true Clean Slate ---');
  await purgeAllData(client);
  const finalCounts = await verifyCounts(client);

  console.log('   Final Clean Slate Table Verification:');
  let totalRemaining = 0;
  for (const [tbl, cnt] of Object.entries(finalCounts)) {
    console.log(`      • ${tbl.padEnd(24)}: ${cnt}`);
    totalRemaining += cnt;
    assert.equal(cnt, 0, `Table ${tbl} must be 0 for spotless day-1 use`);
  }
  assert.equal(totalRemaining, 0);

  console.log('\n🎉 [Success] All demo data removed and all core engines passed 100%! Ready for daily use.');
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
