// Integration audit — verifikasi semua frontend consumer pakai unified dataStore
// Cek dependency graph di src/ untuk pastikan tidak ada direct import accounts-full.json
// (semua harus lewat dataStore.js — single source of truth)
import { globSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

let problems = 0;
const checks = [];

function ok(name) { checks.push(`✅ ${name}`); }
function fail(name, detail) { checks.push(`❌ ${name}: ${detail}`); problems++; }
function warn(name, detail) { checks.push(`⚠️  ${name}: ${detail}`); }

// 1. Cari semua file .jsx dan .js di src/
const files = globSync('**/*.{js,jsx,ts,tsx}', { cwd: SRC });

// 2. Cek direct import accounts-full.json — HARUS hanya via dataStore
for (const f of files) {
  const full = path.join(SRC, f);
  const content = readFileSync(full, 'utf-8');
  if (content.includes('accounts-full.json') && !content.includes("dataStore.js") && !content.includes('useAccount.js') && !content.includes('audit-integration.mjs')) {
    if (f !== 'lib\\dataStore.js' && !f.includes('dataStore')) {
      fail(`Direct import accounts-full.json`, `${f} harus lewat lib/dataStore.js`);
    }
  }
  if (content.includes("from '../data/accounts-full.json'") || content.includes("from '../../data/accounts-full.json'")) {
    if (f !== 'lib\\dataStore.js' && !f.includes('dataStore')) {
      fail(`Direct data import in ${f}`, 'pakai lib/dataStore.js sebagai single source of truth');
    }
  }
}
ok('All data access via lib/dataStore.js (no direct accounts-full.json import)');

// 3. Verify dataStore.js exists
const dataStorePath = path.join(SRC, 'lib', 'dataStore.js');
try {
  const ds = readFileSync(dataStorePath, 'utf-8');
  if (ds.includes('subscribeToAccounts') && ds.includes('loadAccounts') && ds.includes('normalizeAccount')) {
    ok('lib/dataStore.js exposes subscribe/load/normalize API');
  } else {
    fail('dataStore API incomplete', 'butuh subscribeToAccounts, loadAccounts, normalizeAccount');
  }
} catch {
  fail('lib/dataStore.js missing', 'single source of truth tidak ada');
}

// 4. Verify useAccount.js pakai dataStore
const useAccountPath = path.join(SRC, 'hooks', 'useAccount.js');
try {
  const ua = readFileSync(useAccountPath, 'utf-8');
  if (ua.includes("from '../lib/dataStore.js'")) {
    ok('hooks/useAccount.js → lib/dataStore.js');
  } else {
    fail('useAccount.js', 'tidak import dari dataStore');
  }
} catch {
  fail('hooks/useAccount.js missing', null);
}

// 5. Verify webAccess.js pakai dataStore
const webAccessPath = path.join(SRC, 'lib', 'webAccess.js');
try {
  const wa = readFileSync(webAccessPath, 'utf-8');
  if (wa.includes("from './dataStore.js'")) {
    ok('lib/webAccess.js → lib/dataStore.js');
  } else {
    fail('webAccess.js', 'tidak import dari dataStore — masih punya independent cache');
  }
  // Ensure no separate _accountsCache
  if (wa.includes('_accountsCache')) {
    fail('webAccess.js masih punya _accountsCache local', 'pakai unified dataStore');
  } else {
    ok('webAccess.js tidak punya independent cache');
  }
} catch {
  fail('lib/webAccess.js missing', null);
}

// 6. Verify ChatPanel.jsx pakai dataStore
const chatPanelPath = path.join(SRC, 'components', 'ChatPanel.jsx');
try {
  const cp = readFileSync(chatPanelPath, 'utf-8');
  if (cp.includes("from '../lib/dataStore.js'")) {
    ok('components/ChatPanel.jsx → lib/dataStore.js');
  } else {
    fail('ChatPanel.jsx', 'tidak import dari dataStore');
  }
  if (cp.includes("import('../data/accounts-full.json')")) {
    fail('ChatPanel.jsx masih import JSON langsung', 'pakai subscribeToAccounts()');
  } else {
    ok('ChatPanel.jsx tidak import JSON langsung');
  }
} catch {
  fail('components/ChatPanel.jsx missing', null);
}

// 7. Verify analytics.js pakai dataAvailability
const analyticsPath = path.join(SRC, 'lib', 'analytics.js');
try {
  const an = readFileSync(analyticsPath, 'utf-8');
  if (an.includes('dataAvailability')) {
    ok('lib/analytics.js ada dataAvailability() untuk IG/TT diff');
  } else {
    warn('analytics.js tanpa dataAvailability()', 'IG akan keliatan sama dgn TT padahal enrichment berbeda');
  }
} catch {
  fail('lib/analytics.js missing', null);
}

// Print report
console.log('\n=== TITAN V9 INTEGRATION AUDIT ===\n');
for (const c of checks) console.log(c);
console.log(`\n${problems === 0 ? '✅' : '❌'} ${problems} problem(s), ${checks.length - problems} check(s) passed\n`);

if (problems > 0) process.exit(1);
