# TITAN — Project Guide for Claude Code

> **WAJIB BACA INI di awal setiap sesi sebelum kerja apapun.** File ini auto-injected oleh Claude Code, tidak bergantung pada memory injection.

## Live site (cek DULU sebelum claim apapun)

- **URL**: https://tltanpro.github.io/TITAN/
- **Bundle hash**: `vite-index.template-VWdhWVHp.js` (cek `curl -s https://tltanpro.github.io/TITAN/ | grep -oE "assets/vite-index.template-[A-Za-z0-9]+\.js"`)
- **Data live**: `accounts-full.json` (root) = 9 akun, ~4134 posts, 2 cross-dup
- **Deploy**: `pnpm run deploy` (lokal) — build + copy dist→root + git commit + push
- **Backup**: user harus run `pnpm run deploy` (V25 lesson)

## Pipeline harian

- `daily-update.yml` cron `0 16 * * *` UTC = 23:00 WIB — scrape + generate + build + deploy
- `incremental.yml` workflow_dispatch — incremental scrape (c4d3efd satu-satunya commit sukses, sejak itu 0)
- Scrapers: **V28 FREE methods** (i.instagram.com /clips/user/ + /feed/user/, TikWM via Jina, Jina web profile TT) — NO ENSEMBLEDATA (1/34 token valid)

## Shipped versions (baca sebelum plan baru)

Memory pointers di `~/.claude/projects/C--Users-Syahfalah/memory/MEMORY.md`. **WAJIB baca**:

1. `project-titan-v25-shipped.md` — 8 user feedback categories (Bot icon → Lightbulb, AI text removal, postingCadence IQR, dll)
2. `project-titan-v28-chatpanel-workflow-fix.md` — VITE_LLM_PROXY_URL workflow fix
3. `feedback-titan-audit-contract-v1.md` — **7 PRINSIP AUDIT** (WAJIB, baca di bawah)

## 7 Prinsip Audit (WAJIB apply)

### P1. Sequential: live → source → plan
Bukan parallel. Buka 3 Explore agent paralel = 3 asumsi, bukan 3 fakta.

### P2. Explore agent ≠ audit
Do NOT use Explore untuk code review, design-doc auditing, cross-file consistency. Pakai Plan untuk design, verify untuk E2E.

### P3. Setiap klaim live = curl + parse + output exact
"Live 0 cross-dup" tanpa curl = ASUMSI. Harus:
```bash
curl -s <url> -o /tmp/x
node -e "parse + count → output exact"
```

### P4. E2E test mandatory sebelum ExitPlanMode
Bukan test/typecheck. Drive the live app, capture output. Untuk TITAN = curl + parse + node scripts/<fix>.mjs.

### P5. Surface konflik, jangan proceed
Kalau live ≠ source, tulis konfliknya. Tanya user. Jangan tulis plan seolah klaim benar.

### P6. Facts = self-verify, jangan tanya user
"Composite key mana?" = fakta teknis, putuskan sendiri + justifikasi. "Pakai pattern A atau B?" = preference, tanya user.

### P7. Plan ≤5 sub-task, tested E2E, baru ExitPlanMode
V29 (10 sub-task) = gagal. V25 (11 sub-task end-to-end tested) = OK. Pelajaran: panjang ≠ lengkap.

## Pre-sesi checklist (jalankan sebelum plan/fix apapun)

```bash
# 1. Baca shipped memory (lihat MEMORY.md pointers)
# 2. Cek live state
curl -sI https://tltanpro.github.io/TITAN/ | head -3
curl -s https://tltanpro.github.io/TITAN/ | grep -oE "assets/vite-index.template-[A-Za-z0-9]+\.js" | head -1
curl -s https://tltanpro.github.io/TITAN/assets/vite-index.template-*.js -o /tmp/live-bundle.js
grep -c "titan-llm-proxy" /tmp/live-bundle.js  # expect: 6
grep -c "\"Bot\"" /tmp/live-bundle.js  # expect: 0 (V25 fix live)

# 3. Cek git status
cd C:/Users/Syahfalah/TITAN
git log --oneline -5
git status --short

# 4. Apply 7 prinsip
# Tulis plan BARU setelah 1+2+3 selesai
```

## Recovery kalau sesi gagal lagi

1. STOP writing plan
2. Re-read 7 prinsip
3. Re-run pre-sesi checklist
4. Tanya user: "Pre-sesi checklist sudah dijalankan? Mana yang skip?"
5. Reset ke ground truth, tulis plan BARU ≤3 sub-task

## Out-of-scope (jangan kerjakan tanpa user request)

- Cleanup file dead/duplicate (V30 separate pass)
- Auto-rollback kalau live bundle broken
- Multi-region Worker
- E2E test GitHub Actions (act tool)
- Per-account post-floor check

Lihat [[project-titan-v25-shipped]] + [[feedback-titan-audit-contract-v1]] + [[titan-v29-audit-cancelled]] untuk full context.
