// Memory Layer 4: combine all layers → augmented system prompt
import { loadUserProfile, setUserName, getUserName } from './userProfile.js';
import { loadAccountContext } from './accountContext.js';
import { loadHistory } from './chatHistory.js';

const BASE_SYSTEM_PROMPT = `Kamu adalah analis social media marketing senior dengan keahlian setara konsultan Rival IQ / HubSpot. Tugasmu: membantu user memahami data akun Instagram/TikTok mereka, menjawab pertanyaan marketing dengan natural, insightful, dan berdasarkan data.

ATURAN PENTING:
- Jawab dengan natural seperti ngobrol dengan rekan kerja yang pinter — tidak ada template, tidak ada format tetap
- Kalau user bertanya di luar data yang tersedia, katakan terus terang dan tawarkan untuk cek via web kalau perlu
- Pakai bahasa Indonesia (campur English untuk istilah teknis) kecuali user minta bahasa lain
- Pakai data konkret (angka, nama post, hashtag) ketika relevan, bukan generalitas
- Kalau analisis, tunjukkan reasoning — bukan hanya kesimpulan
- Tidak perlu salam/closing template, langsung ke isi
- Panjang jawaban sesuaikan pertanyaan: pertanyaan singkat = jawaban singkat, analisis mendalam = lebih panjang
- Kalau user menyebut nama mereka secara eksplisit (mis. "nama saya Mada", "panggil saya Rina"),
  INGAT nama tersebut dan panggil mereka dengan nama itu di chat selanjutnya
- Kalau belum tahu nama user, panggil dengan "kamu" atau "Anda"
- Identitas user adalah fleksibel (multi-user dashboard), bukan single owner`;

// Extract user-provided name dari recent messages.
// Pattern yang dikenali: "nama saya X", "panggil saya X", "saya X (perkenalan)",
// "aku X (perkenalan)", atau explicit "namaku X".
function extractUserNameFromHistory(history) {
  // Scan only user messages, latest first
  const userMsgs = history.filter((m) => m.role === 'user');
  for (let i = userMsgs.length - 1; i >= 0; i--) {
    const text = (userMsgs[i].content || '').slice(0, 500);
    // Pattern: "nama saya X" / "namaku X" / "nama ku X"
    let m = text.match(/(?:nama\s+saya|namaku|nama\s+ku|kenalkan\s+nama\s+saya)\s+([A-Z][a-zA-ZÀ-ſ]{1,30}(?:\s+[A-Z][a-zA-ZÀ-ſ]{1,30})?)/);
    if (m) return m[1].trim();
    // Pattern: "panggil saya X"
    m = text.match(/panggil\s+saya\s+([A-Z][a-zA-ZÀ-ſ]{1,30})/);
    if (m) return m[1].trim();
    // Pattern: "saya X (kalau di awal kalimat, eksplisit perkenalan)"
    //   Only match kalau di awal, diikuti kata kerja/akhir kalimat
    m = text.match(/^\s*saya\s+([A-Z][a-zA-ZÀ-ſ]{2,30})(?:\s+[,.;]|\s+(?:marketing|content|sales|admin|HRD|finance|finance|legal))/i);
    if (m) return m[1].trim();
  }
  return null;
}

export async function buildSystemPrompt(accountSlug, accountData = null) {
  // Auto-detect name from history kalau belum ada di localStorage
  const history = loadHistory();
  if (!getUserName()) {
    const detected = extractUserNameFromHistory(history);
    if (detected) setUserName(detected);
  }
  const profile = await loadUserProfile();
  const accountCtx = loadAccountContext(accountSlug);

  const lines = [BASE_SYSTEM_PROMPT, '', '## User Profile', profile];

  if (accountData) {
    lines.push('', '## Account Context', `User sedang membuka akun ${accountData.platform} @${accountData.username}.`);
    lines.push(`- Display name: ${accountData.displayName ?? accountData.username}`);
    lines.push(`- Followers: ${(accountData.followerCount ?? 0).toLocaleString('id-ID')}`);
    lines.push(`- Posts: ${accountData.postCount ?? (accountData.posts?.length ?? 0)}`);
    if (accountData.bio) lines.push(`- Bio: ${accountData.bio}`);
    if (accountData.isVerified) lines.push(`- Verified: ya`);
  }

  if (accountCtx.recentTopics?.length > 0) {
    lines.push('', '## Topik yang Baru Dibahas', accountCtx.recentTopics.map((t) => `- ${t}`).join('\n'));
  }
  if (accountCtx.conversationSummary) {
    lines.push('', '## Ringkasan Percakapan', accountCtx.conversationSummary);
  }
  if (accountCtx.customNotes) {
    lines.push('', '## Catatan User', accountCtx.customNotes);
  }

  const recentHistory = history.slice(-10);
  if (recentHistory.length > 0) {
    lines.push('', '## Riwayat Chat Terakhir', recentHistory.map((m) => `[${m.role}] ${m.content.slice(0, 200)}`).join('\n'));
  }

  return lines.join('\n');
}
