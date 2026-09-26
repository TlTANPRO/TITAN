// UI audit gate for TITAN.
//
// Visits every route in a real browser and fails on P0/P1 findings so a broken
// release cannot ship. Wired into scripts/deploy.mjs before the build step.
//
//   node scripts/audit-ui.mjs [--base=http://127.0.0.1:4173] [--out=.audit] [--strict]
//
// Exit codes:  0 clean (or only P2)   1 P0/P1 found   2 could not run
//
// Requires puppeteer-core and a local Chrome. If either is missing the script
// exits 2 with a clear message rather than pretending the audit passed, unless
// --skip-unavailable is passed.
//
// Two measurement bugs this file had in an earlier form, kept here as comments
// so they are not reintroduced:
//   1. Navigating to the same URL twice (once to seed localStorage, once to
//      "reload") makes `vite preview` answer with its "public base URL is
//      /TITAN/" error page. Every route then measures ~106 characters and
//      looks empty. Seed storage on the origin, then navigate exactly once.
//   2. Toggling the theme class after load fights AppShell's own effect and
//      leaves the app with only the skip link rendered. Theme must be set
//      before the app boots, never after.
import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const BASE = arg('base', 'http://127.0.0.1:4173');
const OUT = arg('out', path.join(process.cwd(), '.audit'));
const STRICT = has('strict');
const SKIP_IF_UNAVAILABLE = has('skip-unavailable');
const ONLY = arg('only', null);
// Dark is the app's default presentation, so it is audited first. A light-only
// audit leaves the theme most users actually see untested.
const THEMES = arg('themes', 'dark,light').split(',').map((t) => t.trim()).filter(Boolean);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const ROUTES = [
  { path: '/TITAN/', name: 'landing' },
  { path: '/TITAN/dashboard', name: 'dashboard' },
  { path: '/TITAN/account', name: 'account' },
  { path: '/TITAN/account/ig-majangmejeng_', name: 'account-detail' },
  { path: '/TITAN/compare', name: 'compare' },
  { path: '/TITAN/calendar', name: 'calendar' },
  { path: '/TITAN/library', name: 'library' },
  { path: '/TITAN/ai', name: 'ai' },
  { path: '/TITAN/admin', name: 'admin' },
  { path: '/TITAN/settings', name: 'settings' },
  { path: '/TITAN/tidak-ada-halaman-ini', name: '404' }
];

