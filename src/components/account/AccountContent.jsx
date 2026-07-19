// V21.1: Account Content tab — PostExplorer, content mix, hook classification, pillars, hashtags, mentions.
// V27.5: bumped content-mix bar from h-2.5 to h-5 so it's clearly visible (parity with Home).
import { Layers, Tag, BookOpen, Hash, Users } from 'lucide-react';
import { PostExplorer } from '../PostExplorer.jsx';
import { SectionHeader } from '../ui/SectionHeader.jsx';

const HOOK_LABELS = {
  question: 'Pertanyaan',
  number: 'Angka',
  emoji: 'Emoji',
  cta: 'Call-to-Action',
  statement: 'Pernyataan'
};

const MEDIA_LABELS = {
  REEL: 'Reels / Video Pendek',
  VIDEO: 'Video Panjang',
  IMAGE: 'Foto Tunggal',
  CAROUSEL_ALBUM: 'Carousel / Album',
  OTHER: 'Lainnya'
};

function EmptyMini({ message }) {
  return <div className="text-sm text-text-muted italic py-4 text-center">{message}</div>;
}

export function AccountContent({ account, insights }) {
  const { contentMix, hookClassification, contentPillars, topHashtags, topMentions, hashtagCoOccurrence } = insights;

  const contentMixID = Object.entries(contentMix.counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, label: MEDIA_LABELS[k] ?? k, count: v, pct: contentMix.percentages[k] ?? 0 }));

  return (
    <div className="space-y-6">
      <PostExplorer posts={account.posts} followerCount={account.followerCount ?? 0} />

      {contentMixID.length > 0 && (
        <div className="surface p-5">
          <SectionHeader icon={Layers} title="Komposisi Format Konten" subtitle="Proporsi tipe media yang dipublikasikan" />
          <div className="space-y-2.5">
            {contentMixID.map((c) => (
              <div key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-32 text-text-secondary text-xs flex-shrink-0">{c.label}</span>
                <div className="flex-1 bg-bg-tertiary rounded-full h-5 overflow-hidden flex items-center">
                  <div
                    className="h-full bg-accent-primary flex items-center justify-end px-2 text-[10px] font-semibold text-white tabular-nums"
                    style={{ width: `${c.pct}%`, minWidth: '2.5rem' }}
                  >
                    {c.pct >= 8 ? `${Math.round(c.pct)}%` : ''}
                  </div>
                </div>
                <span className="w-20 text-right text-text-muted text-xs tabular-nums">{c.count} ({Math.round(c.pct)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface p-5">
          <SectionHeader icon={Tag} title="Klasifikasi Hook Caption" subtitle="Pola pembuka caption yang digunakan" />
          <div className="space-y-2 text-sm">
            {Object.entries(hookClassification).map(([k, v]) => {
              const total = Object.values(hookClassification).reduce((s, n) => s + n, 0);
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-secondary">{HOOK_LABELS[k] ?? k}</span>
                    <span className="text-text-muted tabular-nums">{v} ({pct}%)</span>
                  </div>
                  <div className="bg-bg-tertiary rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-accent-warning" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {contentPillars.length > 0 && (
          <div className="surface p-5">
            <SectionHeader icon={BookOpen} title="Pilar Konten (TF-IDF)" subtitle="Tema dominan berdasarkan analisis caption" />
            <div className="flex flex-col gap-2">
              {contentPillars.map((p, i) => (
                <div key={i} className="bg-bg-tertiary border border-border-subtle rounded-lg p-3">
                  <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <span className="text-accent-primary tabular-nums">#{i + 1}</span>
                    {p.pillar}
                  </div>
                  {p.relatedTerms && p.relatedTerms.length > 0 && (
                    <div className="text-xs text-text-muted mt-1">
                      Istilah terkait: {p.relatedTerms.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface p-5">
          <SectionHeader icon={Hash} title="Tema Konten — 10 Hashtag Terbanyak" subtitle="Tagar yang paling sering muncul di caption (normalisasi: #doang, lowercase, dedup)" />
          {topHashtags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topHashtags.map((h) => (
                <span key={h.tag} className="chip bg-bg-tertiary text-text-secondary">
                  #{h.tag} <span className="text-text-muted">· {h.count}×</span>
                </span>
              ))}
            </div>
          ) : (
            <EmptyMini message="Belum ada hashtag yang terdeteksi." />
          )}
        </div>
        <div className="surface p-5">
          <SectionHeader icon={Users} title="Kolaborasi — 10 Mention Terbanyak" subtitle="Akun yang paling sering di-tag/disebut (normalisasi: @doang, lowercase, dedup)" />
          {topMentions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topMentions.map((m) => (
                <span key={m.mention} className="chip bg-bg-tertiary text-text-secondary">
                  @{m.mention} <span className="text-text-muted">· {m.count}×</span>
                </span>
              ))}
            </div>
          ) : (
            <EmptyMini message="Belum ada mention yang terdeteksi." />
          )}
        </div>
      </div>

      {hashtagCoOccurrence.pairs.length > 0 && (
        <div className="surface p-5">
          <SectionHeader icon={Hash} title="Pasangan Hashtag yang Sering Muncul Bersama" subtitle="Kombinasi hashtag yang muncul di post yang sama" />
          <div className="flex flex-wrap gap-2">
            {hashtagCoOccurrence.pairs.slice(0, 12).map((p, i) => (
              <span key={i} className="chip bg-bg-tertiary text-text-secondary">
                #{p.a} <span className="text-text-muted">+</span> #{p.b} <span className="text-text-muted">· {p.count}×</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
