import { useParams, Link } from 'react-router-dom';
import { useAccount, useAccountInsights } from '../hooks/useAccount.js';
import ProfileHeader from '../components/ProfileHeader.jsx';
import Heatmap from '../components/Heatmap.jsx';
import OutlierCard from '../components/OutlierCard.jsx';
import StatCard from '../components/StatCard.jsx';
import SkeletonCard, { Skeleton } from '../components/SkeletonCard.jsx';
import SkeletonChart from '../components/SkeletonChart.jsx';
import { ViralRecipe } from '../components/ViralRecipe.jsx';
import { GrowthStrategy } from '../components/GrowthStrategy.jsx';
import { CompetitorWatch } from '../components/CompetitorWatch.jsx';
import { ContentCalendar } from '../components/ContentCalendar.jsx';
import { StrategyBrief } from '../components/StrategyBrief.jsx';
import { PostExplorer } from '../components/PostExplorer.jsx';
import { formatNumber, formatPercent, formatCompact } from '../lib/format.js';
import {
  Trophy, MessageSquare, Heart, Eye, Calendar, Sparkles, BarChart3,
  Globe2, Clock, Layers, Tag, Users, Lightbulb, TrendingUp, Hash,
  Activity, Target, BookOpen, BarChartHorizontal, Hourglass, Award
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, Tooltip, CartesianGrid, AreaChart, Area, Legend } from 'recharts';
import { normalizedHashtags, normalizedMentions, marketInsightsExtended, topByMetricExtended } from '../lib/analytics.js';
import { PlatformIcon } from '../components/icons/PlatformIcon.jsx';

const TIER_LABELS = {
  viral: { label: 'Sangat Viral', color: 'text-purple-400', desc: '> 3× rata-rata' },
  tinggi: { label: 'Performa Tinggi', color: 'text-accent-warning', desc: '1.5–3× rata-rata' },
  bagus: { label: 'Performa Bagus', color: 'text-accent-success', desc: '0.75–1.5× rata-rata' },
  rataRata: { label: 'Rata-rata', color: 'text-text-secondary', desc: '0.3–0.75× rata-rata' },
  rendah: { label: 'Rendah', color: 'text-text-muted', desc: '< 0.3× rata-rata' }
};

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

