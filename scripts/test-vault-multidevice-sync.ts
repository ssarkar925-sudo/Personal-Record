import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_LEDGER_EMAIL,
  DEFAULT_LEDGER_PASS,
} from '../src/lib/supabase.ts';
import {
  deriveVaultKey,
  createCanary,
  verifyCanary,
  encryptVaultPayload,
  decryptVaultPayload,
  generateSaltB64,
  generateRecoveryKey,
  encryptMasterKeyWithRecovery,
} from '../src/lib/crypto.ts';

async function main() {
  console.log('🧪 [Multi-Device Vault Database-First Integration Test] Starting...');

  // Setup client representing Supabase cloud
  const clientA = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(errA);
  const userId = authA.user.id;
  console.log(`✅ Device A (Web App) signed in as ${authA.user.email} (${userId})`);

  // Device A sets master password "MySecureVaultPass2026!"
  console.log('1. Device A generating salt, key, and canary...');
  const masterPassword = 'MySecureVaultPass2026!';
  const saltB64 = generateSaltB64();
  const keyA = await deriveVaultKey(masterPassword, saltB64);
  const { canaryIv, canaryCt } = await createCanary(keyA);

  const recoveryKey = generateRecoveryKey();
  const escrow = await encryptMasterKeyWithRecovery(keyA, recoveryKey);

  // Device A saves vault meta directly to Supabase PostgreSQL first
  console.log('2. Device A saving vault_meta to Supabase PostgreSQL database...');
  const metaPayload = {
    user_id: userId,
    salt: saltB64,
    canary_ciphertext: canaryCt,
    canary_iv: canaryIv,
    canary_tag: '',
    recovery_key_hash: 'sha256-set',
    recovery_salt: escrow.recoverySaltB64,
    recovery_iv: escrow.recoveryIv,
    recovery_ciphertext: escrow.recoveryCt,
    wa_recovery_key: recoveryKey,
    updated_at: new Date().toISOString(),
  };

  const { data: savedMeta, error: metaErr } = await clientA
    .from('vault_meta')
    .upsert(metaPayload, { onConflict: 'user_id' })
    .select()
    .single();
  assert.ifError(metaErr);
  assert.equal(savedMeta.salt, saltB64);
  console.log('   ✅ Vault metadata stored in cloud database');

  // Device A creates an encrypted credential entry (e.g. HDFC NetBanking)
  console.log('3. Device A encrypting and saving a password entry to Supabase...');
  const secretPayload = {
    label: 'HDFC Bank NetBanking',
    category: 'Bank / Financial',
    username: 'cust_8492019',
    password: 'HdfcSuperSecretPassword#2026',
    url: 'https://netbanking.hdfcbank.com',
    notes: 'Primary business account',
    starred: true,
  };
  const { iv: entryIv, ciphertext: entryCt } = await encryptVaultPayload(keyA, secretPayload);
  const entryId = crypto.randomUUID();

  const { data: savedEntry, error: entryErr } = await clientA
    .from('vault_entries')
    .insert({
      id: entryId,
      user_id: userId,
      label: 'HDFC Bank NetBanking',
      category: 'Bank / Financial',
      ciphertext: entryCt,
      iv: entryIv,
      auth_tag: '',
      last_rotated_at: '2026-11-19',
    })
    .select()
    .single();
  assert.ifError(entryErr);
  assert.equal(savedEntry.id, entryId);
  console.log(`   ✅ Encrypted entry stored in cloud database: ${savedEntry.id}`);

  // -------------------------------------------------------------
  // SIMULATE DEVICE B (Android Mobile App - Fresh Device with 0 local data)
  // -------------------------------------------------------------
  console.log('\n4. Simulating Device B (Android Mobile App launch)...');
  const clientB = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({
    email: DEFAULT_LEDGER_EMAIL,
    password: DEFAULT_LEDGER_PASS,
  });
  assert.ifError(errB);

  // Device B checks if vault exists by querying Supabase vault_meta
  console.log('5. Device B querying Supabase database for vault_meta...');
  const { data: metaB, error: fetchMetaErr } = await clientB
    .from('vault_meta')
    .select('*')
    .eq('user_id', authB.user.id)
    .maybeSingle();
  assert.ifError(fetchMetaErr);
  assert.ok(metaB, 'Device B must find the vault metadata in the database');
  console.log('   ✅ Device B detected existing vault in cloud database! It will NOT ask to "Set Master Password"');
  console.log('   ✅ Device B renders: "Enter Master Password to unseal vault"');

  // Device B verifies master password against cloud canary
  console.log('6. User enters Master Password on Mobile App...');
  const keyB = await deriveVaultKey(masterPassword, metaB.salt);
  const canaryValid = await verifyCanary(keyB, metaB.canary_iv, metaB.canary_ciphertext);
  assert.equal(canaryValid, true, 'Canary verification must succeed on Device B');
  console.log('   ✅ Master Password validated on Device B');

  // Device B fetches encrypted entries from Supabase
  console.log('7. Device B fetching encrypted entries from cloud database...');
  const { data: entriesB, error: fetchEntriesErr } = await clientB
    .from('vault_entries')
    .select('*')
    .eq('user_id', authB.user.id);
  assert.ifError(fetchEntriesErr);
  assert.equal(entriesB.length, 1);
  console.log(`   ✅ Device B fetched ${entriesB.length} entries from database`);

  // Device B decrypts entry with derived key
  console.log('8. Device B decrypting entry locally with zero-knowledge key...');
  const decryptedB = await decryptVaultPayload(keyB, entriesB[0].iv, entriesB[0].ciphertext);
  assert.equal(decryptedB.username, 'cust_8492019');
  assert.equal(decryptedB.password, 'HdfcSuperSecretPassword#2026');
  assert.equal(decryptedB.notes, 'Primary business account');
  console.log('   ✅ Decrypted payload matches exactly on Mobile App:');
  console.log(`      Username: ${decryptedB.username}`);
  console.log(`      Password: ${decryptedB.password}`);

  // Clean up test data
  console.log('\n9. Cleaning up test vault data from cloud database...');
  await clientA.from('vault_entries').delete().eq('id', entryId);
  await clientA.from('vault_meta').delete().eq('user_id', userId);
  console.log('   ✅ Cloud database cleaned');

  console.log('\n🎉 ALL MULTI-DEVICE VAULT TESTS PASSED PERFECTLY!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
