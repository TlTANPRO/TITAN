#!/usr/bin/env node
/**
 * TITAN Pre-Session Hook (SessionStart)
 *
 * Runs automatically at start of every Claude Code session in this project.
 * Loads:
 *   1. Live bundle hash from https://tltanpro.github.io/TITAN/
 *   2. Proxy URL count (V28.1 fix verification)
 *   3. Bot icon count (V25.7 fix verification)
 *   4. AI text count (V25.7 fix verification)
 *   5. Git status + last 3 commits
 *
 * Output goes to stderr (visible to user) so Claude MUST see it at session start.
 *
 * Failure tolerant — if curl fails (offline), still prints git status.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIVE_URL = 'https://tltanpro.github.io/TITAN/';
const PROJECT_ROOT = 'C:/Users/Syahfalah/TITAN';

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    return null;
  }
}

function curlLive() {
  const html = safeExec(`curl -sL "${LIVE_URL}"`);
  if (!html) return null;
  const m = html.match(/vite-index\.template-([A-Za-z0-9]+)\.js/);
  return m ? m[1] : null;
}

function curlBundle(hash) {
  if (!hash) return null;
  const url = `${LIVE_URL}assets/vite-index.template-${hash}.js`;
  const tmp = path.join(os.tmpdir(), `titan-pre-session-${hash}.js`);
  safeExec(`curl -sL "${url}" -o "${tmp}"`);
  if (!fs.existsSync(tmp)) return null;
  const content = fs.readFileSync(tmp, 'utf8');
  return { tmp, content };
}

function grepCount(content, pattern) {
  if (!content) return 0;
  const re = new RegExp(pattern, 'g');
  return (content.match(re) || []).length;
}

function gitStatus() {
  const branch = safeExec(`git -C "${PROJECT_ROOT}" branch --show-current`);
  const log = safeExec(`git -C "${PROJECT_ROOT}" log --oneline -3`);
  const status = safeExec(`git -C "${PROJECT_ROOT}" status --short`);
  return { branch, log, status };
}

const lines = [];
lines.push('');
lines.push('┌────────────────────────────────────────────────────────────┐');
lines.push('│  TITAN PRE-SESSION HOOK — WAJIB DIBACA SEBELUM KERJA       │');
lines.push('└────────────────────────────────────────────────────────────┘');
lines.push('');

const hash = curlLive();
lines.push(`[live] bundle hash: ${hash || 'CURL FAILED'}`);

if (hash) {
  const bundle = curlBundle(hash);
  if (bundle) {
    const proxyCount = grepCount(bundle.content, 'titan-llm-proxy');
    const botCount = grepCount(bundle.content, '"Bot"');
    const aiGeneratedCount = grepCount(bundle.content, 'AI-Generated');
    const aiInsightsCount = grepCount(bundle.content, 'AI Insight');
    const aiConfigCount = grepCount(bundle.content, 'AI Configuration');

    lines.push(`[live] titan-llm-proxy refs: ${proxyCount} (expect: 6, V28.1 fix live)`);
    lines.push(`[live] Bot icon imports:    ${botCount} (expect: 0, V25.7 fix live)`);
    lines.push(`[live] "AI-Generated":       ${aiGeneratedCount} (expect: 0)`);
    lines.push(`[live] "AI Insight":         ${aiInsightsCount} (expect: 0)`);
    lines.push(`[live] "AI Configuration":  ${aiConfigCount} (expect: 0)`);

    if (proxyCount !== 6) {
      lines.push('');
      lines.push('⚠️  WARNING: proxy URL count != 6. V28.1 fix mungkin broken.');
    }
    if (botCount > 0) {
      lines.push('');
      lines.push('⚠️  WARNING: Bot icon ada di bundle. V25.7 fix mungkin broken.');
    }

    // Clean up
    try { fs.unlinkSync(bundle.tmp); } catch (e) {}
  }
}

const git = gitStatus();
if (git.branch) {
  lines.push('');
  lines.push(`[git] branch: ${git.branch}`);
  lines.push(`[git] last 3 commits:`);
  if (git.log) {
    git.log.split('\n').forEach((l) => lines.push(`  ${l}`));
  }
  if (git.status) {
    lines.push(`[git] working tree dirty:`);
    git.status.split('\n').forEach((l) => lines.push(`  ${l}`));
  } else {
    lines.push('[git] working tree clean');
  }
}

lines.push('');
lines.push('────────────────────────────────────────────────────────────');
lines.push('WAJIB apply 7 prinsip audit (lihat CLAUDE.md):');
lines.push('  P1. Sequential: live → source → plan (bukan parallel)');
lines.push('  P2. Explore agent ≠ audit (pakai Plan/verify)');
lines.push('  P3. Klaim live = curl + parse + output exact');
lines.push('  P4. E2E test mandatory sebelum ExitPlanMode');
lines.push('  P5. Surface konflik live ≠ source, jangan proceed');
lines.push('  P6. Facts = self-verify, jangan tanya user');
lines.push('  P7. Plan ≤5 sub-task, tested E2E');
lines.push('────────────────────────────────────────────────────────────');
lines.push('');

process.stderr.write(lines.join('\n'));
process.exit(0);
