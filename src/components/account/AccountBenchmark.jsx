// V21.1: Account Benchmark tab — industry benchmark, growth potential, competitor watch.
import { Globe2, TrendingUp } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader.jsx';
import { CompetitorWatch } from '../CompetitorWatch.jsx';
import { formatNumber, formatPercent } from '../../lib/format.js';

export function AccountBenchmark({ account, insights }) {
  const { benchmark, aggregates, growthVelocity, internationalBenchmark, growthPotential } = insights;
  const enrichedAccount = {
    ...account,
    engagementRate: aggregates.engagementRate,
    avgLikes: aggregates.avgLikeCount,
    avgViews: aggregates.avgViewCount,
    postsPerWeek: growthVelocity.postsPerWeek
  };

  return (
    <div className="space-y-6">
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
            <div className={`text-3xl font-semibold tabular-nums mb-1 ${
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

      <div className="surface p-5">
        <SectionHeader icon={TrendingUp} title="Potensi Pertumbuhan" subtitle="Skor komposit 0-100 berdasarkan ER, frekuensi, dan konsistensi" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mt-2">
          <div className="md:col-span-1 flex flex-col items-center justify-center text-center">
            <div className="text-6xl font-semibold tabular-nums text-accent-primary">{growthPotential.score}</div>
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

      <CompetitorWatch account={enrichedAccount} />
    </div>
  );
}