function EmptyState({ message }) {
  return (
    <div className="text-sm text-text-muted italic py-4 text-center">
      {message ?? 'Data tidak tersedia untuk saat ini.'}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-accent-primary" />}
        {title}
      </h3>
      {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

function HealthBar({ label, value }) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-text-muted">
        <span>{label}</span>
        <span className="font-semibold text-text-primary tabular-nums">{safeValue}</span>
      </div>
      <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mt-0.5">
        <div
          className={`h-full ${
            safeValue >= 80 ? 'bg-emerald-500' :
            safeValue >= 60 ? 'bg-sky-500' :
            safeValue >= 40 ? 'bg-yellow-500' :
            'bg-rose-500'
          }`}
          style={{ width: `${Math.min(100, safeValue)}%` }}
        />
      </div>
    </div>
  );
}

function PostList({ posts, metric, icon: Icon, accent, emptyText }) {
  const items = (posts ?? []).filter((p) => (p[metric] ?? 0) > 0).slice(0, 5);
  if (items.length === 0) {
    return <EmptyState message={emptyText ?? 'Belum ada post dengan metrik ini.'} />;
  }
  return (
    <ul className="text-sm space-y-2">
      {items.map((p, i) => (
        <li key={p.id ?? i} className="flex items-start gap-2 text-text-secondary">
          <span className="text-text-muted text-xs w-4 mt-0.5">{i + 1}.</span>
          {p.postUrl ? (
            <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="line-clamp-1 flex-1 hover:text-text-primary">
              {p.caption || '(tanpa caption)'}
            </a>
          ) : (
            <span className="line-clamp-1 flex-1">{p.caption || '(tanpa caption)'}</span>
          )}
          <span className={`text-xs tabular-nums flex items-center gap-1 ${accent}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {formatCompact(p[metric])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AccountPage() {
  const { slug } = useParams();
  const account = useAccount(slug);
  const insights = useAccountInsights(slug);

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-secondary">
        <div>
          Akun tidak ditemukan.{' '}
          <Link to="/" className="text-accent-primary hover:underline">Kembali ke beranda</Link>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            <SkeletonCard height={200} />
            <SkeletonCard height={200} />
            <SkeletonCard height={200} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SkeletonChart height={220} />
            <SkeletonChart height={220} />
          </div>
        </div>
      </div>
    );
  }

  const {
    aggregates, benchmark, tiers, availability,
    topByViews, topByLikes, topByComments,
    topHashtags, topMentions,
    performanceByDayOfWeek, performanceByMonth,
    durationAnalysis, yearlySummary,
    marketInsights, marketInsightsExtended: extendedInsights, growthPotential,
    bestTimeOfDay, postingCadence, contentMix,
    hashtagCoOccurrence, hookClassification,
    outlierPosts, growthVelocity, internationalBenchmark, contentPillars,
    healthScore, viralRecipe, contentCalendar, heatmapByMediaType, lastViral
  } = insights;

  // V11: prefer 10+ item extended insights, fall back to short version.
  const insightsForPanel = extendedInsights ?? marketInsightsExtended({ ...account, aggregates }, insights) ?? marketInsights;

  // Map contentMix counts → label bahasa Indonesia
  const contentMixID = Object.entries(contentMix.counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, label: MEDIA_LABELS[k] ?? k, count: v, pct: contentMix.percentages[k] ?? 0 }));

  return (
    <div className="bg-bg-primary">
      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 pb-32 md:pb-8">
        {/* ===== SECTION 1: PROFIL ===== */}
        <ProfileHeader account={{ ...account, aggregates, availability, engagementRate: aggregates.engagementRate, tiers, cadence: postingCadence }} />

        {availability.message && (
          <div className="surface p-4 border border-accent-warning/30 bg-accent-warning/5 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="text-sm">
              <div className="font-semibold text-accent-warning mb-1">Data Terbatas Terdeteksi</div>
              <div className="text-text-secondary">{availability.message}</div>
              <div className="text-xs text-text-muted mt-1">Solusi: jalankan ulang <code className="bg-bg-tertiary px-1 rounded">pnpm scrape:ig:enrich</code> setelah 07:00 WIB untuk memperbarui data.</div>
            </div>
          </div>
        )}

        {/* ===== SECTION 2-4: TOP 5 POSTS ===== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="surface p-5">
            <SectionHeader icon={Eye} title="5 Post Teratas — Tayangan" subtitle="Post dengan jumlah tayangan tertinggi" />
            <PostList posts={topByViews} metric="viewCount" icon={Eye} accent="text-accent-primary" />
          </div>
          <div className="surface p-5">
            <SectionHeader icon={Heart} title="5 Post Teratas — Suka" subtitle={availability.likes ? 'Post dengan jumlah suka tertinggi' : 'Memerlukan enrichment /media/info'} />
            {availability.likes ? (
              <PostList posts={topByLikes} metric="likeCount" icon={Heart} accent="text-accent-danger" />
            ) : (
              <EmptyState message="Data like tidak tersedia untuk akun ini." />
            )}
          </div>
          <div className="surface p-5">
            <SectionHeader icon={MessageSquare} title="5 Post Teratas — Komentar" subtitle="Post dengan jumlah komentar tertinggi" />
            {availability.comments ? (
              <PostList posts={topByComments} metric="commentCount" icon={MessageSquare} accent="text-accent-warning" />
            ) : (
              <EmptyState message="Data komentar tidak tersedia untuk akun ini." />
            )}
          </div>
        </div>

        {/* ===== POST EXPLORER (filter + search + sort) ===== */}
        <PostExplorer posts={account.posts} followerCount={account.followerCount ?? 0} />

        {/* ===== SECTION 5: DISTRIBUSI TINGKATAN PERFORMA ===== */}
        <div className="surface p-5">
          <SectionHeader
            icon={BarChartHorizontal}
            title="Distribusi Tingkatan Performa"
            subtitle="Pengelompokan post berdasarkan rasio performa vs rata-rata akun"
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(TIER_LABELS).map(([k, meta]) => {
              const count = tiers[k] ?? 0;
              const total = Object.values(tiers).reduce((s, v) => s + v, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={k} className="bg-bg-tertiary rounded-lg p-3 text-center border border-border-subtle">
                  <div className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</div>
                  <div className="text-xs text-text-muted mt-0.5 mb-2">{meta.desc}</div>
                  <div className={`text-2xl font-bold tabular-nums ${meta.color}`}>{count}</div>
                  <div className="text-[10px] text-text-muted mt-1">{pct}% dari total</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== SECTION 6-7: TEMA KONTEN & KOLABORASI ===== */}
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
              <EmptyState message="Belum ada hashtag yang terdeteksi." />
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
              <EmptyState message="Belum ada mention yang terdeteksi." />
            )}
          </div>
        </div>

        {/* ===== SECTION 8: PERFORMA PER HARI ===== */}
        <div className="surface p-5">
          <SectionHeader icon={Calendar} title="Performa per Hari" subtitle="Rata-rata likes per hari dalam seminggu" />
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceByDayOfWeek}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1f1f1f', border: '1px solid #3f3f46', borderRadius: 8 }}
                  formatter={(v) => formatNumber(v)}
                />
                <Bar dataKey="avgLikeCount" name="Rata-rata Suka" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ===== SECTION 9: PERFORMA BULANAN ===== */}
        <div className="surface p-5">
          <SectionHeader icon={Activity} title="Performa Bulanan" subtitle="Tren rata-rata engagement rate per bulan (skala auto supaya bulan kecil tidak flat)" />
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceByMonth}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={11} domain={['auto', 'auto']} allowDataOverflow={false} />
                <Tooltip
                  contentStyle={{ background: '#1f1f1f', border: '1px solid #3f3f46', borderRadius: 8 }}
                  formatter={(v) => formatPercent(v, 3)}
                />
                <Line type="monotone" dataKey="avgEngagementRate" name="ER (%)" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ===== SECTION 10: ANALISIS DURASI VIDEO ===== */}
        <div className="surface p-5">
          <SectionHeader icon={Hourglass} title="Analisis Durasi Video" subtitle="Rata-rata performa per bucket durasi" />
          {durationAnalysis.some((d) => d.postCount > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                    <th className="text-left py-2 px-3 font-medium">Bucket Durasi</th>
                    <th className="text-right py-2 px-3 font-medium">Jumlah Post</th>
                    <th className="text-right py-2 px-3 font-medium">Rata-rata Tayangan</th>
                    <th className="text-right py-2 px-3 font-medium">Rata-rata ER</th>
                  </tr>
                </thead>
                <tbody>
                  {durationAnalysis.map((d, i) => (
                    <tr key={i} className={`border-b border-border-subtle/50 ${d.postCount === 0 ? 'opacity-40' : ''}`}>
                      <td className="py-2 px-3 text-text-secondary">{d.bucket}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{d.postCount}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">{formatCompact(d.avgViewCount)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-accent-success">{formatPercent(d.avgEngagementRate, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Belum ada data durasi video yang bisa dianalisis." />
          )}
        </div>

        {/* ===== SECTION 11: RINGKASAN TAHUNAN ===== */}
        {yearlySummary.length > 0 && (
          <div className="surface p-5">
            <SectionHeader icon={BookOpen} title="Ringkasan Tahunan" subtitle="Agregasi performa dikelompokkan per tahun" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-muted uppercase border-b border-border-subtle">
                    <th className="text-left py-2 px-3 font-medium">Tahun</th>
                    <th className="text-right py-2 px-3 font-medium">Jumlah Post</th>
                    <th className="text-right py-2 px-3 font-medium">Total Suka</th>
                    <th className="text-right py-2 px-3 font-medium">Total Komentar</th>
                    <th className="text-right py-2 px-3 font-medium">Rata-rata ER</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlySummary.map((y) => (
                    <tr key={y.year} className="border-b border-border-subtle/50">
                      <td className="py-2 px-3 font-semibold text-text-primary">{y.year}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{y.postCount}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">{formatCompact(y.totalLikeCount)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">{formatCompact(y.totalCommentCount)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-accent-success">{formatPercent(y.avgEngagementRate, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== SECTION 12: INSIGHT & REKOMENDASI ===== */}
        <div className="surface p-5">
          <SectionHeader icon={Lightbulb} title={`Insight & Rekomendasi (${insightsForPanel.strengths.length} kekuatan · ${insightsForPanel.weaknesses.length} kelemahan · ${insightsForPanel.recommendations.length} aksi)`} subtitle="Dihasilkan otomatis dari 9+ analytics primitives (mix, cadence, viral, pillar, hook, hashtag, velocity, availability)" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div className="bg-accent-success/5 border border-accent-success/20 rounded-lg p-4">
              <div className="text-xs font-semibold text-accent-success uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Kekuatan ({insightsForPanel.strengths.length})
              </div>
              <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
                {insightsForPanel.strengths.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
              </ul>
            </div>
            <div className="bg-accent-danger/5 border border-accent-danger/20 rounded-lg p-4">
              <div className="text-xs font-semibold text-accent-danger uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Kelemahan ({insightsForPanel.weaknesses.length})
              </div>
              <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
                {insightsForPanel.weaknesses.map((w, i) => <li key={i} className="leading-relaxed">{w}</li>)}
              </ul>
            </div>
            <div className="bg-accent-primary/5 border border-accent-primary/20 rounded-lg p-4">
              <div className="text-xs font-semibold text-accent-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Rekomendasi ({insightsForPanel.recommendations.length})
              </div>
              <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
                {insightsForPanel.recommendations.map((r, i) => <li key={i} className="leading-relaxed">{r}</li>)}
              </ul>
            </div>
          </div>
        </div>

        {/* ===== SECTION 13: BENCHMARK INDUSTRI ===== */}
        <div className="surface p-5">
          <SectionHeader icon={Globe2} title="Benchmark Industri" subtitle="Perbandingan dengan standar industri (Rival IQ 2024)" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">ER Akun Ini</span>
                <span className="text-text-primary font-semibold tabular-nums">{formatPercent(internationalBenchmark.accountER, 3)}</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Median Industri</span>
                <span className="text-text-muted tabular-nums">{formatPercent(internationalBenchmark.medianER, 3)}</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Kuartil Atas</span>
                <span className="text-text-muted tabular-nums">{formatPercent(internationalBenchmark.topQuartileER, 3)}</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Vertikal Properti/Lifestyle</span>
                <span className="text-text-muted tabular-nums">{formatPercent(internationalBenchmark.verticalER, 3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Wilayah APAC</span>
                <span className="text-text-muted tabular-nums">{formatPercent(internationalBenchmark.apacER, 3)}</span>
              </div>
            </div>
            <div className="bg-bg-tertiary rounded-lg p-4 flex flex-col justify-center items-center text-center">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Performa vs Median Global</div>
              <div className={`text-3xl font-bold tabular-nums mb-1 ${
                internationalBenchmark.performanceVsMedian === 'above' ? 'text-accent-success'
                : internationalBenchmark.performanceVsMedian === 'below' ? 'text-accent-danger'
                : 'text-text-secondary'
              }`}>
                {internationalBenchmark.performanceVsMedian === 'above' ? '↑ Di Atas'
                : internationalBenchmark.performanceVsMedian === 'below' ? '↓ Di Bawah'
                : '→ Rata-rata'}
              </div>
              <div className="text-xs text-text-muted">vs median {formatPercent(internationalBenchmark.medianER, 2)}</div>
            </div>
          </div>
        </div>

        {/* ===== SECTION 14: POTENSI PERTUMBUHAN ===== */}
        <div className="surface p-5">
          <SectionHeader icon={TrendingUp} title="Potensi Pertumbuhan" subtitle="Skor komposit 0-100 berdasarkan ER, frekuensi, dan konsistensi" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mt-2">
            <div className="md:col-span-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl font-bold tabular-nums text-accent-primary">{growthPotential.score}</div>
              <div className="text-xs text-text-muted uppercase tracking-wider">/ 100</div>
              <div className={`mt-2 chip ${
                growthPotential.label === 'tinggi' ? 'bg-accent-success/10 text-accent-success'
                : growthPotential.label === 'sedang' ? 'bg-accent-warning/10 text-accent-warning'
                : 'bg-accent-danger/10 text-accent-danger'
              }`}>
                Potensi {growthPotential.label === 'tinggi' ? 'Tinggi' : growthPotential.label === 'sedang' ? 'Sedang' : 'Rendah'}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-text-secondary">{growthPotential.reasoning}</div>
              <div className="mt-3 text-xs text-text-muted">
                <div className="flex justify-between border-b border-border-subtle/50 py-1.5">
                  <span>ER vs Benchmark</span>
                  <span className="text-text-secondary">{benchmark.engagementRateComparison === 'above' ? 'Di atas' : benchmark.engagementRateComparison === 'below' ? 'Di bawah' : 'Rata-rata'}</span>
                </div>
                <div className="flex justify-between border-b border-border-subtle/50 py-1.5">
                  <span>Frekuensi Posting</span>
                  <span className="text-text-secondary">{formatNumber(aggregates.postsPerWeek)}× / minggu ({benchmark.postingFrequencyComparison === 'above' ? 'di atas' : benchmark.postingFrequencyComparison === 'below' ? 'di bawah' : 'rata-rata'} benchmark {benchmark.postingFrequencyBenchmark}×)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Like per Follower</span>
                  <span className="text-text-secondary">{formatPercent(benchmark.accountLikesPerFollower * 100, 3)} ({benchmark.likesPerFollowerComparison === 'above' ? 'di atas' : benchmark.likesPerFollowerComparison === 'below' ? 'di bawah' : 'rata-rata'} benchmark {formatPercent(benchmark.likesPerFollowerBenchmark * 100, 2)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION 15: GRAFIK MODERN PERTUMBUHAN AKUN ===== */}
        <div className="surface p-5">
          <SectionHeader
            icon={BarChart3}
            title="Grafik Modern — Pertumbuhan Akun"
            subtitle="Jumlah post (kiri) dan total likes (kanan) per bulan — domain auto supaya bulan kecil tetap terbaca"
          />
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceByMonth}>
                <defs>
                  <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#71717a" fontSize={10} />
                <YAxis yAxisId="left" stroke="#71717a" fontSize={11} domain={['auto', 'auto']} allowDataOverflow={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={11} domain={['auto', 'auto']} allowDataOverflow={false} />
                <Tooltip
                  contentStyle={{ background: '#1f1f1f', border: '1px solid #3f3f46', borderRadius: 8 }}
                  formatter={(v, name) => [formatNumber(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="left" type="monotone" dataKey="postCount" name="Jumlah Post" stroke="#3b82f6" fill="url(#colorPosts)" strokeWidth={2} connectNulls />
                <Area yAxisId="right" type="monotone" dataKey="totalLikeCount" name="Total Suka" stroke="#ec4899" fill="url(#colorLikes)" strokeWidth={2} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ===== OUTLIER POSTS (BONUS SECTION, DARI PLAN) ===== */}
        {outlierPosts.length > 0 && (
          <div className="surface p-5">
            <SectionHeader
              icon={Sparkles}
              title="Post Outlier (Performa > 2σ)"
              subtitle={`${outlierPosts.length} post dengan performa jauh di atas rata-rata`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {outlierPosts.slice(0, 6).map((o, i) => <OutlierCard key={i} outlier={o} />)}
            </div>
          </div>
        )}

        {/* ===== POSTING CADENCE & HEATMAP (DARI PLAN, DI BAWAH) ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Heatmap bestTime={bestTimeOfDay} />
          </div>
          <div className="surface p-5">
            <SectionHeader icon={Clock} title="Konsistensi Posting" subtitle="Jeda rata-rata antar post" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Skor Konsistensi</span>
                <span className="font-bold text-text-primary tabular-nums">{postingCadence.score}/100</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Rata-rata Jeda</span>
                <span className="text-text-primary tabular-nums">{postingCadence.avgGapDays.toFixed(1)} hari</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Std Dev Jeda</span>
                <span className="text-text-primary tabular-nums">{postingCadence.stdDevDays.toFixed(1)} hari</span>
              </div>
              <div className="flex justify-between border-b border-border-subtle/50 pb-2">
                <span className="text-text-secondary">Jeda Terlama</span>
                <span className="text-text-primary tabular-nums">{Math.round(postingCadence.longestGapDays)} hari</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Post Terakhir</span>
                <span className="text-text-primary tabular-nums">{Math.round(postingCadence.currentStreakDays)} hari lalu</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== CONTENT MIX ===== */}
        {contentMixID.length > 0 && (
          <div className="surface p-5">
            <SectionHeader icon={Layers} title="Komposisi Format Konten" subtitle="Proporsi tipe media yang dipublikasikan" />
            <div className="space-y-2">
              {contentMixID.map((c) => (
                <div key={c.key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 text-text-secondary text-xs flex-shrink-0">{c.label}</span>
                  <div className="flex-1 bg-bg-tertiary rounded-full h-2.5 overflow-hidden">
                    <div className="h-full bg-accent-primary" style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="w-20 text-right text-text-muted text-xs tabular-nums">{c.count} ({Math.round(c.pct)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== HOOK CLASSIFICATION ===== */}
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

        {/* ===== HASHTAG CO-OCCURRENCE ===== */}
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

        {/* ===== GROWTH VELOCITY (DARI PLAN) ===== */}
        {growthVelocity.trend && growthVelocity.trend !== 'insufficient_data' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="Tren Pertumbuhan"
              value={growthVelocity.trend === 'up' ? '↑ Naik' : growthVelocity.trend === 'down' ? '↓ Turun' : '→ Stabil'}
              accent={growthVelocity.trend === 'up' ? 'text-accent-success' : growthVelocity.trend === 'down' ? 'text-accent-danger' : 'text-text-secondary'}
            />
            <StatCard label="Slope (per bulan)" value={growthVelocity.slope?.toFixed(3) ?? '0'} accent="text-text-primary" />
            <StatCard label="Proyeksi ER Bulan Depan" value={formatPercent(growthVelocity.forecast ?? 0, 3)} accent="text-accent-primary" />
          </div>
        )}

        {/* ===== V10 PHASE 3: 5 NEW SECTIONS ===== */}
        <div className="text-[10px] text-text-muted uppercase tracking-widest text-center py-2">— V10 Deep Analysis —</div>

        {/* SECTION 20: HEALTH SCORE BADGE */}
        {healthScore && (
          <div className="surface p-5">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent-primary" />
              Account Health Score
              <PlatformIcon platform={account?.platform} className="w-3.5 h-3.5 ml-1" />
            </h3>
            <div className="flex items-center gap-6 flex-wrap">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold border-2 ${
                (healthScore.score ?? 0) >= 80 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' :
                (healthScore.score ?? 0) >= 65 ? 'bg-sky-500/10 text-sky-500 border-sky-500/30' :
                (healthScore.score ?? 0) >= 50 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                (healthScore.score ?? 0) >= 35 ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
                'bg-rose-500/10 text-rose-500 border-rose-500/30'
              }`}>
                {healthScore.grade ?? '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-3xl font-bold text-text-primary tabular-nums">{Number.isFinite(healthScore.score) ? healthScore.score : 0}<span className="text-base text-text-muted">/100</span></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
                  <HealthBar label="Engagement" value={healthScore.breakdown?.engagement ?? 0} />
                  <HealthBar label="Konsistensi" value={healthScore.breakdown?.consistency ?? 0} />
                  <HealthBar label="Pertumbuhan" value={healthScore.breakdown?.growth ?? 0} />
                  <HealthBar label="Diversitas" value={healthScore.breakdown?.diversity ?? 0} />
                </div>
              </div>
              {lastViral && (
                <div className="text-right">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Hari Sejak Viral Terakhir</div>
                  <div className="text-2xl font-bold text-text-primary tabular-nums">{lastViral.days ?? '—'}</div>
                  {lastViral.lastViralDate && (
                    <div className="text-[10px] text-text-muted">pada {lastViral.lastViralDate}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 21: VIRAL RECIPE */}
        <ViralRecipe insights={insights} account={account} />

        {/* SECTION 22: GROWTH STRATEGY */}
        <GrowthStrategy insights={insights} account={account} />

        {/* SECTION 23: COMPETITOR WATCH */}
        <CompetitorWatch account={{ ...account, engagementRate: aggregates.engagementRate, avgLikes: aggregates.avgLikeCount, avgViews: aggregates.avgViewCount, postsPerWeek: growthVelocity.postsPerWeek }} />

        {/* SECTION 24: CONTENT CALENDAR */}
        <ContentCalendar account={account} insights={insights} />

        {/* SECTION 25: STRATEGY BRIEF (SWOT) */}
        <StrategyBrief account={account} insights={insights} />
      </main>
    </div>
  );
}
