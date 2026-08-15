import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('accounts-live.json', 'utf8'));
const accts = Array.isArray(d) ? d : (d.accounts || []);
for (const a of accts) {
  const acc = a.account || a;
  const username = acc.username || acc.slug || '(no-name)';
  const la = acc.localAvatar || '';
  const pp = acc.profilePicUrl || '';
  const keys = Object.keys(acc).filter((k) => /avatar|profile|pic|url/i.test(k));
  console.log(`${a.platform.padEnd(10)} @${username.padEnd(22)} | localAvatar=${la ? 'YES' : 'NO '} | profilePicUrl=${pp ? 'YES' : 'NO '} | keys=[${keys.join(',')}]`);
}
