import assert from 'node:assert/strict';
import { smartCache } from '../src/lib/smart-cache.ts';
import { clientDb } from '../src/lib/client-db.ts';

async function main() {
  console.log('🧪 [Smart Client Cache & Request Coalescing Test] Starting...');

  smartCache.clear();
  let serverFetchCount = 0;

  const mockFetcher = async () => {
    serverFetchCount++;
    await new Promise((r) => setTimeout(r, 50));
    return { saltB64: 'abc123salt', canaryIv: 'iv123', canaryCt: 'ct123' };
  };

  // 1. First fetch -> Cache Miss, server fetch executes
  console.log('1. First fetch (expecting server call)...');
  const res1 = await smartCache.fetchWithCache('test:vault_meta', mockFetcher, { ttlMs: 1000 });
  assert.equal(res1.saltB64, 'abc123salt');
  assert.equal(serverFetchCount, 1, 'Should call server on initial fetch');
  console.log('   ✅ Initial server call succeeded (serverFetchCount: 1)');

  // 2. Immediate second fetch -> Cache Hit, zero server calls!
  console.log('2. Immediate second fetch within TTL (expecting zero server calls)...');
  const res2 = await smartCache.fetchWithCache('test:vault_meta', mockFetcher, { ttlMs: 1000 });
  assert.equal(res2.saltB64, 'abc123salt');
  assert.equal(serverFetchCount, 1, 'Server call must be skipped (served from cache)');
  console.log('   ✅ Second call served instantly from cache (serverFetchCount still: 1)');

  // 3. Request Coalescing: Trigger 3 simultaneous concurrent fetches
  console.log('3. Triggering 3 simultaneous concurrent requests for new key...');
  let coalescedFetchCount = 0;
  const slowFetcher = async () => {
    coalescedFetchCount++;
    await new Promise((r) => setTimeout(r, 60));
    return { status: 'ok', data: [1, 2, 3] };
  };

  const [c1, c2, c3] = await Promise.all([
    smartCache.fetchWithCache('test:concurrent', slowFetcher, { ttlMs: 1000 }),
    smartCache.fetchWithCache('test:concurrent', slowFetcher, { ttlMs: 1000 }),
    smartCache.fetchWithCache('test:concurrent', slowFetcher, { ttlMs: 1000 }),
  ]);

  assert.equal(c1.status, 'ok');
  assert.equal(c2.status, 'ok');
  assert.equal(c3.status, 'ok');
  assert.equal(coalescedFetchCount, 1, 'Concurrent requests must coalesce into exactly 1 network call');
  console.log('   ✅ Request coalescing verified: 3 requests collapsed into 1 server call');

  // 4. Invalidation: mark cache dirty and fetch again
  console.log('4. Testing cache invalidation on mutation...');
  smartCache.invalidate('test:vault_meta');
  const res3 = await smartCache.fetchWithCache('test:vault_meta', mockFetcher, { ttlMs: 1000 });
  assert.equal(res3.saltB64, 'abc123salt');
  assert.equal(serverFetchCount, 2, 'Should re-fetch after invalidation');
  console.log('   ✅ Cache invalidation verified (serverFetchCount: 2)');

  // 5. Cloud Pull Throttle Test
  console.log('5. Testing ClientDatabaseManager cloud pull throttling...');
  clientDb.resetCloudPullThrottle();
  // Simulate pull 1
  (clientDb as any).lastCloudPullTimestamp = Date.now();
  const skippedResult = await clientDb.pullDataFromSupabase();
  assert.equal(skippedResult.skipped, true, 'Subsequent rapid pull within 15s must be throttled');
  console.log('   ✅ Rapid redundant cloud pull throttled (skipped: true)');

  // Telemetry check
  const tel = smartCache.getTelemetry();
  console.log('\n📊 Cache Telemetry Summary:');
  console.log(`   Cache Hits: ${tel.hits}`);
  console.log(`   Cache Misses: ${tel.misses}`);
  console.log(`   Server Calls Prevented: ${tel.serverCallsPrevented}`);
  assert.ok(tel.serverCallsPrevented >= 3, 'Must have prevented at least 3 server calls');

  console.log('\n🎉 ALL SMART CACHE & SERVER THROTTLING TESTS PASSED!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Cache test failed:', err);
  process.exit(1);
});
