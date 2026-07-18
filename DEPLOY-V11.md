# TITAN PRO V11 — Panduan Deploy Manual

**Last updated:** 2026-07-17 · V11 Incremental Refresh

Panduan step-by-step dari nol sampai dashboard live + cron jalan otomatis.

---

## 📋 Pre-Flight Checklist

Pastikan ini sudah siap **sebelum mulai**:

- [ ] Akun GitHub (`tltanpro`) — admin di repo `tltanpro/TITAN`
- [ ] Akun Cloudflare — untuk Worker `titan-llm-proxy`
- [ ] Akun ENSEMBLEDATA — untuk scraper IG/TT
- [ ] (Opsional) Jina API key — untuk free enrichment
- [ ] Local machine: Node.js 20+ dan pnpm 9+
- [ ] Repo TITAN sudah di-clone ke local

```bash
node --version   # harus v20+
pnpm --version   # harus 9+
```

---

## 🔑 Phase 1: Rotate Secrets (WAJIB, JANGAN SKIP!)

**Kenapa wajib:** Token GitHub + Cloudflare API kamu sebelumnya sudah ter-expose di chat log. Siapa pun yang punya akses ke sesi itu bisa akses repo + akun Cloudflare kamu. Harus di-revoke + ganti baru.

### 1.1. Revoke GitHub PAT lama

1. Buka https://github.com/settings/tokens
2. Cari PAT yang ber-prefix `ghp_` (PAT lama)
3. Klik **Delete** → confirm
4. **Generate new token**:
   - Settings → Developer settings → Personal access tokens → Tokens (classic) → **Generate new token**
   - Note: `TITAN Worker + Actions`
   - Expiration: **No expiration** (atau 1 tahun, sesuaikan)
   - Scopes:
     - ☑️ `workflow` (untuk trigger Actions workflow)
     - ☑️ `repo` (untuk push commit balik ke repo)
   - **Generate token**
   - **Copy token** — simpan di password manager (1Password/Bitwarden), **JANGAN paste di chat atau commit ke git**

### 1.2. Revoke Cloudflare API Token lama

1. Buka https://dash.cloudflare.com/profile/api-tokens
2. Cari token `cfat_...` yang lama
3. Klik **Roll** → confirm
4. **Generate new token** (kalau Worker butuh akses Cloudflare API untuk scheduled handler):
   - Profile → API Tokens → **Create Token**
   - Template: **Edit Cloudflare Workers**
   - Account Resources: include → your account
   - Zone Resources: include → All zones (atau specific zone kalau ada)
   - **Continue to summary** → **Create Token**
   - **Copy token** — simpan di password manager

> **Catatan:** Kalau kamu tidak pakai `wrangler deploy` dari script (`TITAN_CF_API_TOKEN`), token ini tidak wajib. Worker cron bisa jalan tanpa CF API token — dia cuma panggil GitHub API pakai GH_PAT.

### 1.3. Cek ENSEMBLEDATA token pool

1. Buka https://ensembledata.com/dashboard
2. Settings → API Tokens
3. Pastikan ada minimal 5 token aktif (cek `tokenPool.mjs` untuk cara import)

---

## 🛠️ Phase 2: Setup Local Environment

### 2.1. Pull V11 code

```bash
cd /c/Users/Syahfalah/titan-app
git pull origin main
pnpm install
```

Verifikasi V11 sudah masuk:

```bash
ls scripts/scrape-incremental.mjs        # harus ada
ls .github/workflows/incremental.yml     # harus ada
ls src/routes/SettingsPage.jsx           # harus ada
```

### 2.2. Setup file `.env`

```bash
# Copy template
cp .env.example .env
```

Edit `.env` dengan values berikut:

