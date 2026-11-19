import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vcipljpdrgjwkjezbray.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oHwRwizV0QF8R2sgNffH8Q_37mU6rgA';
const TEST_EMAIL = 'test.ledger.pilot@gmail.com';
const TEST_PASS = 'TestPassword123!';

async function clean() {
  console.log('Connecting to Supabase...');
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    process.exit(1);
  }
  const userId = authData.user.id;
  console.log(`Signed in as ${authData.user.email} (${userId})`);

  // Delete all user data for fresh start
  console.log('Purging cloud records...');
  await client.from('transactions').delete().eq('user_id', userId);
  await client.from('receipt_attachments').delete().eq('user_id', userId);
  await client.from('accounts').delete().eq('user_id', userId);
  await client.from('loan_payments').delete().eq('user_id', userId);
  await client.from('loans').delete().eq('user_id', userId);
  await client.from('person_due_settlements').delete().eq('user_id', userId);
  await client.from('people_dues').delete().eq('user_id', userId);
  await client.from('notes').delete().eq('user_id', userId);
  await client.from('job_sheets').delete().eq('user_id', userId);
  await client.from('recurring_bills').delete().eq('user_id', userId);
  await client.from('category_rules').delete().eq('user_id', userId);
  await client.from('category_budgets').delete().eq('user_id', userId);
  await client.from('scope_budgets').delete().eq('user_id', userId);
  await client.from('savings_contributions').delete().eq('user_id', userId);
  await client.from('savings_goals').delete().eq('user_id', userId);
  await client.from('investments').delete().eq('user_id', userId);

  console.log('Verifying clean slate on Supabase...');
  const [acc, tx, sheets, notes] = await Promise.all([
    client.from('accounts').select('id', { count: 'exact' }),
    client.from('transactions').select('id', { count: 'exact' }),
    client.from('job_sheets').select('id', { count: 'exact' }),
    client.from('notes').select('id', { count: 'exact' }),
  ]);

  console.log(`Remaining accounts: ${acc.count ?? 0}`);
  console.log(`Remaining transactions: ${tx.count ?? 0}`);
  console.log(`Remaining job sheets: ${sheets.count ?? 0}`);
  console.log(`Remaining notes: ${notes.count ?? 0}`);
  console.log('✅ Supabase cloud data successfully purged for clean start!');
}

clean().catch((e) => {
  console.error(e);
  process.exit(1);
});
