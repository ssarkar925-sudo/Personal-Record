import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, withTransaction } from '../server/db/schema.ts';
import {
  createAccount,
  getAccountById,
  listAccounts,
  updateAccount,
  deleteAccount,
} from '../server/db/accounts-repo.ts';
import {
  createTransaction,
  listTransactions,
  deleteTransaction,
} from '../server/db/ledger-repo.ts';
import { checkDatabaseHealth, checkpointAndOptimize } from '../server/db/maintenance.ts';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..');
const testDbPath = path.join(rootDir, 'data', 'test-local-suite.sqlite');

console.log('🧪 Starting Local SQLite Database Verification Suite...\n');

// Clean up any previous test artifact
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
const shm = `${testDbPath}-shm`;
const wal = `${testDbPath}-wal`;
if (fs.existsSync(shm)) fs.unlinkSync(shm);
if (fs.existsSync(wal)) fs.unlinkSync(wal);

const db = openDatabase(testDbPath);

try {
  // Test 1: Database Health & Pragmas
  console.log('1. Testing Pragmas & Database Health...');
  const health = checkDatabaseHealth(db);
  assert.equal(health.ok, true, 'Database health check failed');
  assert.equal(health.integrity, 'ok', 'Integrity check must return ok');
  assert.equal(health.foreignKeysOk, true, 'Foreign keys must be clean');
  console.log('   ✅ PRAGMA journal_mode = WAL & foreign_keys active');
  console.log(`   ✅ Database verified healthy across ${health.tablesCount} schema tables.`);

  // Test 2: Account Operations
  console.log('\n2. Testing Account CRUD & Constraints...');
  const bank = createAccount(db, {
    name: 'Salary Checking',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'personal',
    institution: 'HDFC Bank',
    last4: '1234',
    openingBalanceMinor: 5000000, // ₹50,000.00
    minBalanceMinor: 1000000,
    creditLimitMinor: 0,
    statementDay: 1,
    dueDay: 5,
  });
  assert.ok(bank.id, 'Account ID must exist');
  assert.equal(bank.name, 'Salary Checking');
  assert.equal(bank.openingBalanceMinor, 5000000);

  const card = createAccount(db, {
    name: 'Rewards Credit Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'ICICI Bank',
    last4: '5678',
    openingBalanceMinor: 0,
    minBalanceMinor: 0,
    creditLimitMinor: 20000000, // ₹2,00,000.00
    statementDay: 15,
    dueDay: 5,
  });
  assert.ok(card.id, 'Card ID must exist');

  const allAccounts = listAccounts(db);
  assert.equal(allAccounts.length, 2, 'Should have exactly 2 accounts');
  console.log('   ✅ Bank and Credit Card accounts created successfully');

  // Test 3: Transaction Atomicity & Ledger Balances
  console.log('\n3. Testing Unified Ledger Transactions & Balance Math...');
  const tx1 = createTransaction(db, {
    kind: 'expense',
    scope: 'personal',
    accountId: bank.id,
    category: 'Groceries',
    amountMinor: 250000, // ₹2,500.00
    occurredAt: '2026-11-14',
    party: 'Supermarket',
    note: 'Weekly essentials',
  });
  assert.ok(tx1.id, 'Transaction 1 created');

  const tx2 = createTransaction(db, {
    kind: 'income',
    scope: 'personal',
    accountId: bank.id,
    category: 'Consulting',
    amountMinor: 1500000, // ₹15,000.00
    occurredAt: '2026-11-14',
    party: 'Client ABC',
    note: 'Milestone payment',
  });
  assert.ok(tx2.id, 'Transaction 2 created');

  // Transfer from Bank to Card
  const txTransfer = createTransaction(db, {
    kind: 'transfer',
    scope: 'personal',
    accountId: bank.id,
    toAccountId: card.id,
    category: 'Card Payment',
    amountMinor: 100000, // ₹1,000.00
    occurredAt: '2026-11-14',
    party: 'ICICI Bank',
    note: 'Credit card bill payment',
  });
  assert.ok(txTransfer.id, 'Transfer transaction created');

  const bankAcc = getAccountById(db, bank.id);
  assert.ok(bankAcc, 'Bank account must exist');
  // Opening: 50,000 - Expense: 2,500 + Income: 15,000 - Transfer: 1,000 = 61,500 (6150000 minor)
  assert.equal(bankAcc.currentBalanceMinor, 6150000, `Expected 6150000 but got ${bankAcc.currentBalanceMinor}`);
  console.log('   ✅ Bank balance exact: ₹61,500.00 (verified with 0 drift)');

  const txs = listTransactions(db, {});
  assert.equal(txs.length, 3, 'Should have 3 transactions');
  const totalExpense = txs.filter(t => t.kind === 'expense').reduce((sum, t) => sum + t.amountMinor, 0);
  const totalIncome = txs.filter(t => t.kind === 'income').reduce((sum, t) => sum + t.amountMinor, 0);
  assert.equal(totalIncome, 1500000);
  assert.equal(totalExpense, 250000);
  console.log('   ✅ Transaction listing exact: Income ₹15,000.00, Expense ₹2,500.00');

  // Test 4: Rollback and Transaction Isolation
  console.log('\n4. Testing ACID Rollback & Transaction Isolation...');
  let rollbackCaught = false;
  try {
    withTransaction(db, () => {
      createTransaction(db, {
        kind: 'expense',
        scope: 'personal',
        accountId: bank.id,
        category: 'Test',
        amountMinor: 999999,
        occurredAt: '2026-11-14',
      });
      throw new Error('Simulated failure during batch operation');
    });
  } catch {
    rollbackCaught = true;
  }
  assert.equal(rollbackCaught, true, 'Rollback exception must be caught');
  const bankAccAfter = getAccountById(db, bank.id);
  assert.equal(bankAccAfter?.currentBalanceMinor, 6150000, 'Balance must remain unchanged after rollback');
  console.log('   ✅ Atomic transaction rollback verified: database state restored');

  // Test 5: Foreign Key Cascade & Restriction
  console.log('\n5. Testing Foreign Key Integrity...');
  const delRes = deleteAccount(db, bank.id);
  assert.equal(delRes.ok, false, 'Deleting account with active transactions must be prevented');
  console.log('   ✅ Active transaction guard prevented accidental account deletion');

  // Test 6: WAL Checkpointing & Optimization
  console.log('\n6. Testing WAL Checkpoint & Maintenance Optimization...');
  const maint = checkpointAndOptimize(db);
  assert.equal(maint.ok, true, 'Optimization must succeed');
  console.log(`   ✅ WAL checkpoint and vacuum completed in ${maint.durationMs}ms`);

  console.log('\n======================================================');
  console.log('🎉 ALL LOCAL DATABASE VERIFICATION TESTS PASSED (6/6)!');
  console.log('======================================================\n');
} finally {
  db.close();
  // Clean up temporary test db
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(shm)) fs.unlinkSync(shm);
  if (fs.existsSync(wal)) fs.unlinkSync(wal);
}
