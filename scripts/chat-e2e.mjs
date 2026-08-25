// chat-e2e.mjs — E2E test ChatPanel via Chrome DevTools Protocol
// Buka live site, klik FAB chat, kirim pesan, capture respons.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const exec = promisify(execFile);
const PORT = 9222;
const SITE = 'https://tltanpro.github.io/TITAN/';

// 1. Launch chromium with CDP
const chrome = exec('chromium-browser', [
  '--headless', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900',
  SITE,
], { timeout: 120000 }).catch(() => {});

await new Promise(r => setTimeout(r, 8000));

// 2. Get ws target
const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
const page = targets.find(t => t.type === 'page');
if (!page) { console.error('NO_PAGE'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return res.result?.result?.value;
}

// 3. Wait for app render
await new Promise(r => setTimeout(r, 5000));

// 4. Find & click chat FAB
const fabFound = await evaluate(`
  (function(){
    const btns = [...document.querySelectorAll('button')];
    const fab = btns.find(b => b.className.includes('rounded-full') && b.className.includes('shadow-2xl') && b.className.includes('bottom-6'));
    if (fab) { fab.click(); return true; }
    return false;
  })()
`);
console.log('FAB clicked:', fabFound);
await new Promise(r => setTimeout(r, 1500));

// 5. Find chat input & send message
const typed = await evaluate(`
  (function(){
    const inputs = document.querySelectorAll('textarea, input[type="text"]');
    const input = [...inputs].find(i => i.offsetParent !== null);
    if (!input) return 'NO_INPUT';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter.call(input, 'Sebutkan total pengikut semua akun dalam satu angka');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'TYPED';
  })()
`);
console.log('typed:', typed);

// submit via Enter or button
await evaluate(`
  (function(){
    const input = [...document.querySelectorAll('textarea, input[type="text"]')].find(i => i.offsetParent !== null);
    if (!input) return;
    const form = input.closest('form');
    if (form) { form.requestSubmit(); return; }
    const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
    const send = btns.find(b => b.querySelector('svg') && b !== input);
    if (send) send.click();
    else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  })()
`);

// 6. Wait for response (streaming) — poll last assistant message
let response = '';
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 3000));
  response = await evaluate(`
    (function(){
      const msgs = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="assistant"]');
      const last = msgs[msgs.length - 1];
      return last ? last.textContent.slice(0, 300) : '';
    })()
  `) || '';
  if (response.length > 10) break;
}
console.log('RESPONSE:', JSON.stringify(response.slice(0, 300)));

// 7. Screenshot the chat
const shot = await send('Page.captureScreenshot', { format: 'png' });
import fs from 'node:fs';
fs.writeFileSync('/data/data/com.termux/files/home/titan-screens/chat-e2e.png', Buffer.from(shot.result.data, 'base64'));
console.log('screenshot saved');

ws.close();
chrome.kill?.();
process.exit(0);