```bash
# =============================================================
# ENSEMBLEDATA (scraper)
# =============================================================
ENSEMBLEDATA_TOKENS=token_baru_1,token_baru_2,token_baru_3,token_baru_4,token_baru_5
ENSEMBLEDATA_DAILY_PING=true

# =============================================================
# LLM Provider (dev mode only — production pakai Worker)
# =============================================================
VITE_LLM_PROVIDER=openrouter
VITE_LLM_MODEL=anthropic/claude-3-haiku

# =============================================================
# Build config
# =============================================================
VITE_APP_NAME=TITAN
VITE_BASE_PATH=/TITAN/

# =============================================================
# Cloudflare Worker — REQUIRED untuk production
# =============================================================
VITE_LLM_PROXY_URL=https://titan-llm-proxy.nickasad10007.workers.dev

# =============================================================
# V11: Hard refresh password
# ⚠️ HARUS SAMA dengan Worker secret HARD_REFRESH_PASSWORD
# ⚠️ INI BUKAN SECURITY BETULAN — frontend-only gate untuk hide
#    destructive actions dari user biasa. Karyawan internal only.
# =============================================================
VITE_HARD_REFRESH_PASSWORD=Ganteng
```

**Simpan file `.env`** (jangan commit).

### 2.3. Test build lokal

```bash
pnpm build
```

Harus sukses tanpa error. Output: `dist/` folder.

---

## 🐙 Phase 3: Setup GitHub Secrets

GitHub Actions workflow butuh secrets untuk:
- Push balik ke repo (`GH_PAT`)
- Scraping IG/TT (`TITAN_ENSEMBLEDATA_TOKEN`, `TITAN_JINA_API_KEY`)

### 3.1. Buka repo secrets page

Buka: https://github.com/tltanpro/TITAN/settings/secrets/actions/new

### 3.2. Add secrets satu per satu

| Name | Value | Required? |
|------|-------|-----------|
| `GH_PAT` | PAT baru dari Phase 1.1 | ✅ WAJIB |
| `TITAN_ENSEMBLEDATA_TOKEN` | Salah satu token ENSEMBLEDATA (yang aktif) | ✅ WAJIB |
| `TITAN_JINA_API_KEY` | Jina API key (kalau ada) | ⚠️ Opsional |
| `TITAN_GH_OWNER` | `tltanpro` | ❌ Hardcoded di workflow |
| `TITAN_GH_REPO` | `TITAN` | ❌ Hardcoded di workflow |

Untuk tiap secret:
1. Klik **New repository secret**
2. Name: (sesuai tabel)
3. Value: paste value
4. Klik **Add secret**

### 3.3. Commit + push V11 code

```bash
cd /c/Users/Syahfalah/titan-app
git add -A
git status  # review — pastikan tidak ada .env atau credentials
git commit -m "feat: V11 incremental refresh pipeline

- scripts/scrape-incremental.mjs (only new posts, 99% token savings)
- .github/workflows/incremental.yml (cron 23:00 WIB)
- src/routes/SettingsPage.jsx (Mada/Ganteng login gate)
- src/lib/refreshClient.js (split soft/hard refresh)
- Topbar soft refresh default + progress %
- Worker /soft-refresh + /hard-refresh + scheduled handler"
git push origin main
```

---

## ☁️ Phase 4: Setup Cloudflare Worker

### 4.1. Verifikasi Worker ada

Buka: https://dash.cloudflare.com → Workers & Pages → **titan-llm-proxy**

Kalau belum ada, lihat `cloudflare-worker/README.md` (atau pandu cepat di bawah).

### 4.2. Set Worker secrets via terminal

**PENTING:** Jalankan di local terminal kamu, **JANGAN** paste secrets di chat.

```bash
cd /c/Users/Syahfalah/titan-app/cloudflare-worker

# Set GH_PAT (untuk /hard-refresh endpoint)
wrangler secret put GH_PAT
# Prompt: paste PAT baru dari Phase 1.1
# Enter

# Set HARD_REFRESH_PASSWORD (untuk auth /hard-refresh)
# ⚠️ HARUS SAMA dengan frontend VITE_HARD_REFRESH_PASSWORD
wrangler secret put HARD_REFRESH_PASSWORD
# Prompt: paste password yang sama dengan .env
# Enter

# Set LLM keys (kalau belum)
wrangler secret put OPENROUTER_API_KEY
# Prompt: paste OpenRouter API key
# Enter

# Set Google keys (kalau pakai Google provider)
wrangler secret put GOOGLE_KEYS
# Prompt: paste JSON array string, misal '["key1","key2",...]'
# Enter
```

