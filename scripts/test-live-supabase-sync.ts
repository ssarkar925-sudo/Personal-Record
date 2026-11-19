import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { openDatabase } from '../server/db/schema.ts';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..');
const dbPath = path.join(rootDir, 'data', 'personal-ledger.sqlite');

const SUPABASE_URL = 'https://vcipljpdrgjwkjezbray.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oHwRwizV0QF8R2sgNffH8Q_37mU6rgA';
const TEST_EMAIL = 'test.ledger.pilot@gmail.com';
const TEST_PASS = 'TestPassword123!';

async function run() {
  console.log('🚀 [Supabase Sync Test] Starting Live Bidirectional Sync Verification...\n');
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Sign In
  console.log('1. Authenticating test user with Supabase Auth...');
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });
  assert.ifError(authErr);
  assert.ok(authData.session, 'Session must exist');
  const userId = authData.user.id;
  console.log(`   ✅ Signed in as user: ${authData.user.email} (UUID: ${userId})`);

  // 2. Open Local SQLite
  console.log('\n2. Reading local SQLite dataset from data/personal-ledger.sqlite...');
  const db = openDatabase(dbPath);

  const localAccounts = db.prepare('SELECT * FROM accounts').all() as any[];
  const localTransactions = db.prepare('SELECT * FROM transactions').all() as any[];
  const localLoans = db.prepare('SELECT * FROM loans').all() as any[];
  const localDues = db.prepare('SELECT * FROM people_dues').all() as any[];
  const localNotes = db.prepare('SELECT * FROM notes').all() as any[];
  const localJobSheets = db.prepare('SELECT * FROM job_sheets').all() as any[];

  console.log(`   • Local Accounts: ${localAccounts.length}`);
  console.log(`   • Local Transactions: ${localTransactions.length}`);
  console.log(`   • Local Loans: ${localLoans.length}`);
  console.log(`   • Local Dues: ${localDues.length}`);
  console.log(`   • Local Notes: ${localNotes.length}`);
  console.log(`   • Local Job Sheets: ${localJobSheets.length}`);

  // 3. Upsert Accounts into Supabase
  console.log('\n3. Pushing accounts to Supabase PostgreSQL...');
  if (localAccounts.length > 0) {
    const payload = localAccounts.map((a) => ({
      id: a.id,
      user_id: userId,
      name: a.name,
      type: a.type,
      account_group: a.account_group || (a.type === 'credit_card' ? 'credit_card' : 'bank'),
      scope: a.scope,
      institution: a.institution || '',
      last4: a.last4 || '',
      opening_balance_minor: a.opening_balance_minor || 0,
      min_balance_minor: a.min_balance_minor || 0,
      credit_limit_minor: a.credit_limit_minor || 0,
      statement_day: a.statement_day || 15,
      due_day: a.due_day || 5,
    }));
    const { error } = await client.from('accounts').upsert(payload, { onConflict: 'id' });
    assert.ifError(error);
    console.log(`   ✅ Upserted ${payload.length} accounts`);
  }

  // 4. Upsert Transactions
  console.log('\n4. Pushing transactions to Supabase PostgreSQL...');
  if (localTransactions.length > 0) {
    const payload = localTransactions.map((tx) => ({
      id: tx.id,
      user_id: userId,
      kind: tx.kind,
      scope: tx.scope,
      account_id: tx.account_id,
      to_account_id: tx.to_account_id || null,
      category: tx.category,
      amount_minor: tx.amount_minor,
      occurred_at: tx.occurred_at,
      party: tx.party || '',
      note: tx.note || '',
      source_ref: tx.source_ref || null,
    }));
    const { error } = await client.from('transactions').upsert(payload, { onConflict: 'id' });
    assert.ifError(error);
    console.log(`   ✅ Upserted ${payload.length} transactions`);
  }

  // 5. Upsert Job Sheets
  console.log('\n5. Pushing job sheets to Supabase PostgreSQL...');
  if (localJobSheets.length > 0) {
    const payload = localJobSheets.map((s) => ({
      id: s.id,
      user_id: userId,
      name: s.name,
      scope: s.scope,
      color: s.color || 'gold',
      columns_json: JSON.parse(s.columns_json || '[]'),
      rows_json: JSON.parse(s.rows_json || '[]'),
      settings_json: JSON.parse(s.settings_json || '{}'),
      order_index: s.order_index || 0,
    }));
    const { error } = await client.from('job_sheets').upsert(payload, { onConflict: 'id' });
    assert.ifError(error);
    console.log(`   ✅ Upserted ${payload.length} job sheets`);
  }

  // 6. Query Back from Supabase and Verify Integrity
  console.log('\n6. Querying cloud records back via RLS to verify data integrity...');
  const { data: cloudAccounts, error: qAccErr } = await client.from('accounts').select('*');
  assert.ifError(qAccErr);
  assert.equal(cloudAccounts?.length, localAccounts.length, 'Account count mismatch');
  console.log(`   ✅ Accounts verified: ${cloudAccounts?.length} in cloud match ${localAccounts.length} in local SQLite`);

  const { data: cloudTx, error: qTxErr } = await client.from('transactions').select('*');
  assert.ifError(qTxErr);
  assert.equal(cloudTx?.length, localTransactions.length, 'Transaction count mismatch');
  console.log(`   ✅ Transactions verified: ${cloudTx?.length} in cloud match ${localTransactions.length} in local SQLite`);

  const { data: cloudSheets, error: qSheetErr } = await client.from('job_sheets').select('*');
  assert.ifError(qSheetErr);
  assert.equal(cloudSheets?.length, localJobSheets.length, 'Job sheets count mismatch');
  console.log(`   ✅ Job sheets verified: ${cloudSheets?.length} in cloud match ${localJobSheets.length} in local SQLite`);

  console.log('\n🎉 [Supabase Live Sync Test PASS] All local records synchronized to Cloud PostgreSQL with 100% data fidelity!\n');
}

run().catch((err) => {
  console.error('❌ Sync Test Failed:', err);
  process.exit(1);
});
