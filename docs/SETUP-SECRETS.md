# Setup Secrets untuk TITAN Daily Update Workflow
#
# TITAN pakai GitHub Actions untuk auto-update harian jam 23:00 WIB.
# Workflow ini butuh beberapa secrets yang harus di-setup di repo settings.

## 📍 Lokasi Setup

Buka: `https://github.com/tltanpro/TITAN/settings/secrets/actions/new`

## 🔑 Secrets yang Dibutuhkan

### 1. `IG_SESSION` (Instagram session cookie)

**Penting**: TIDAK pakai ENSEMBLEDATA. Pakai Instagram GraphQL / private endpoint via sessionid.

**Cara dapat**:
1. Login Instagram di browser (Chrome recommended)
2. Buka DevTools → Network tab
3. Refresh / lakukan action apapun (like, follow, etc.)
4. Cari request yang punya header `Cookie: sessionid=...`
5. Copy value `sessionid=...` (full, tidak termasuk "sessionid=")

**Format**: string panjang (~50-100 char alphanumeric)

**Rotasi**: sessionid expired tiap 1-3 bulan. Update secret kalau scrape mulai return 401/403.

### 2. `LLM_PROXY_URL` (Cloudflare Worker URL untuk AI text)

URL: `https://titan-llm-proxy.nickasad10007.workers.dev`

Worker ini sudah live dan punya multi-key Google rotation. Pakai untuk `pnpm insights:generate`.

**Setup**: Set ke URL di atas. Tidak perlu API key karena pakai Google Gemini free tier via Worker.

### 3. `GITHUB_TOKEN` (auto-provided)

GitHub otomatis provide `GITHUB_TOKEN` ke workflow. Workflow pakai ini untuk `git push` ke branch yang sama.

Pastikan Settings → Actions → General → Workflow permissions = "Read and write permissions" enabled.

## 🛡️ Security Notes

- **JANGAN commit secrets ke git**. Selalu pakai GitHub Secrets.
- **PAT vs GITHUB_TOKEN**: Defaultnya GITHUB_TOKEN cukup untuk push ke branch yang sama (branch trigger workflow). Untuk push ke branch lain, butuh PAT.
- **Session rotation**: IG sessionid perlu di-rotate berkala. Add reminder di calendar.

## 🔄 Workflow Triggers

- **Scheduled**: 23:00 WIB (16:00 UTC) tiap hari
- **Manual**: Actions tab → "TITAN Daily Update" → Run workflow

## 🐛 Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| IG scrape fail 401/403 | Session expired | Rotate IG_SESSION secret |
| TT scrape fail | Rate limit (TikWM) | Re-run in 1 hour |
| LLM 402 credits | OpenRouter keys kosong | Set Worker chain ke Google first (V15 fix) |
| Deploy fail | Git push error | Check branch protection rules |
| Build fail | Vite error | Check `pnpm run build` log |

## 📊 Monitoring

Check workflow status: `https://github.com/tltanpro/TITAN/actions`

Last deploy timestamp visible di topbar dashboard.