### 4.3. Deploy Worker

```bash
wrangler deploy
```

Output sukses:
```
Published titan-llm-proxy (X.XX sec)
  https://titan-llm-proxy.nickasad10007.workers.dev
```

### 4.4. Test Worker endpoints

```bash
# Test soft refresh (no auth)
curl -X POST https://titan-llm-proxy.nickasad10007.workers.dev/soft-refresh

# Expected: JSON { ok: true, accountCount: 9, totalPosts: 4066, generatedAt: "...", ... }

# Test account-meta (topbar popover)
curl https://titan-llm-proxy.nickasad10007.workers.dev/account-meta

# Expected: JSON { accounts: [...9 items...], count: 9 }

# Test hard refresh tanpa auth (harus 401)
curl -X POST https://titan-llm-proxy.nickasad10007.workers.dev/hard-refresh
# Expected: 401 "Invalid credentials"

# Test hard refresh dengan password salah (harus 401)
curl -X POST -H "Authorization: Bearer salah" \
  https://titan-llm-proxy.nickasad10007.workers.dev/hard-refresh
# Expected: 401

# Test hard refresh dengan password benar (harus 202 + jobId)
curl -X POST -H "Authorization: Bearer Ganteng" \
  https://titan-llm-proxy.nickasad10007.workers.dev/hard-refresh
# Expected: 202 { jobId: "...", status: "queued", ... }
```

---

## 🚀 Phase 5: Initial Full-Scrape (One-Time)

Sebelum cron jalan, butuh dataset awal. Jalankan di local:

### 5.1. Scrape semua akun

```bash
cd /c/Users/Syahfalah/titan-app

# Instagram (4 akun, ~5-10 menit)
node scripts/scrape-ig.mjs --force

# TikTok (5 akun, ~5-10 menit)
node scripts/scrape-tt.mjs --force
```

Output: `scripts/scraped/{slug}.json` untuk tiap akun.

### 5.2. Validate + merge

```bash
node scripts/validate-merge.mjs
```

Cross-file dedup, sanity check, write back.

### 5.3. Generate dashboard data

```bash
node scripts/generate-data.mjs
```

Output: `public/data/accounts-full.json` (siap di-serve GitHub Pages).

### 5.4. Verify output

```bash
ls -lh public/data/accounts-full.json
# Harus > 5MB (biasanya 6-7MB untuk 4066 posts)

# Quick sanity
head -c 200 public/data/accounts-full.json
# Harus start dengan { "accounts": [...
```

### 5.5. Commit + push initial dataset

```bash
git add public/data/ scripts/scraped/
git commit -m "chore(data): initial full-scrape 9 akun (4066 posts)"
git push origin main
```

GitHub Pages akan auto-rebuild + deploy dalam 1-2 menit.

### 5.6. Verify live site

Buka https://tltanpro.github.io/TITAN/ di browser:
- Topbar: ada tombol **Akun**, **Refresh**, **Settings** (gear)
- Klik **Akun**: muncul 9 akun (4 IG + 5 TT)
- Klik **Refresh**: loading sebentar, lalu "Data berhasil di-reload" chip hijau
- Klik **Settings (⚙️)**: muncul form login Mada/Ganteng
  - Login: hard refresh button muncul (dengan disclaimer)
  - Logout: balik ke login screen

---

## ⏰ Phase 6: Verify Cron Schedule

### 6.1. GitHub Actions cron

File: `.github/workflows/incremental.yml`
Schedule: `0 16 * * *` UTC = **23:00 WIB**

**Test manual dulu** (jangan tunggu 23:00):

1. Buka https://github.com/tltanpro/TITAN/actions
2. Pilih workflow **"TITAN Incremental Refresh"** di sidebar kiri
3. Klik **Run workflow** → **Run workflow** (default options)
4. Tunggu ~3-10 menit sampai selesai
5. Cek:
   - ✅ Step "Run incremental scraper" sukses
   - ✅ Step "Validate and merge" sukses
   - ✅ Step "Regenerate data" sukses
   - ✅ Step "Check for changes" → `changed=true` (kalau ada post baru)
   - ✅ Step "Commit and push" sukses (kalau `changed=true`)

