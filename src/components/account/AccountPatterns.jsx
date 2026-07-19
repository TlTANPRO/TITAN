// V21.1: Account Patterns tab — heatmap, cadence, performance by day/month, duration, yearly summary, modern chart.
import { Calendar, Activity, Hourglass, BookOpen, BarChart3, Clock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import Heatmap from '../Heatmap.jsx';
import { formatNumber, formatPercent, formatCompact } from '../../lib/format.js';

function EmptyMini({ message }) {
  return <div className="text-sm text-text-muted italic py-4 text-center">{message}</div>;
}

export function AccountPatterns({ insights }) {
  const {
    performanceByDayOfWeek, performanceByMonth,
    durationAnalysis, yearlySummary,
    bestTimeOfDay, postingCadence
  } = insights;

  return (
    <div className="space-y-6">
      {/* Heatmap + Cadence */}
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

      {/* Performance by day of week */}
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

      {/* Performance by month */}
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

      {/* Duration analysis */}
      <div className="surface p-5">
        <SectionHeader icon={Hourglass} title="Analisis Durasi Video" subtitle="Rata-rata performa per bucket durasi" />
        {durationAnalysis.some((d) => d.postCount > 0) ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Rata-rata performa per bucket durasi video</caption>
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
          <EmptyMini message="Belum ada data durasi video yang bisa dianalisis." />
        )}
      </div>

      {/* Modern growth chart */}
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

      {/* Yearly summary */}
      {yearlySummary.length > 0 && (
        <div className="surface p-5">
          <SectionHeader icon={BookOpen} title="Ringkasan Tahunan" subtitle="Agregasi performa dikelompokkan per tahun" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Agregasi performa per tahun</caption>
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
    </div>
  );
}
