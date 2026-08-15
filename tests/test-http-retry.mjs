// Quick test for http-retry helper — exercises terminal vs retryable paths.
// Not committed long-term; delete after verification.
import { fetchWithRetry, HttpTerminalError, classifyError } from '../scripts/lib/http-retry.mjs';

const t0 = Date.now();

console.log('Test 1: 404 → terminal (no retry)');
try {
  await fetchWithRetry('https://httpbin.org/status/404', {}, { tag: 'T1', maxAttempts: 3 });
  console.log('  FAIL: expected throw');
} catch (e) {
  console.log(`  PASS: ${e.constructor.name} after ${Date.now() - t0}ms — "${e.message.slice(0, 60)}"`);
}

console.log('\nTest 2: 500 → retryable, retries 3x with backoff');
const t2 = Date.now();
try {
  await fetchWithRetry('https://httpbin.org/status/500', {}, { tag: 'T2', maxAttempts: 3, backoffsMs: [0, 200, 400] });
  console.log('  FAIL: expected throw');
} catch (e) {
  console.log(`  PASS: ${e.constructor.name} after ${Date.now() - t2}ms — "${e.message.slice(0, 60)}"`);
}

console.log('\nTest 3: 429 with Retry-After: 1 → retryable');
const t3 = Date.now();
try {
  await fetchWithRetry('https://httpbin.org/status/429', {}, { tag: 'T3', maxAttempts: 2, backoffsMs: [0, 0] });
  console.log('  FAIL: expected throw');
} catch (e) {
  console.log(`  PASS: ${e.constructor.name} after ${Date.now() - t3}ms — "${e.message.slice(0, 60)}"`);
}

console.log('\nTest 4: classifyError');
console.log(`  HTTP 401 → ${classifyError(null, { status: 401 })}`);
console.log(`  HTTP 403 → ${classifyError(null, { status: 403 })}`);
console.log(`  HTTP 429 → ${classifyError(null, { status: 429 })}`);
console.log(`  HTTP 500 → ${classifyError(null, { status: 500 })}`);
console.log(`  HTTP 503 → ${classifyError(null, { status: 503 })}`);
console.log(`  HTTP 200 → ${classifyError(null, { status: 200 })}`);
console.log(`  Err 'login_required' → ${classifyError(new Error('login_required at /foo'))}`);
console.log(`  Err 'ETIMEDOUT' → ${classifyError(new Error('connect ETIMEDOUT'))}`);
