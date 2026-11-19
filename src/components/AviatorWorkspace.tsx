import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  Globe,
  Plane,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type {
  PlatformConnection,
  SyncedAviatorRound,
  WorkspacePage,
} from '../types/mines.ts';

interface AviatorWorkspaceProps {
  aviatorRounds: SyncedAviatorRound[];
  connections: PlatformConnection[];
  refreshing: boolean;
  onRefreshFeeds: () => Promise<void>;
  onNavigate: (page: WorkspacePage) => void;
}

export function AviatorWorkspace({
  aviatorRounds,
  connections,
  refreshing,
  onRefreshFeeds,
  onNavigate,
}: AviatorWorkspaceProps) {
  const aviatorConnections = useMemo(
    () => connections.filter((c) => c.selectedGame === 'aviator'),
    [connections]
  );

  const connectedSourcesCount = useMemo(
    () =>
      aviatorConnections.filter((c) => c.connectionStatus === 'Connected')
        .length,
    [aviatorConnections]
  );

  const stats = useMemo(() => {
    if (aviatorRounds.length === 0) {
      return null;
    }
    const sorted = [...aviatorRounds].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const mults = sorted.map((r) => r.multiplier);
    const sum = mults.reduce((acc, m) => acc + m, 0);
    const avg = Number((sum / mults.length).toFixed(2));
    const asc = [...mults].sort((a, b) => a - b);
    const mid = Math.floor(asc.length / 2);
    const median =
      asc.length % 2 === 0
        ? Number(((asc[mid - 1] + asc[mid]) / 2).toFixed(2))
        : asc[mid];
    const max = asc[asc.length - 1];

    const bands = [
      {
        label: '1.00× – 1.49×',
        count: mults.filter((m) => m < 1.5).length,
        color: 'bg-rose-400',
      },
      {
        label: '1.50× – 1.99×',
        count: mults.filter((m) => m >= 1.5 && m < 2).length,
        color: 'bg-amber-400',
      },
      {
        label: '2.00× – 4.99×',
        count: mults.filter((m) => m >= 2 && m < 5).length,
        color: 'bg-[#38BDF8]',
      },
      {
        label: '5.00× +',
        count: mults.filter((m) => m >= 5).length,
        color: 'bg-[#00D98B]',
      },
    ];

    const targets = [1.5, 2.0, 3.0, 5.0].map((target) => ({
      target,
      pct: Number(
        ((mults.filter((m) => m >= target).length / mults.length) * 100).toFixed(
          1
        )
      ),
    }));

    const recentSlice = mults.slice(0, Math.min(10, mults.length));
    const priorSlice = mults.slice(10);
    const recentAvg =
      recentSlice.length > 0
        ? recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length
        : null;
    const priorAvg =
      priorSlice.length > 0
        ? priorSlice.reduce((a, b) => a + b, 0) / priorSlice.length
        : null;
    const trendDelta =
      recentAvg !== null && priorAvg !== null
        ? Number((recentAvg - priorAvg).toFixed(2))
        : null;

    return {
      sorted,
      total: sorted.length,
      avg,
      median,
      max,
      bands,
      targets,
      trendDelta,
    };
  }, [aviatorRounds]);

  return (
    <div className="flex flex-col gap-5">
      {/* Workspace Header */}
      <section className="glass-panel rounded-2xl p-5 purple-highlight border-[#8B5CF6]/35 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/45 flex items-center justify-center shrink-0">
            <Plane className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F4F7FC]">
              Aviator Integration
            </h2>
            <p className="text-xs text-[#91A0B5]">
              {connectedSourcesCount} connected feed
              {connectedSourcesCount === 1 ? '' : 's'} · {aviatorRounds.length}{' '}
              synced rounds
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefreshFeeds()}
            disabled={refreshing || connectedSourcesCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/10 bg-[#050A12]/70 hover:bg-[#132638] disabled:opacity-50 text-xs font-semibold text-[#F4F7FC]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('platforms')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] text-[#050A12] text-xs font-bold emerald-glow"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Connect Platform</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Strict Uncertainty Warning */}
      <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          Statistical history only. Aviator crash rounds are independent and
          unpredictable — exact crash points or future multipliers are never
          guaranteed.
        </span>
      </div>

      {!stats ? (
        <section className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center gap-4">
          <ShieldAlert
            className="w-9 h-9 text-[#C4B5FD]"
            aria-hidden="true"
          />
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-bold text-[#F4F7FC]">
              No Authorized Aviator Data Synchronized
            </h3>
            <p className="text-xs text-[#91A0B5]">
              Connect an authorized Aviator feed on the Platforms page to view
              verified round IDs, timestamps, and historical multiplier
              distributions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('platforms')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00D98B] text-[#050A12] text-xs font-bold"
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Platform Directory</span>
          </button>
        </section>
      ) : (
        <>
          {/* Statistical Summary Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs text-[#91A0B5]">
                <span>Synced Rounds</span>
                <BarChart3 className="w-4 h-4 text-[#C4B5FD]" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#F4F7FC] tabular-nums">
                {stats.total}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs text-[#91A0B5]">
                <span>Mean / Median</span>
                <TrendingUp className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#38BDF8] tabular-nums">
                {stats.avg}× / {stats.median}×
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs text-[#91A0B5]">
                <span>Peak Observed</span>
                <Plane className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#00D98B] tabular-nums">
                {stats.max}×
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs text-[#91A0B5]">
                <span>Recent Shift (10)</span>
                <Clock className="w-4 h-4 text-[#91A0B5]" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#F4F7FC] tabular-nums">
                {stats.trendDelta === null
                  ? '—'
                  : `${stats.trendDelta >= 0 ? '+' : ''}${stats.trendDelta}×`}
              </div>
            </div>
          </section>

          {/* Distribution & Target Thresholds */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-6 glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-[#F4F7FC]">
                Multiplier Band Distribution
              </h3>
              <div className="flex flex-col gap-2.5">
                {stats.bands.map((b) => {
                  const pct = Number(((b.count / stats.total) * 100).toFixed(1));
                  return (
                    <div key={b.label} className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between text-[#91A0B5]">
                        <span>{b.label}</span>
                        <span className="font-semibold text-[#F4F7FC] tabular-nums">
                          {b.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#050A12] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${b.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="lg:col-span-6 glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-[#F4F7FC]">
                Historical Threshold Frequency
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {stats.targets.map((t) => (
                  <div
                    key={t.target}
                    className="rounded-xl border border-white/[0.08] bg-[#050A12]/70 p-3"
                  >
                    <div className="text-xs text-[#91A0B5]">
                      ≥ {t.target.toFixed(1)}×
                    </div>
                    <div className="text-xl font-bold text-[#00D98B] tabular-nums mt-1">
                      {t.pct}%
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Synchronized Round Table */}
          <section className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-[#F4F7FC]">
              Synchronized Round History
            </h3>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#91A0B5] border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2 pr-3">Platform</th>
                    <th className="py-2 pr-3">Round ID</th>
                    <th className="py-2 pr-3">Timestamp</th>
                    <th className="py-2 text-right">Multiplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {stats.sorted.slice(0, 100).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 font-semibold text-[#F4F7FC]">
                        {r.platformName}
                      </td>
                      <td className="py-2 pr-3 text-[#91A0B5] font-mono">
                        {r.roundId}
                      </td>
                      <td className="py-2 pr-3 text-[#91A0B5] tabular-nums">
                        {new Date(r.timestamp).toLocaleString()}
                      </td>
                      <td
                        className={`py-2 text-right font-bold tabular-nums ${
                          r.multiplier >= 2
                            ? 'text-[#00D98B]'
                            : 'text-[#38BDF8]'
                        }`}
                      >
                        {r.multiplier.toFixed(2)}×
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
