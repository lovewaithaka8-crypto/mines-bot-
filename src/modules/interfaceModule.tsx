import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  Globe,
  Grid,
  Loader2,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AnalysisEngineMode,
  AnalysisWindowSetting,
  GenerationMode,
  SignalRecord,
  UserSettings,
  WorkspacePage,
} from '../types/mines.ts';
import {
  calcJointSurvivalProbability,
  calcSingleTileSafety,
  classifyRisk,
  formatCoordList,
} from './probabilityModule.ts';
import {
  computeEmpiricalTileMatrix,
  computePerformanceMetrics,
  formatWindowLabel,
} from './performanceTrackingModule.ts';
import {
  exportSignalsAsCsv,
  exportSignalsAsJson,
} from './databaseModule.ts';
import { playSignalGeneratedSound } from '../services/soundEffects.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

/* ---------------- 1. Overview Page ---------------- */

export function OverviewView({
  signals,
  connectedPlatformsCount,
  onNavigate,
}: {
  signals: SignalRecord[];
  connectedPlatformsCount: number;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const metrics = useMemo(() => computePerformanceMetrics(signals), [signals]);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[#91A0B5]">
            <span>Stored Signals</span>
            <Activity className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#F4F7FC] tabular-nums">
            {metrics.totalSignals}
          </div>
          <div className="mt-1 text-[11px] text-[#91A0B5] tabular-nums">
            {metrics.evaluatedRounds} evaluated · {metrics.pendingRounds} active
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[#91A0B5]">
            <span>7h Window</span>
            <Clock className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#38BDF8] tabular-nums">
            {metrics.sevenHourSignals}
          </div>
          <div className="mt-1 text-[11px] text-[#91A0B5] tabular-nums">
            {metrics.sevenHourAccuracyPct === null
              ? 'No evaluated picks yet'
              : `${metrics.sevenHourAccuracyPct}% verified safe`}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[#91A0B5]">
            <span>Measured Accuracy</span>
            <CheckCircle2 className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#00D98B] tabular-nums">
            {metrics.measuredSafeRatePct === null
              ? '—'
              : `${metrics.measuredSafeRatePct}%`}
          </div>
          <div className="mt-1 text-[11px] text-[#91A0B5]">
            {metrics.totalEvaluatedPicks === 0
              ? 'Record outcomes to score'
              : `${metrics.correctRecommendations} safe / ${metrics.incorrectRecommendations} mine`}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-[#91A0B5]">
            <span>Platforms</span>
            <Globe className="w-4 h-4 text-[#8B5CF6]" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#F4F7FC] tabular-nums">
            {connectedPlatformsCount}
          </div>
          <div className="mt-1 text-[11px] text-[#91A0B5]">
            Connected feeds
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#00D98B]/15 border border-[#00D98B]/35 flex items-center justify-center shrink-0">
            <Grid className="w-5 h-5 text-[#00D98B]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F4F7FC]">
              Mines Analyzer <span className="text-[#00D98B]">Ready</span>
            </h2>
            <p className="text-xs text-[#91A0B5]">
              5 × 5 statistical grid, 7-hour rolling window, and verified outcome logging.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('analyzer')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] text-[#050A12] text-xs font-bold emerald-glow transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Mines</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('platforms')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:border-[#00D98B]/45 text-[#F4F7FC] text-xs font-semibold transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
            <span>Platforms</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-[#8B5CF6]/45 text-[#F4F7FC] text-xs font-semibold transition-colors"
          >
            History
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------------- 2. Analyzer / Signal Control Panel ---------------- */

const WINDOW_OPTIONS: Array<{ value: AnalysisWindowSetting; label: string }> = [
  { value: '7h', label: 'Previous 7 Hours' },
  { value: 10, label: 'Last 10 Rounds' },
  { value: 25, label: 'Last 25 Rounds' },
  { value: 50, label: 'Last 50 Rounds' },
  { value: 0, label: 'All Stored Rounds' },
];

export function SignalControlPanel({
  settings,
  activeSignal,
  isAnalyzing,
  apiError,
  syncedMinesRoundsCount,
  onUpdateSettings,
  onGenerateSignal,
  onRefreshAnalysis,
  onClearBoard,
  onDismissError,
  onOpenPlatforms,
}: {
  settings: UserSettings;
  activeSignal: SignalRecord | null;
  isAnalyzing: boolean;
  apiError: string | null;
  syncedMinesRoundsCount: number;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onGenerateSignal: () => void;
  onRefreshAnalysis: () => void;
  onClearBoard: () => void;
  onDismissError: () => void;
  onOpenPlatforms: () => void;
}) {
  const trapsCount = settings.defaultMinesCount;
  const maxSafe = 25 - trapsCount;
  const clampedRec = Math.min(settings.recommendedCount, maxSafe);
  const presets = [1, 3, 5, 10, 15, 20];

  const singleSafe = calcSingleTileSafety(trapsCount);
  const jointSurvival = calcJointSurvivalProbability(trapsCount, clampedRec);
  const riskTier = classifyRisk(trapsCount, clampedRec, jointSurvival);

  return (
    <aside className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-xs font-bold text-[#F4F7FC]">
          <Sliders className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
          <span>Controls</span>
        </div>
        <button
          type="button"
          onClick={onOpenPlatforms}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#38BDF8] hover:underline"
        >
          <Globe className="w-3 h-3" aria-hidden="true" />
          <span>
            {syncedMinesRoundsCount > 0
              ? `${syncedMinesRoundsCount} Synced`
              : 'Platforms'}
          </span>
        </button>
      </div>

      {/* Mine / Trap Count */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="ctrl-traps" className="text-[#91A0B5] font-medium">
            Mines (1–24)
          </label>
          <span className="font-bold text-[#F4F7FC] tabular-nums">
            {trapsCount} {trapsCount === 1 ? 'Mine' : 'Mines'}
          </span>
        </div>
        <select
          id="ctrl-traps"
          value={trapsCount}
          onChange={(e) =>
            onUpdateSettings({ defaultMinesCount: Number(e.target.value) })
          }
          className="w-full px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-sm font-semibold text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
        >
          {Array.from({ length: 24 }, (_, i) => i + 1).map((t) => (
            <option key={t} value={t}>
              {t} {t === 1 ? 'Mine' : 'Mines'} ({25 - t} Safe)
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onUpdateSettings({ defaultMinesCount: p })}
              className={`flex-1 min-w-[36px] py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                trapsCount === p
                  ? 'border-[#00D98B] bg-[#00D98B]/20 text-[#00D98B]'
                  : 'border-white/10 text-[#91A0B5] hover:border-[#00D98B]/45'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Recommended Selections Count */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="ctrl-rec-count" className="text-[#91A0B5] font-medium">
            Safe Picks (1–{maxSafe})
          </label>
          <span className="font-bold text-[#00D98B] tabular-nums">
            {clampedRec} {clampedRec === 1 ? 'Tile' : 'Tiles'}
          </span>
        </div>
        <input
          id="ctrl-rec-count"
          type="range"
          min={1}
          max={maxSafe}
          value={clampedRec}
          onChange={(e) =>
            onUpdateSettings({ recommendedCount: Number(e.target.value) })
          }
          className="w-full accent-[#00D98B] cursor-pointer"
        />
      </div>

      {/* Analysis Window & Engine Mode */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <label htmlFor="ctrl-win" className="text-[#91A0B5]">
            Window
          </label>
          <select
            id="ctrl-win"
            value={String(settings.analysisWindow)}
            onChange={(e) => {
              const raw = e.target.value;
              const nextWin: AnalysisWindowSetting =
                raw === '7h'
                  ? '7h'
                  : (Number(raw) as AnalysisWindowSetting);
              onUpdateSettings({ analysisWindow: nextWin });
            }}
            className="px-2.5 py-2 rounded-xl border border-white/10 bg-[#050A12] text-[#F4F7FC]"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ctrl-eng" className="text-[#91A0B5]">
            Engine
          </label>
          <select
            id="ctrl-eng"
            value={settings.analysisEngineMode}
            onChange={(e) =>
              onUpdateSettings({
                analysisEngineMode: e.target.value as AnalysisEngineMode,
              })
            }
            className="px-2.5 py-2 rounded-xl border border-white/10 bg-[#050A12] text-[#F4F7FC]"
          >
            <option value="ai_assisted">AI (Gemini)</option>
            <option value="combinatorial_only">Math Only</option>
          </select>
        </div>
      </div>

      {/* Theoretical Confidence Summary */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-2.5 text-center text-xs">
        <div>
          <div className="text-[10px] text-[#91A0B5]">Single Safe</div>
          <div className="font-bold text-[#F4F7FC] tabular-nums">{singleSafe}%</div>
        </div>
        <div className="border-x border-white/[0.08]">
          <div className="text-[10px] text-[#91A0B5]">Path Odds</div>
          <div className="font-bold text-[#38BDF8] tabular-nums">
            {jointSurvival}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#91A0B5]">Risk Tier</div>
          <div
            className={`font-bold text-[11px] ${
              riskTier === 'LOW RISK'
                ? 'text-[#00D98B]'
                : riskTier === 'MEDIUM RISK'
                  ? 'text-amber-400'
                  : 'text-rose-400'
            }`}
          >
            {riskTier}
          </div>
        </div>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-3 text-xs text-red-200 flex flex-col gap-2"
        >
          <div className="flex justify-between gap-2">
            <span className="font-semibold">Analysis Error</span>
            <button type="button" onClick={onDismissError} className="underline">
              Dismiss
            </button>
          </div>
          <p>{apiError}</p>
          <button
            type="button"
            onClick={() => {
              onUpdateSettings({ analysisEngineMode: 'combinatorial_only' });
              onDismissError();
            }}
            className="self-start px-2.5 py-1 rounded bg-rose-500/25 font-semibold"
          >
            Switch to Math Only
          </button>
        </div>
      )}

      {/* Primary Action Controls */}
      <button
        type="button"
        onClick={onGenerateSignal}
        disabled={isAnalyzing}
        className="w-full py-3 px-4 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] disabled:opacity-60 text-[#050A12] text-sm font-bold flex items-center justify-center gap-2 emerald-glow transition-colors"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Analysing...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Generate</span>
          </>
        )}
      </button>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={onRefreshAnalysis}
          disabled={isAnalyzing}
          className="py-2 px-3 rounded-xl border border-[#38BDF8]/35 bg-[#38BDF8]/10 text-[#F4F7FC] font-semibold flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
          <span>Refresh</span>
        </button>
        <button
          type="button"
          onClick={onClearBoard}
          className="py-2 px-3 rounded-xl border border-white/10 text-[#91A0B5] hover:text-white font-semibold"
        >
          Clear
        </button>
      </div>

      {/* Active Signal Metadata */}
      {activeSignal && (
        <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#91A0B5]">Reference</span>
            <span className="font-semibold text-[#38BDF8]">{activeSignal.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#91A0B5]">Window</span>
            <span className="font-medium text-[#F4F7FC]">
              {activeSignal.windowLabel ??
                formatWindowLabel(settings.analysisWindow)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#91A0B5]">Status</span>
            <span className="font-semibold text-[#00D98B]">
              {activeSignal.status}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#91A0B5] shrink-0">Picks</span>
            <span className="font-semibold text-[#00D98B] text-right">
              {formatCoordList(activeSignal.recommendedIndices)}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------------- 3. Signal History with Search, Filtering & Pagination ---------------- */

const PAGE_SIZE = 10;

export function SignalHistoryView({
  signals,
  onInspectSignal,
  onDeleteSignal,
}: {
  signals: SignalRecord[];
  onInspectSignal: (id: string, openLog: boolean) => void;
  onDeleteSignal: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Evaluated'>('all');
  const [page, setPage] = useState(1);

  const { filtered, totalPages, safePage, pageItems } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = signals.filter((sig) => {
      if (statusFilter === 'Active' && sig.status !== 'Active') return false;
      if (statusFilter === 'Evaluated' && sig.status === 'Active') return false;
      if (q) {
        const coords = formatCoordList(sig.recommendedIndices).toLowerCase();
        const win = (sig.windowLabel ?? '').toLowerCase();
        return (
          sig.id.toLowerCase().includes(q) ||
          coords.includes(q) ||
          win.includes(q)
        );
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    return {
      filtered: list,
      totalPages: pages,
      safePage: current,
      pageItems: list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    };
  }, [signals, statusFilter, search, page]);

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#F4F7FC]">Round History</h2>
          <p className="text-xs text-[#91A0B5] tabular-nums">
            {filtered.length} matching records ({signals.length} total)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-[#91A0B5] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search ID or coord..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
            />
          </div>

          <select
            aria-label="Filter by evaluation status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'Active' | 'Evaluated');
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC]"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active (Pending)</option>
            <option value="Evaluated">Evaluated</option>
          </select>
        </div>
      </div>

      {pageItems.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#91A0B5]">
          No signal records found. Generate signals in the Mines Analyzer to populate history.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[#91A0B5]">
                  <th className="py-2.5 pr-3">Reference</th>
                  <th className="py-2.5 px-3">Window</th>
                  <th className="py-2.5 px-3 text-right">Mines</th>
                  <th className="py-2.5 px-3">Recommended Coords</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actual Outcome</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {pageItems.map((sig) => (
                  <tr key={sig.id}>
                    <td className="py-2.5 pr-3 font-semibold text-[#F4F7FC] whitespace-nowrap">
                      {sig.id}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[#91A0B5]">
                      {sig.windowLabel ?? 'Previous 7 Hours'}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {sig.trapsCount}
                    </td>
                    <td className="py-2.5 px-3 text-[#00D98B] font-medium">
                      {formatCoordList(sig.recommendedIndices)}
                    </td>
                    <td className="py-2.5 px-3 text-[#91A0B5] tabular-nums whitespace-nowrap">
                      {new Date(sig.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">
                      {sig.revealedSafeIndices.length === 0 &&
                      sig.revealedMineIndices.length === 0
                        ? 'Not recorded'
                        : `${sig.revealedSafeIndices.length} Safe / ${sig.revealedMineIndices.length} Mine`}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {sig.status}
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onInspectSignal(sig.id, false)}
                          className="p-1.5 rounded hover:bg-white/10"
                          title="Inspect on Analyzer"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onInspectSignal(sig.id, true)}
                          className="p-1.5 rounded text-[#38BDF8] hover:bg-[#38BDF8]/15"
                          title="Record Actual Result"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSignal(sig.id)}
                          className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] text-xs text-[#91A0B5]">
            <span className="tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- 4. Performance Dashboard ---------------- */

export function PerformanceDashboardView({
  signals,
  onGenerateSignal,
}: {
  signals: SignalRecord[];
  onGenerateSignal: () => void;
}) {
  const metrics = useMemo(() => computePerformanceMetrics(signals), [signals]);
  const empiricalMatrix = useMemo(
    () => computeEmpiricalTileMatrix(signals),
    [signals]
  );
  const [perfVersion, setPerfVersion] = useState(0);
  const perf = useMemo(
    () => performanceMonitor.getSnapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perfVersion, signals.length]
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-[#91A0B5]">Total Signals</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">
            {metrics.totalSignals}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-[#91A0B5]">Evaluated Rounds</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">
            {metrics.evaluatedRounds}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-[#91A0B5]">Safe Picks</div>
          <div className="mt-1.5 text-2xl font-bold text-[#00D98B] tabular-nums">
            {metrics.correctRecommendations}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-[#91A0B5]">Mine Hits</div>
          <div className="mt-1.5 text-2xl font-bold text-rose-400 tabular-nums">
            {metrics.incorrectRecommendations}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-[#91A0B5]">Measured Safe Rate</div>
          <div className="mt-1.5 text-2xl font-bold text-[#38BDF8] tabular-nums">
            {metrics.measuredSafeRatePct === null
              ? '—'
              : `${metrics.measuredSafeRatePct}%`}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 glass-panel rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F4F7FC] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
              <span>7-Hour Window Summary</span>
            </h2>
            <span className="text-xs text-[#91A0B5] tabular-nums">
              Coverage:{' '}
              {metrics.evaluationCoveragePct === null
                ? '—'
                : `${metrics.evaluationCoveragePct}%`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
              <div className="text-[10px] text-[#91A0B5]">7h Signals</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-[#F4F7FC]">
                {metrics.sevenHourSignals}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
              <div className="text-[10px] text-[#91A0B5]">7h Evaluated</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-[#F4F7FC]">
                {metrics.sevenHourEvaluatedRounds}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
              <div className="text-[10px] text-[#91A0B5]">7h Accuracy</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-[#00D98B]">
                {metrics.sevenHourAccuracyPct === null
                  ? '—'
                  : `${metrics.sevenHourAccuracyPct}%`}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 text-xs flex items-center justify-between">
            <span className="text-[#91A0B5]">Theoretical Baseline Avg</span>
            <span className="font-bold text-[#38BDF8] tabular-nums">
              {metrics.theoreticalAvgSingleSafePct === null
                ? '—'
                : `${metrics.theoreticalAvgSingleSafePct}%`}
            </span>
          </div>
        </section>

        <section className="lg:col-span-6 glass-panel rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="text-base font-bold text-[#F4F7FC] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
            <span>Performance by Mine Configuration</span>
          </h2>
          {metrics.byTrapConfig.length === 0 ? (
            <div className="py-4 text-xs text-[#91A0B5] flex items-center justify-between">
              <span>No mine configurations recorded yet.</span>
              <button
                type="button"
                onClick={onGenerateSignal}
                className="px-3 py-1.5 rounded-lg bg-[#00D98B] text-[#050A12] font-bold"
              >
                Generate
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#91A0B5]">
                    <th className="py-2 pr-3">Mines</th>
                    <th className="py-2 px-3 text-right">Signals</th>
                    <th className="py-2 px-3 text-right">Safe / Mine</th>
                    <th className="py-2 px-3 text-right">Measured %</th>
                    <th className="py-2 pl-3 text-right">Theoretical %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] tabular-nums">
                  {metrics.byTrapConfig.map((row) => (
                    <tr key={row.trapsCount}>
                      <td className="py-2 pr-3 font-semibold">{row.trapsCount}</td>
                      <td className="py-2 px-3 text-right">{row.signalsCount}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-[#00D98B]">
                          {row.correctRecommendations}
                        </span>{' '}
                        /{' '}
                        <span className="text-rose-400">
                          {row.incorrectRecommendations}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        {row.measuredSafeRatePct === null
                          ? '—'
                          : `${row.measuredSafeRatePct}%`}
                      </td>
                      <td className="py-2 pl-3 text-right text-[#91A0B5]">
                        {row.theoreticalSingleSafePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#F4F7FC]">
          Historical Tile Observation Matrix
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {empiricalMatrix.map((tile) => (
            <div
              key={tile.tileIndex}
              className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-2 text-center"
            >
              <div className="text-[10px] text-[#91A0B5]">{tile.coord}</div>
              <div className="text-xs font-bold text-[#F4F7FC] tabular-nums mt-0.5">
                {tile.empiricalSafeRatePct === null
                  ? '—'
                  : `${tile.empiricalSafeRatePct}%`}
              </div>
              <div className="text-[10px] text-[#91A0B5] tabular-nums">
                {tile.observedSafeCount}S / {tile.observedMineCount}M
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Authentic Runtime Performance Monitor */}
      <section className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#F4F7FC]">
              Measured Runtime Performance
            </h2>
            <p className="text-xs text-[#91A0B5]">
              Live browser timings recorded from Web Performance APIs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPerfVersion((v) => v + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/10"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sample Metrics</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">Initial Load / FCP</div>
            <div className="mt-1 font-bold text-[#F4F7FC] tabular-nums">
              {perf.homepageLoadMs !== null ? `${perf.homepageLoadMs} ms` : '—'}
              {perf.firstContentfulPaintMs !== null
                ? ` / ${perf.firstContentfulPaintMs} ms`
                : ''}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">Dashboard Switch</div>
            <div className="mt-1 font-bold text-[#38BDF8] tabular-nums">
              {perf.dashboardSwitchMs !== null ? `${perf.dashboardSwitchMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">Signal Gen (Math / Total)</div>
            <div className="mt-1 font-bold text-[#00D98B] tabular-nums">
              {perf.lastSignalMathMs !== null ? `${perf.lastSignalMathMs} ms` : '—'} /{' '}
              {perf.lastSignalGenMs !== null ? `${perf.lastSignalGenMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">Board Render</div>
            <div className="mt-1 font-bold text-[#F4F7FC] tabular-nums">
              {perf.lastBoardRenderMs !== null ? `${perf.lastBoardRenderMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">Last / Avg API Time</div>
            <div className="mt-1 font-bold text-[#F4F7FC] tabular-nums">
              {perf.lastApiResponseMs !== null ? `${perf.lastApiResponseMs} ms` : '—'} /{' '}
              {perf.avgApiResponseMs !== null ? `${perf.avgApiResponseMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3">
            <div className="text-[11px] text-[#91A0B5]">JS Errors</div>
            <div
              className={`mt-1 font-bold tabular-nums ${
                perf.jsErrorCount > 0 ? 'text-rose-400' : 'text-[#00D98B]'
              }`}
            >
              {perf.jsErrorCount}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 col-span-2">
            <div className="text-[11px] text-[#91A0B5]">Browser JS Heap</div>
            <div className="mt-1 font-bold text-[#F4F7FC] tabular-nums">
              {perf.usedJsHeapMb !== null
                ? `${perf.usedJsHeapMb} MB${
                    perf.jsHeapLimitMb ? ` / ${perf.jsHeapLimitMb} MB` : ''
                  }`
                : 'Not exposed by this browser'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------- 5. Settings View ---------------- */

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsModuleView({
  settings,
  signals,
  onUpdateSettings,
  onClearAllData,
}: {
  settings: UserSettings;
  signals: SignalRecord[];
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onClearAllData: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
        <h2 className="text-lg font-bold text-[#F4F7FC] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
          <span>Analyzer & Notification Settings</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-eng" className="text-xs text-[#91A0B5]">
              Analysis Engine
            </label>
            <select
              id="s-eng"
              value={settings.analysisEngineMode}
              onChange={(e) =>
                onUpdateSettings({
                  analysisEngineMode: e.target.value as AnalysisEngineMode,
                })
              }
              className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs font-semibold text-[#F4F7FC]"
            >
              <option value="ai_assisted">AI-Assisted (Gemini)</option>
              <option value="combinatorial_only">Combinatorial Math Only</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-mode" className="text-xs text-[#91A0B5]">
              Signal Generation Mode
            </label>
            <select
              id="s-mode"
              value={settings.generationMode}
              onChange={(e) =>
                onUpdateSettings({
                  generationMode: e.target.value as GenerationMode,
                })
              }
              className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs font-semibold text-[#F4F7FC]"
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic Refresh</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-window" className="text-xs text-[#91A0B5]">
              Analysis Window
            </label>
            <select
              id="s-window"
              value={String(settings.analysisWindow)}
              onChange={(e) => {
                const raw = e.target.value;
                onUpdateSettings({
                  analysisWindow:
                    raw === '7h' ? '7h' : (Number(raw) as AnalysisWindowSetting),
                });
              }}
              className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs font-semibold text-[#F4F7FC]"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-interval" className="text-xs text-[#91A0B5]">
              Auto-Refresh Interval (sec)
            </label>
            <input
              id="s-interval"
              type="number"
              min={5}
              max={300}
              value={settings.signalRefreshIntervalSec}
              onChange={(e) =>
                onUpdateSettings({
                  signalRefreshIntervalSec: Math.max(
                    5,
                    Math.min(300, Number(e.target.value) || 30)
                  ),
                })
              }
              className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs font-semibold text-[#F4F7FC]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
          <div>
            <div className="text-sm font-medium text-[#F4F7FC]">
              Sound Notifications
            </div>
            <p className="text-xs text-[#91A0B5]">
              Acoustic feedback when signals are generated or evaluated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => playSignalGeneratedSound(true)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-[#F4F7FC]"
            >
              Test
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ soundEnabled: !settings.soundEnabled })
              }
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D98B]/35 bg-[#00D98B]/10 text-[#00D98B]"
            >
              {settings.soundEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
          <div>
            <div className="text-sm font-medium text-[#F4F7FC]">
              Show Tile Baseline %
            </div>
            <p className="text-xs text-[#91A0B5]">
              Display combinatorial percentages inside grid tiles.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                showTileProbabilities: !settings.showTileProbabilities,
              })
            }
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/15 text-[#F4F7FC]"
          >
            {settings.showTileProbabilities ? 'Visible' : 'Hidden'}
          </button>
        </div>
      </section>

      <section className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[#F4F7FC]">
          Local History & Export
        </h2>
        <p className="text-xs text-[#91A0B5] tabular-nums">
          {signals.length} signal records stored in browser storage.
        </p>

        <button
          type="button"
          disabled={signals.length === 0}
          onClick={() =>
            downloadTextFile(
              exportSignalsAsJson(signals),
              `mines-bot-signals-${new Date().toISOString().slice(0, 10)}.json`,
              'application/json'
            )
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 hover:border-[#00D98B]/40 text-xs font-semibold disabled:opacity-40"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Export JSON</span>
        </button>

        <button
          type="button"
          disabled={signals.length === 0}
          onClick={() =>
            downloadTextFile(
              exportSignalsAsCsv(signals),
              `mines-bot-signals-${new Date().toISOString().slice(0, 10)}.csv`,
              'text/csv'
            )
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 hover:border-[#00D98B]/40 text-xs font-semibold disabled:opacity-40"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Export CSV</span>
        </button>

        {!confirmClear ? (
          <button
            type="button"
            disabled={signals.length === 0}
            onClick={() => setConfirmClear(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs font-semibold disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Clear Local History</span>
          </button>
        ) : (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 flex flex-col gap-2">
            <p className="text-xs">Delete all {signals.length} local records?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAllData();
                  setConfirmClear(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 rounded-lg text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