// Runs in the page.
const AUDIT = () => {
  const issues = [];
  const txt = (el) => ((el && el.textContent) || '').trim();
  const cls = (el) => {
    const c = el && el.getAttribute ? el.getAttribute('class') : null;
    return c ? String(c).split(/\s+/) : [];
  };
  const visible = (el) => !!el && el.getClientRects().length > 0;

  // -- landmarks --------------------------------------------------------
  const h1s = [...document.querySelectorAll('h1')].filter(visible);
  const mains = document.querySelectorAll('main');
  if (h1s.length === 0) issues.push({ level: 'P1', kind: 'a11y', msg: 'no visible <h1>' });
  if (h1s.length > 1) {
    issues.push({ level: 'P1', kind: 'a11y', msg: `${h1s.length} visible <h1>: ${h1s.map((h) => txt(h).slice(0, 24)).join(' | ')}` });
  }
  if (mains.length === 0) issues.push({ level: 'P1', kind: 'a11y', msg: 'no <main> landmark' });
  if (mains.length > 1) issues.push({ level: 'P1', kind: 'a11y', msg: `${mains.length} <main> landmarks` });

  // -- accessible names -------------------------------------------------
  const nameless = [...document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')]
    .filter(visible)
    .filter((el) => {
      if (txt(el)) return false;
      if (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')) return false;
      if (el.querySelector('.sr-only')) return false;
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
      return true;
    });
  if (nameless.length) {
    issues.push({ level: 'P1', kind: 'a11y', msg: `${nameless.length} interactive element(s) with no accessible name: ${nameless.slice(0, 3).map((e) => e.tagName + '.' + (cls(e)[0] || '?')).join(', ')}` });
  }

  // -- images -----------------------------------------------------------
  const imgNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt'));
  if (imgNoAlt.length) issues.push({ level: 'P1', kind: 'a11y', msg: `${imgNoAlt.length} <img> without alt` });

  // -- nav labels -------------------------------------------------------
  const bareNav = [...document.querySelectorAll('nav')].filter((n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'));
  if (bareNav.length) issues.push({ level: 'P2', kind: 'a11y', msg: `${bareNav.length} <nav> without aria-label` });

  // -- horizontal overflow ----------------------------------------------
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 2) {
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > de.clientWidth + 4)
      .slice(0, 3)
      .map((el) => el.tagName + '.' + (cls(el)[0] || '?'));
    issues.push({ level: 'P0', kind: 'layout', msg: `horizontal overflow ${de.scrollWidth} > ${de.clientWidth}; widest: ${wide.join(', ')}` });
  }

  // -- tap targets ------------------------------------------------------
  // WCAG 2.2 SC 2.5.8 wants 24x24 CSS px, but it carries two exceptions that a
  // naive width/height check gets wrong and then reports forever:
  //   - inline targets (a link inside a sentence) are exempt
  //   - the spacing exception: an undersized target passes if a 24px circle
  //     centred on it does not touch any other target's circle
  // Both are implemented, otherwise the gate cries wolf on compliant rows of
  // account handles and people learn to ignore it.
  const interactives = [...document.querySelectorAll('button, a[href], [role="tab"], [role="button"]')].filter(visible);
  const rects = interactives.map((el) => ({ el, r: el.getBoundingClientRect() }));

  const small = [];
  for (const { el, r } of rects) {
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w === 0 || h === 0) continue;
    if (w >= 24 && h >= 24) continue;

    // Inside a sentence? Exempt.
    if (el.closest('p, figcaption, .titan-prose, blockquote')) continue;

    // Spacing exception: measure the nearest other target centre.
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let gap = Infinity;
    for (const o of rects) {
      if (o.el === el) continue;
      const d = Math.hypot(o.r.left + o.r.width / 2 - cx, o.r.top + o.r.height / 2 - cy);
      if (d < gap) gap = d;
    }
    if (gap >= 24) continue;

    small.push(`${el.tagName} ${w}x${h} "${txt(el).slice(0, 14) || el.getAttribute('aria-label') || '?'}" gap=${Math.round(gap)}`);
  }
  if (small.length) {
    issues.push({ level: 'P2', kind: 'tap', msg: `${small.length} target(s) under 24px with no spacing exception: ${[...new Set(small)].slice(0, 3).join('; ')}` });
  }

  // -- heading order ----------------------------------------------------
  let prev = 0;
  for (const h of [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible)) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) {
      issues.push({ level: 'P2', kind: 'a11y', msg: `heading jump h${prev}->h${lvl}: "${txt(h).slice(0, 30)}"` });
      break;
    }
    prev = lvl;
  }

  return {
    issues,
    info: {
      h1: h1s.map((h) => txt(h).slice(0, 40)),
      main: mains.length,
      chars: document.body.innerText.trim().length,
      focusables: document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])').length
    }
  };
};

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    console.log('[audit] puppeteer-core is not installed.');
    console.log('[audit] install with:  npm i -D puppeteer-core');
    console.log('[audit] set CHROME_PATH if Chrome is not in a default location.');
    if (SKIP_IF_UNAVAILABLE) { console.log('[audit] --skip-unavailable: continuing.'); return 0; }
    return 2;
  }

  let executablePath = null;
  for (const c of CHROME_CANDIDATES) {
    try { await fs.access(c); executablePath = c; break; } catch { /* next */ }
  }
  if (!executablePath) {
    console.log('[audit] no Chrome/Edge found. Set CHROME_PATH.');
    if (SKIP_IF_UNAVAILABLE) return 0;
    return 2;
  }

  let serverUp = false;
  try {
    const res = await fetch(`${BASE}/TITAN/`, { signal: AbortSignal.timeout(8000) });
    serverUp = res.ok;
  } catch { serverUp = false; }
  if (!serverUp) {
    console.log(`[audit] ${BASE} is not serving. Start a preview first.`);
    if (SKIP_IF_UNAVAILABLE) return 0;
    return 2;
  }

  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars', '--no-sandbox']
  });

  const routes = ONLY ? ROUTES.filter((r) => r.name === ONLY) : ROUTES;
  const results = [];
  let blocking = 0;

  // Both themes, always. Dark is this app's default, so a light-only audit
  // silently leaves the primary presentation untested.
  for (const theme of THEMES) {
    // Seed the theme on the origin before any route opens, and once per theme.
    // See the "two measurement bugs" note at the top of this file.
    const seed = await browser.newPage();
    await seed.goto(`${BASE}/TITAN/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await seed.evaluate((t) => localStorage.setItem('titan.theme.v1', t), theme);
    await seed.close();

    for (const route of routes) {
      const page = await browser.newPage();
      const errors = [];
      const http4xx = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
      page.on('response', (r) => { if (r.status() >= 400) http4xx.push(`${r.status()} ${r.url().replace(BASE, '')}`); });

      const viewports = [
        { w: 1440, h: 900, tag: 'desktop' },
        { w: 375, h: 812, tag: 'mobile' }
      ];
      const collected = { issues: [], info: null };

      for (const vp of viewports) {
        // Exactly one navigation per viewport. Never navigate twice to the same URL.
        await page.setViewport({ width: vp.w, height: vp.h });
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise((r) => setTimeout(r, 2500));
        const res = await page.evaluate(AUDIT);
        for (const i of res.issues) collected.issues.push({ ...i, where: `${theme}/${vp.tag}` });
        if (!collected.info) collected.info = res.info;
        await page.screenshot({ path: path.join(OUT, `${route.name}-${theme}-${vp.tag}.png`) });
      }

    const p0 = collected.issues.filter((i) => i.level === 'P0').length;
    const p1 = collected.issues.filter((i) => i.level === 'P1').length;
    const p2 = collected.issues.filter((i) => i.level === 'P2').length;
    if (p0 + p1 > 0 || (STRICT && p2 > 0)) blocking += p0 + p1 + (STRICT ? p2 : 0);

    const realErrors = [...new Set(errors)].filter(
      // The two-path manifest fallback logs a 404 on purpose before succeeding.
      (e) => !/status of 404/.test(e)
    );

    results.push({
      route: route.path, name: route.name, theme,
      p0, p1, p2,
      issues: collected.issues, info: collected.info,
      errors: realErrors, http4xx: [...new Set(http4xx)]
    });
    await page.close();
    }
  }

  await browser.close();
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));

  const total = (lvl) => results.reduce((n, r) => n + r[lvl], 0);
  console.log('\n  TITAN UI audit');
  console.log(`  ${THEMES.length} themes x ${routes.length} routes x 2 viewports`);
  console.log('  ' + '-'.repeat(64));
  for (const r of results) {
    const flags = [];
    if (r.p0) flags.push(`P0:${r.p0}`);
    if (r.p1) flags.push(`P1:${r.p1}`);
    if (r.p2) flags.push(`P2:${r.p2}`);
    console.log(`  ${(r.theme + '/' + r.name).padEnd(24)} h1="${(r.info?.h1?.[0] || '-').slice(0, 26)}" main=${r.info?.main ?? 0}  ${flags.join(' ') || 'clean'}`);
    for (const i of r.issues.filter((x) => x.level !== 'P2').slice(0, 3)) {
      console.log(`      [${i.level}/${i.where}] ${i.msg}`);
    }
    if (r.errors.length) console.log(`      [error] ${r.errors.slice(0, 2).join(' | ')}`);
  }
  console.log('  ' + '-'.repeat(64));
  console.log(`  P0 ${total('p0')}   P1 ${total('p1')}   P2 ${total('p2')}`);
  console.log(`  screenshots + report: ${OUT}`);

  if (blocking > 0) {
    console.log(`\n  AUDIT FAILED — ${blocking} blocking issue(s). Fix before deploying.`);
    return 1;
  }
  console.log('\n  AUDIT PASSED — no P0 or P1 findings.');
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('[audit] crashed:', err.message);
  process.exit(2);
});
