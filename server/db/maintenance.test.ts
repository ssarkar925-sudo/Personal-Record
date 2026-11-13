import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './schema.ts';
import {
  checkDatabaseHealth,
  checkpointAndOptimize,
  verifyBackupIntegrity,
} from './maintenance.ts';

describe('Database Maintenance & Integrity Engine', () => {
  it('runs database health checks and returns clean integrity status', () => {
    const db = openDatabase(':memory:');
    const health = checkDatabaseHealth(db);
    assert.equal(health.ok, true);
    assert.equal(health.integrity, 'ok');
    assert.equal(health.foreignKeysOk, true);
    assert.equal(typeof health.tablesCount, 'number');
    assert.ok(health.tablesCount > 0);
  });

  it('runs WAL truncation and database optimization without error', () => {
    const db = openDatabase(':memory:');
    const result = checkpointAndOptimize(db);
    assert.equal(result.ok, true);
    assert.ok(typeof result.durationMs === 'number');
  });

  it('verifies backup integrity correctly', () => {
    // Non-existent backup returns false
    const invalid = verifyBackupIntegrity('non_existent_file.sqlite');
    assert.equal(invalid.ok, false);
    assert.ok(invalid.error);
  });
});
