// visual-sweep.mjs — Light mode + mobile + Compare-with-selection screenshots
import fs from 'node:fs';

const PORT = 9223;
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const chromeProc = promisify(execFile)('chromium-browser', [
  '--headless', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900',
  'https://tltanpro.github.io/TITAN/',
], { timeout: 300000 }).catch(() => {});
const chrome = chromeProc.child ?? chromeProc;

await new Promise(r => setTimeout(r, 8000));
const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`/data/data/com.termux/files/home/titan-screens/${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
const goto = async (url) => { await send('Page.navigate', { url }); await new Promise(r => setTimeout(r, 7000)); };

await new Promise(r => setTimeout(r, 5000));

// === LIGHT MODE ===
await evaluate(`localStorage.setItem('titan.theme.v1','light'); document.documentElement.classList.remove('dark'); 'ok'`);
await new Promise(r => setTimeout(r, 1500));
await shot('light-home');
await goto('https://tltanpro.github.io/TITAN/admin'); await shot('light-admin');
await goto('https://tltanpro.github.io/TITAN/calendar'); await shot('light-calendar');
await goto('https://tltanpro.github.io/TITAN/ai'); await shot('light-ai');

// === MOBILE ===
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await evaluate(`localStorage.setItem('titan.theme.v1','dark'); document.documentElement.classList.add('dark'); 'ok'`);
await goto('https://tltanpro.github.io/TITAN/'); await shot('mobile-home');
await goto('https://tltanpro.github.io/TITAN/admin'); await shot('mobile-admin');
await goto('https://tltanpro.github.io/TITAN/library'); await shot('mobile-library');

// === COMPARE with 3 accounts selected ===
await send('Emulation.clearDeviceMetricsOverride');
await goto('https://tltanpro.github.io/TITAN/compare');
await new Promise(r => setTimeout(r, 3000));
const clicked = await evaluate(`
  (function(){
    const chips = [...document.querySelectorAll('button')].filter(b => b.textContent.includes('@majangmejeng_') || b.textContent.includes('@ardiantanah') || b.textContent.includes('@itsnisyananda'));
    chips.slice(0, 3).forEach(c => c.click());
    return chips.length;
  })()
`);
console.log('chips clicked:', clicked);
await new Promise(r => setTimeout(r, 4000));
await shot('compare-selected');

// === ADMIN komentar tab ===
await goto('https://tltanpro.github.io/TITAN/admin');
await new Promise(r => setTimeout(r, 3000));
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Komentar Admin'))?.click(); 'ok'`);
await new Promise(r => setTimeout(r, 3000));
await shot('admin-comments');

ws.close();
try { process.kill(chrome.pid ?? 0); } catch {}
process.exit(0);
