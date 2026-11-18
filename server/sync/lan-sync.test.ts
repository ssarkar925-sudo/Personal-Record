import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db/schema.ts';
import { createAccount } from '../db/accounts-repo.ts';
import { createTransaction } from '../db/ledger-repo.ts';
import {
  generatePairingToken,
  validatePairingToken,
  exportDifferentialSync,
  ingestDifferentialSync,
  getLocalNetworkIps,
} from './lan-sync.ts';

describe('Multi-Device Local LAN Encrypted Sync', () => {
  it('detects network interfaces and manages pairing tokens cleanly', () => {
    const ips = getLocalNetworkIps();
    assert.ok(Array.isArray(ips));

    const token = generatePairingToken();
    assert.ok(token.token.length >= 8);
    assert.equal(validatePairingToken(token.token), true);
    assert.equal(validatePairingToken('invalid-token'), false);
  });

  it('exports and ingests differential changelog across two local databases', () => {
    const db1 = openDatabase(':memory:');
    const db2 = openDatabase(':memory:');

    // Create an account and transaction in db1
    const acc = createAccount(db1, {
      name: 'Salary Bank',
      type: 'bank',
      scope: 'personal',
      openingBalanceMinor: 1000000,
    });

    const tx = createTransaction(db1, {
      kind: 'income',
      scope: 'personal',
      accountId: acc.id,
      category: 'Salary',
      amountMinor: 500000,
      occurredAt: '2026-11-10',
      party: 'Acme Corp',
      note: 'November Paycheck',
    });

    // Export changelog from db1
    const changelog = exportDifferentialSync(db1);
    assert.equal(changelog.tables.accounts.length, 1);
    assert.equal(changelog.tables.transactions.length, 1);

    // Ingest into db2
    const ingestResult = ingestDifferentialSync(db2, changelog);
    assert.equal(ingestResult.ok, true);
    assert.equal(ingestResult.importedCounts.accounts, 1);
    assert.equal(ingestResult.importedCounts.transactions, 1);

    // Verify db2 has the synced data
    const row = db2.prepare('SELECT count(*) as count FROM transactions WHERE id = ?').get(tx.id) as { count: number };
    assert.equal(row.count, 1);

    db1.close();
    db2.close();
  });

  it('rejects disallowed tables and SQL injection attempts in differential sync payloads', () => {
    const db = openDatabase(':memory:');
    assert.throws(
      () =>
        ingestDifferentialSync(db, {
          version: 1,
          timestamp: new Date().toISOString(),
          tables: {
            vault_meta: [{ id: 1, wa_recovery_key: 'pwned' }],
          } as any,
        }),
      /disallowed table/i,
    );
    assert.throws(
      () =>
        ingestDifferentialSync(db, {
          version: 1,
          timestamp: new Date().toISOString(),
          tables: {
            'accounts; DROP TABLE accounts;--': [{ id: '1' }],
          } as any,
        }),
      /disallowed table/i,
    );
    db.close();
  });
});
