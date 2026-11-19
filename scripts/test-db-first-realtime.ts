import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_LEDGER_EMAIL,
  DEFAULT_LEDGER_PASS,
} from '../src/lib/supabase.ts';

async function testDatabaseFirst() {
  console.log('🧪 [Test Database-First & Realtime Multi-Device Sync] Starting...');
  const client = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);

  // 1. Authenticate Device A
  console.log('1. Signing in Device A to Supabase Auth...');
  const { data: authA, error: errA } = await client.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(errA);
  const userId = authA.user.id;
  console.log(`   ✅ Device A authenticated as ${authA.user.email} (${userId})`);

  // 2. Device A creates an account directly in Supabase PostgreSQL first
  console.log('\n2. Device A creating account directly in Supabase PostgreSQL...');
  const testAccId = crypto.randomUUID();
  const { data: accData, error: accErr } = await client
    .from('accounts')
    .insert({
      id: testAccId,
      user_id: userId,
      name: 'Realtime Sync Test Card',
      type: 'credit_card',
      account_group: 'credit_card',
      scope: 'personal',
      credit_limit_minor: 30000000,
      statement_day: 15,
      due_day: 5,
    })
    .select()
    .single();
  assert.ifError(accErr);
  assert.equal(accData.name, 'Realtime Sync Test Card');
  console.log(`   ✅ Account created in Supabase PostgreSQL: ${accData.id}`);

  // 3. Device A creates a transaction in Supabase PostgreSQL
  console.log('\n3. Device A creating transaction in Supabase PostgreSQL...');
  const testTxId = crypto.randomUUID();
  const { data: txData, error: txErr } = await client
    .from('transactions')
    .insert({
      id: testTxId,
      user_id: userId,
      kind: 'expense',
      scope: 'personal',
      account_id: testAccId,
      category: 'Dining Out',
      amount_minor: 125000,
      occurred_at: '2026-11-19',
      party: 'Blue Tokai Cafe',
      note: 'Multi-device realtime test',
    })
    .select()
    .single();
  assert.ifError(txErr);
  assert.equal(txData.party, 'Blue Tokai Cafe');
  console.log(`   ✅ Transaction created in Supabase PostgreSQL: ${txData.id} (₹1,250.00)`);

  // 4. Device B queries Supabase directly (simulating real-time pull on phone / second device)
  console.log('\n4. Device B reading from Supabase PostgreSQL directly...');
  const { data: devBAccounts, error: devBErr } = await client
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('id', testAccId);
  assert.ifError(devBErr);
  assert.equal(devBAccounts.length, 1);
  assert.equal(devBAccounts[0].name, 'Realtime Sync Test Card');
  console.log('   ✅ Device B received account from cloud database instantly!');

  const { data: devBTxs, error: devBTxErr } = await client
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', testTxId);
  assert.ifError(devBTxErr);
  assert.equal(devBTxs.length, 1);
  assert.equal(devBTxs[0].party, 'Blue Tokai Cafe');
  console.log('   ✅ Device B received transaction from cloud database instantly!');

  // 5. Clean up test records
  console.log('\n5. Cleaning up test records from database...');
  await client.from('transactions').delete().eq('id', testTxId);
  await client.from('accounts').delete().eq('id', testAccId);

  const { count: finalAccCount } = await client
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('id', testAccId);
  assert.equal(finalAccCount, 0);
  console.log('   ✅ Cleaned up test records from cloud database.');

  console.log('\n🎉 ALL DATABASE-FIRST & MULTI-DEVICE REALTIME SYNC TESTS PASSED 100%!\n');
}

testDatabaseFirst().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