Kalau ada error, klik step yang gagal → baca log → fix.

### 6.2. Worker scheduled handler (backup)

File: `cloudflare-worker/wrangler.toml`
Schedule: `crons = ["0 16 * * *"]` UTC = **23:00 WIB**

**Test manual** (opsional, GH Actions cron sudah cukup):

```bash
# Force trigger Worker scheduled event
wrangler dev --test-scheduled
# Di terminal lain:
curl "http://localhost:8787/__scheduled?cron=0+16+*+*+*"
```

Atau tunggu sampai 23:00 WIB besok dan cek Worker logs:
- https://dash.cloudflare.com → Workers & Pages → titan-llm-proxy → Logs
- Harus ada entry `[scheduled] cron fired at ...`

---

## 🔄 Phase 7: Daily Operations

### Soft Refresh (default, kapan saja)

```bash
# Di browser: klik tombol "Refresh" di topbar
# Atau di curl (test Worker):
curl -X POST https://titan-llm-proxy.nickasad10007.workers.dev/soft-refresh
```

**Apa yang terjadi:**
- Worker fetch `accounts-full.json` (cache-busted)
- Return metadata (accountCount, totalPosts, generatedAt)
- Frontend `dataStore.reload()` re-imports JSON
- Semua chart re-render dengan data terbaru
- Token ENSEMBLEDATA: **0**
- GH API calls: **0**
- Durasi: < 2 detik

### Hard Refresh (jarang, hanya untuk recovery)

```
Browser → /settings → Login Mada/Ganteng → Hard Refresh Sekarang
```

**Apa yang terjadi:**
- Worker panggil GH Actions workflow_dispatch
- GH Actions jalan `scrape-incremental.mjs` + `validate-merge.mjs` + `generate-data.mjs`
- Commit + push ke repo
- GitHub Pages auto-deploy
- Browser polling `refresh-status` sampai success
- Toast "Data berhasil di-scrape ulang"
- Token ENSEMBLEDATA: ~25 calls (hemat, incremental)
- GH Actions minutes: ~3-5 menit
- Durasi: 5-10 menit

### Auto Cron (tidak perlu lakukan apa-apa)

Tiap jam **23:00 WIB**:
- GH Actions workflow trigger
- Scrape post baru saja (incremental)
- Commit kalau ada perubahan
- Besok pagi dashboard sudah fresh

---

## 🆘 Phase 8: Troubleshooting

### Tombol Refresh di topbar error "VITE_LLM_PROXY_URL belum di-setup"

**Penyebab:** `.env` belum set atau tidak ke-load.

**Fix:**
```bash
cd /c/Users/Syahfalah/titan-app
# Pastikan .env ada
ls -la .env
# Edit kalau perlu
cat .env | grep VITE_LLM_PROXY_URL
# Harus uncomment dan ada URL
```

### Worker `/hard-refresh` return 503 "Refresh not configured"

**Penyebab:** Worker secret `GH_PAT` belum di-set, atau `wrangler.toml [vars]` belum lengkap.

**Fix:**
```bash
cd /c/Users/Syahfalah/titan-app/cloudflare-worker
wrangler secret put GH_PAT  # paste PAT
wrangler deploy  # redeploy
```

### GitHub Actions cron error "TITAN_ENSEMBLEDATA_TOKEN not set"

**Penyebab:** Secret belum di-add di repo Settings.

**Fix:**
1. Buka https://github.com/tltanpro/TITAN/settings/secrets/actions
2. Add secret `TITAN_ENSEMBLEDATA_TOKEN`
3. Re-run workflow

### Cron jalan tapi tidak ada post baru (changed=false)

**Itu normal** kalau tidak ada post baru hari ini. Check log:
- Step "Run incremental scraper" → cek output: `Added: 0 new posts`
- Step "Check for changes" → `changed=false`
- Step "Commit and push" → skipped (ini benar, tidak ada yang perlu di-commit)

### Dashboard tidak update setelah cron selesai

**Penyebab 1: GitHub Pages cache**
- Tunggu 1-2 menit setelah commit (Pages rebuild)
- Hard reload browser: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

