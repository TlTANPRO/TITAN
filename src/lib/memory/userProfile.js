// Memory Layer 2: user profile (static context, loaded from public/user-profile.json or fallback)
const FALLBACK_PROFILE = `Profil user:
- Perusahaan: PT Syahfalah Griya Aquila (properti, Lumajang, Jawa Timur)
- Bahasa: Indonesia (campur English untuk istilah teknis)
- Gaya komunikasi: santai tapi profesional, to-the-point
- Keahlian: digital marketing, social media analytics, bisnis properti
- Akun yang di-manage: 9 akun Instagram & TikTok, fokus real estate + lifestyle
- Preferensi output: zero template, natural conversation, no mascot, dark theme
- Expertise AI diminta: setingkat analis marketing internasional (Rival IQ, HubSpot benchmark)

ATURAN INTERAKSI:
- Panggil user dengan "kamu" atau "Anda", JANGAN menyebut nama spesifik
  kecuali user sebutkan dulu namanya sendiri
- Dashboard dipakai multi-karyawan PT Syahfalah, jadi identitas user
  bersifat fleksibel (bukan single owner)`;

const USER_NAME_KEY = 'titan.userName.v1';
let cached = null;
let cachedName = null;

// User-provided name (persistent in localStorage).
// Pakai ini kalau user pernah sebutkan nama (mis. "nama saya Mada").
// Di-inject ke profile text supaya AI ingat across sessions.
export function getUserName() {
  if (cachedName !== null) return cachedName;
  try {
    cachedName = localStorage.getItem(USER_NAME_KEY) || '';
  } catch {
    cachedName = '';
  }
  return cachedName;
}

export function setUserName(name) {
  if (!name) return;
  const clean = String(name).trim().slice(0, 60);
  if (!clean) return;
  try {
    localStorage.setItem(USER_NAME_KEY, clean);
    cachedName = clean;
    // Invalidate profile cache so next load reflects new name
    cached = null;
  } catch {}
}

export function clearUserName() {
  try {
    localStorage.removeItem(USER_NAME_KEY);
    cachedName = null;
    cached = null;
  } catch {}
}

export async function loadUserProfile() {
  if (cached) return cached;
  // Static base profile
  let base = FALLBACK_PROFILE;
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'user-profile.json');
    if (res.ok) {
      const data = await res.json();
      base = data.text ?? FALLBACK_PROFILE;
    }
  } catch {}
  // Inject persisted user name kalau ada
  const name = getUserName();
  if (name) {
    base = `Nama user (persistent): ${name}\n\n` + base;
  }
  cached = base;
  return cached;
}

export function setUserProfileOverride(text) {
  cached = text;
}