**Penyebab 2: Browser cache service worker**
- Buka DevTools → Application → Service Workers → Unregister
- Atau: DevTools → Application → Storage → Clear site data

**Penyebab 3: Soft refresh belum dilakukan**
- Klik tombol "Refresh" di topbar untuk force reload JSON

### Hard refresh stuck di "Polling timeout setelah 10 menit"

**Penyebab:** GH Actions workflow masih jalan tapi lebih dari 10 menit, atau gagal.

**Fix:**
1. Buka https://github.com/tltanpro/TITAN/actions → cek status run terakhir
2. Kalau sukses, klik "Refresh" di topbar untuk sync
3. Kalau gagal, lihat log → fix → run manual

### Token ENSEMBLEDATA habis

**Gejala:** `[IG] All tokens exhausted, stopping`

**Fix:**
1. Login ke https://ensembledata.com/dashboard
2. Tunggu 24 jam (quota reset harian) ATAU
3. Beli plan lebih besar ATAU
4. Ganti token baru, update `.env` + restart workflow

---

## 📊 Phase 9: Monitoring (Opsional)

### Cek token pool stats

```bash
# Setelah scrape, output paling akhir:
node scripts/scrape-incremental.mjs
# Lihat baris: "Token pool: { valid: 17, exhausted: 9, total: 26 }"
```

### Cek GH Actions history

https://github.com/tltanpro/TITAN/actions/workflows/incremental.yml

Filter by date untuk lihat:
- Berapa kali run dalam 30 hari terakhir
- Success rate
- Average duration

### Cek Worker logs

https://dash.cloudflare.com → Workers & Pages → titan-llm-proxy → Logs

Real-time logs:
- `[scheduled] cron fired at ...`
- `/hard-refresh` requests
- Errors

### Cek dataset freshness

```bash
# Quick check dari terminal
curl -s https://titan-llm-proxy.nickasad10007.workers.dev/soft-refresh \
  -X POST | python -c "import sys, json; d=json.load(sys.stdin); print(f'Generated: {d[\"generatedAt\"]}, {d[\"totalPosts\"]} posts')"
```

Atau di browser, lihat topbar subtitle: "Update 17 Jul 23:00" (kalau cron sudah jalan)

---

## ✅ Final Checklist

Pastikan semua step selesai:

- [x] Phase 1: Rotate secrets (GitHub PAT + Cloudflare API)
- [x] Phase 2: Setup local `.env`
- [x] Phase 3: Set GitHub repo secrets (GH_PAT, ENSEMBLEDATA, Jina)
- [x] Phase 4: Set Worker secrets, deploy Worker, test endpoints
- [x] Phase 5: Initial full-scrape, commit, deploy to GitHub Pages
- [x] Phase 6: Test manual trigger GH Actions workflow
- [x] Phase 7: Daily operations (soft/hard/auto)
- [x] Phase 8: Troubleshooting guide (bookmark)
- [x] Phase 9: Monitoring setup

**TITAN V11 sudah live dengan auto-refresh harian. Tidak perlu manual lagi (kecuali recovery).**

---

## 📚 Reference

- Worker source: `cloudflare-worker/src/index.js`
- Cron workflow: `.github/workflows/incremental.yml`
- Incremental scraper: `scripts/scrape-incremental.mjs`
- Settings page: `src/routes/SettingsPage.jsx`
- Frontend refresh client: `src/lib/refreshClient.js`
- Scripts documentation: `scripts/README.md`
- Plan backup: `C:\Users\Syahfalah\.claude\plans\Plan-titan-Jumat.md`

---

## 🆘 Kontak Darurat

Kalau ada error yang tidak bisa di-resolve dari guide ini:
1. Cek `Plan-titan-Jumat.md` untuk konteks
2. Cek memory file: `~/.claude/projects/.../memory/`
3. Tanya Claude (Claude Code agent) dengan paste error log

**Token yang perlu di-rotate kalau security incident:**
- GitHub PAT: https://github.com/settings/tokens
- Cloudflare API: https://dash.cloudflare.com/profile/api-tokens
- ENSEMBLEDATA: https://ensembledata.com/dashboard
- Jina: https://jina.ai/dashboard
