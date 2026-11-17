import { useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Link2,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  LockKeyhole,
  Trash2,
  ClipboardCheck,
  Eye,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import type {
  AnalysisEngineMode,
  GenerationMode,
  IntegrationMode,
  PlatformConfigsMap,
  PlatformId,
  PlatformIntegrationConfig,
  SignalRecord,
  UserSettings,
} from '../types/mines.ts';
import type { WorkspacePage } from '../components/PublicHomepage.tsx';
import {
  calcJointSurvivalProbability,
  calcSingleTileSafety,
  classifyRisk,
  formatCoordList,
} from './probabilityModule.ts';
import {
  computeEmpiricalTileMatrix,
  computePerformanceMetrics,
} from './performanceTrackingModule.ts';
import {
  getPlatformMeta,
  parsePlatformSnapshot,
  probePlatformConnection,
  validatePlatformUrl,
  type PlatformProbeResult,
} from './platformBridgeModule.ts';
import {
  exportSignalsAsJson,
  exportSignalsAsCsv,
} from './databaseModule.ts';
import { playSignalGeneratedSound } from '../services/soundEffects.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

/* ---------------- 1. Overview Page ---------------- */

export function OverviewView({
  signals,
  platformConfigs,
  selectedPlatform,
  onNavigate,
}: {
  signals: SignalRecord[];
  platformConfigs: PlatformConfigsMap;
  selectedPlatform: PlatformId;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const metrics = useMemo(() => computePerformanceMetrics(signals), [signals]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-5">
          <div className="text-xs text-[#9BB2D8]">Total Stored Signals</div>
          <div className="mt-1.5 text-2xl font-bold text-[#F3F7FF] tabular-nums">
            {metrics.totalSignals}
          </div>
          <div className="mt-1 text-xs text-[#9BB2D8] tabular-nums">
            {metrics.evaluatedRounds} evaluated · {metrics.pendingRounds} active
          </div>
        </div>

        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-5">
          <div className="text-xs text-[#9BB2D8]">Measured Performance</div>
          <div className="mt-1.5 text-2xl font-bold text-[#32C5E8] tabular-nums">
            {metrics.measuredSafeRatePct === null
              ? '—'
              : `${metrics.measuredSafeRatePct}%`}
          </div>
          <div className="mt-1 text-xs text-[#9BB2D8]">
            {metrics.totalEvaluatedPicks === 0
              ? 'No verified outcomes recorded yet'
              : `${metrics.correctRecommendations} safe / ${metrics.incorrectRecommendations} mine`}
          </div>
        </div>

        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-5">
          <div className="text-xs text-[#9BB2D8]">BGR8 Integration</div>
          <div className="mt-1.5 text-base font-bold text-[#F3F7FF]">
            {platformConfigs.bgr8.connectionStatus === 'verified'
              ? 'Endpoint Verified'
              : platformConfigs.bgr8.connectionStatus === 'unreachable'
                ? 'Unreachable'
                : 'Configuration Required'}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('bgr8')}
            className="mt-2 text-xs text-[#32C5E8] font-semibold hover:underline"
          >
            Configure BGR8 →
          </button>
        </div>

        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-5">
          <div className="text-xs text-[#9BB2D8]">1win Integration</div>
          <div className="mt-1.5 text-base font-bold text-[#F3F7FF]">
            {platformConfigs.onewin.connectionStatus === 'verified'
              ? 'Endpoint Verified'
              : platformConfigs.onewin.connectionStatus === 'unreachable'
                ? 'Unreachable'
                : 'Configuration Required'}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('onewin')}
            className="mt-2 text-xs text-[#32C5E8] font-semibold hover:underline"
          >
            Configure 1win →
          </button>
        </div>
      </section>

      <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#F3F7FF]">
            Active Workspace Platform:{' '}
            <span className="text-[#32C5E8]">
              {selectedPlatform === 'onewin' ? '1win Mines' : 'BGR8 Mines'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#9BB2D8] mt-1">
            Open the interactive 5 × 5 Mines Analyzer to configure traps, generate signals, and record verified round outcomes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('analyzer')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#087AFF] hover:bg-blue-500 text-white text-xs font-semibold"
          >
            <span>Open Mines Analyzer</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('generate')}
            className="px-4 py-2.5 rounded-xl border border-[#32C5E8]/35 text-[#F3F7FF] text-xs font-semibold hover:border-[#32C5E8]"
          >
            Generate Signals
          </button>
        </div>
      </section>
    </div>
  );
}

/* ---------------- 2. Analyzer / Signal Control Panel ---------------- */

export function SignalControlPanel({
  settings,
  platformConfig,
  activeSignal,
  isAnalyzing,
  apiError,
  onSelectPlatform,
  onUpdateSettings,
  onUpdateTraps,
  onGenerateSignal,
  onRefreshAnalysis,
  onClearBoard,
  onDismissError,
}: {
  settings: UserSettings;
  platformConfig: PlatformIntegrationConfig;
  activeSignal: SignalRecord | null;
  isAnalyzing: boolean;
  apiError: string | null;
  onSelectPlatform: (p: PlatformId) => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onUpdateTraps: (traps: number) => void;
  onGenerateSignal: () => void;
  onRefreshAnalysis: () => void;
  onClearBoard: () => void;
  onDismissError: () => void;
}) {
  const platform = settings.selectedPlatform;
  const trapsCount = settings.trapsByPlatform[platform];
  const maxSafe = 25 - trapsCount;
  const clampedRec = Math.min(settings.recommendedCount, maxSafe);
  const presets = platform === 'onewin' ? [1, 3, 5, 7] : [1, 3, 5, 10, 15, 20];

  const singleSafe = calcSingleTileSafety(trapsCount);
  const jointSurvival = calcJointSurvivalProbability(trapsCount, clampedRec);
  const riskTier = classifyRisk(trapsCount, clampedRec, jointSurvival);

  return (
    <aside className="surface-panel rounded-2xl border border-[#32C5E8]/25 p-5 flex flex-col gap-4">
      {/* Platform Selector */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#9BB2D8]">
          Select Platform
        </span>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#080F20] border border-[#32C5E8]/20">
          <button
            type="button"
            onClick={() => onSelectPlatform('onewin')}
            className={`py-2 rounded-lg text-xs font-bold transition-colors ${
              platform === 'onewin'
                ? 'bg-[#087AFF] text-white'
                : 'text-[#9BB2D8] hover:text-white'
            }`}
          >
            1win Mines
          </button>
          <button
            type="button"
            onClick={() => onSelectPlatform('bgr8')}
            className={`py-2 rounded-lg text-xs font-bold transition-colors ${
              platform === 'bgr8'
                ? 'bg-orange-500 text-white'
                : 'text-[#9BB2D8] hover:text-white'
            }`}
          >
            BGR8 Mines
          </button>
        </div>
        <div className="text-[11px] text-[#9BB2D8]">
          Integration:{' '}
          <span className="text-[#F3F7FF]">
            {platformConfig.connectionStatus === 'verified'
              ? 'Endpoint Verified'
              : 'Manual / Local Observation'}
          </span>
        </div>
      </div>

      {/* Mine / Trap Count */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="ctrl-traps" className="text-[#9BB2D8] font-medium">
            Number of Mines (1–24)
          </label>
          <span className="font-bold text-[#F3F7FF] tabular-nums">
            {trapsCount} {trapsCount === 1 ? 'Mine' : 'Mines'}
          </span>
        </div>
        <select
          id="ctrl-traps"
          value={trapsCount}
          onChange={(e) => onUpdateTraps(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-sm font-semibold text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
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
              onClick={() => onUpdateTraps(p)}
              className={`flex-1 min-w-[36px] py-1.5 rounded-lg border text-xs font-bold ${
                trapsCount === p
                  ? 'border-[#32C5E8] bg-[#32C5E8]/20 text-[#32C5E8]'
                  : 'border-[#32C5E8]/20 text-[#9BB2D8] hover:border-[#32C5E8]/50'
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
          <label htmlFor="ctrl-rec-count" className="text-[#9BB2D8] font-medium">
            Recommended Tiles (1–{maxSafe})
          </label>
          <span className="font-bold text-[#16A765] tabular-nums">
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
          className="w-full accent-[#087AFF] cursor-pointer"
        />
      </div>

      {/* Rounds Window & Engine Mode */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <label htmlFor="ctrl-win" className="text-[#9BB2D8]">
            History Window
          </label>
          <select
            id="ctrl-win"
            value={settings.roundsToAnalyse}
            onChange={(e) =>
              onUpdateSettings({ roundsToAnalyse: Number(e.target.value) })
            }
            className="px-2.5 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF]"
          >
            <option value={10}>Last 10</option>
            <option value={25}>Last 25</option>
            <option value={50}>Last 50</option>
            <option value={0}>All Rounds</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ctrl-eng" className="text-[#9BB2D8]">
            Engine Mode
          </label>
          <select
            id="ctrl-eng"
            value={settings.analysisEngineMode}
            onChange={(e) =>
              onUpdateSettings({
                analysisEngineMode: e.target.value as AnalysisEngineMode,
              })
            }
            className="px-2.5 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF]"
          >
            <option value="ai_assisted">AI (Gemini)</option>
            <option value="combinatorial_only">Math Only</option>
          </select>
        </div>
      </div>

      {/* Theoretical Confidence Summary */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-2.5 text-center text-xs">
        <div>
          <div className="text-[10px] text-[#9BB2D8]">Single Safe</div>
          <div className="font-bold text-[#F3F7FF] tabular-nums">{singleSafe}%</div>
        </div>
        <div className="border-x border-[#32C5E8]/15">
          <div className="text-[10px] text-[#9BB2D8]">Path Odds</div>
          <div className="font-bold text-[#F3F7FF] tabular-nums">
            {jointSurvival}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#9BB2D8]">Risk Tier</div>
          <div
            className={`font-bold text-[11px] ${
              riskTier === 'LOW RISK'
                ? 'text-[#16A765]'
                : riskTier === 'MEDIUM RISK'
                  ? 'text-orange-400'
                  : 'text-[#D93646]'
            }`}
          >
            {riskTier}
          </div>
        </div>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-xl border border-[#D93646]/50 bg-[#D93646]/15 p-3 text-xs text-red-200 flex flex-col gap-2"
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
            className="self-start px-2.5 py-1 rounded bg-[#D93646]/25 font-semibold"
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
        className="w-full py-3 px-4 rounded-xl bg-[#087AFF] hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-950/40"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Analysing...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Generate Signal</span>
          </>
        )}
      </button>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={onRefreshAnalysis}
          disabled={isAnalyzing}
          className="py-2 px-3 rounded-xl border border-[#32C5E8]/35 bg-[#32C5E8]/10 text-[#F3F7FF] font-semibold flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#32C5E8]" aria-hidden="true" />
          <span>Refresh Analysis</span>
        </button>
        <button
          type="button"
          onClick={onClearBoard}
          className="py-2 px-3 rounded-xl border border-[#32C5E8]/20 text-[#9BB2D8] hover:text-white font-semibold"
        >
          Clear Board
        </button>
      </div>

      {/* Active Signal Metadata */}
      {activeSignal && (
        <div className="pt-3 border-t border-[#32C5E8]/15 flex flex-col gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#9BB2D8]">Signal Reference</span>
            <span className="font-semibold text-[#32C5E8]">{activeSignal.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9BB2D8]">Evaluation Status</span>
            <span className="font-semibold text-[#16A765]">{activeSignal.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9BB2D8]">Timestamp</span>
            <span className="tabular-nums text-[#F3F7FF]">
              {new Date(activeSignal.timestamp).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#9BB2D8] shrink-0">Recommended</span>
            <span className="font-semibold text-[#16A765] text-right">
              {formatCoordList(activeSignal.recommendedIndices)}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------------- 3. Independent Platform Integration View ---------------- */

export function SinglePlatformIntegrationView({
  platform,
  config,
  onSaveConfig,
  onSyncSnapshot,
}: {
  platform: PlatformId;
  config: PlatformIntegrationConfig;
  onSaveConfig: (next: PlatformIntegrationConfig) => void;
  onSyncSnapshot: (
    roundId: string,
    trapsCount: number,
    revealedSafe: number[],
    revealedMines: number[]
  ) => void;
}) {
  const meta = getPlatformMeta(platform);
  const [snapshotJson, setSnapshotJson] = useState(
    platform === 'onewin'
      ? '{"roundId":"1WIN-101","trapsCount":3,"revealedSafeIndices":[2,8]}'
      : '{"roundId":"BGR8-101","trapsCount":3,"revealedSafeIndices":[1,7]}'
  );
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<PlatformProbeResult | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleProbe(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (config.gameUrl.trim()) {
      const check = validatePlatformUrl(platform, config.gameUrl);
      if (!check.valid) {
        setErrorMsg(check.reason || 'Invalid URL.');
        return;
      }
    }
    setIsProbing(true);
    try {
      const result = await probePlatformConnection(platform, config);
      setProbeResult(result);
      onSaveConfig({
        ...config,
        lastCheckedAt: result.checkedAt,
        connectionStatus: result.reachable
          ? 'verified'
          : result.validUrl
            ? 'unreachable'
            : 'unconfigured',
        connectionNote: result.message,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Probe failed.');
    } finally {
      setIsProbing(false);
    }
  }

  function handleSync() {
    setSnapshotMsg(null);
    const parsed = parsePlatformSnapshot(platform, snapshotJson);
    if (parsed.error || !parsed.snapshot) {
      setSnapshotMsg(parsed.error || 'Unable to parse snapshot.');
      return;
    }
    const snap = parsed.snapshot;
    onSaveConfig({
      ...config,
      lastDetectedRoundId: config.currentRoundId,
      currentRoundId: snap.roundId,
    });
    onSyncSnapshot(
      snap.roundId,
      snap.trapsCount,
      snap.revealedSafeIndices,
      snap.revealedMineIndices
    );
    setSnapshotMsg(
      `Synchronized ${meta.name} round ${snap.roundId} (${snap.trapsCount} mines).`
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-7 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 sm:p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-[#F3F7FF]">
            {meta.name} Independent Integration
          </h2>
          <p className="text-xs text-[#9BB2D8] mt-1">
            Module: <code className="text-[#32C5E8]">/integrations/{platform === 'bgr8' ? 'bgr8.js' : 'onewin.js'}</code> · Separate configuration and history from other platforms.
          </p>
        </div>

        <form onSubmit={handleProbe} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                { id: 'manual_observation', label: 'Manual Board Entry' },
                { id: 'authorized_api', label: 'Authorized API Endpoint' },
              ] as Array<{ id: IntegrationMode; label: string }>
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSaveConfig({ ...config, integrationMode: m.id })}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left ${
                  config.integrationMode === m.id
                    ? 'border-[#32C5E8] bg-[#32C5E8]/15 text-[#F3F7FF]'
                    : 'border-[#32C5E8]/20 text-[#9BB2D8]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`url-${platform}`} className="text-xs font-medium text-[#9BB2D8]">
              {meta.name} Game URL
            </label>
            <input
              id={`url-${platform}`}
              type="url"
              placeholder={meta.defaultGameUrl}
              value={config.gameUrl}
              onChange={(e) => onSaveConfig({ ...config, gameUrl: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`api-${platform}`} className="text-xs font-medium text-[#9BB2D8]">
              Authorized API Endpoint (Requires Platform Credentials / Public Feed)
            </label>
            <input
              id={`api-${platform}`}
              type="url"
              placeholder="https://api.example.com/v1/mines/state"
              value={config.apiEndpoint}
              onChange={(e) =>
                onSaveConfig({ ...config, apiEndpoint: e.target.value })
              }
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-red-200 bg-[#D93646]/15 border border-[#D93646]/40 rounded-xl px-3 py-2">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isProbing}
            className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#087AFF] hover:bg-blue-500 text-white text-xs font-bold"
          >
            {isProbing ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Verify {meta.name} Connection</span>
          </button>
        </form>

        <div className="pt-4 border-t border-[#32C5E8]/15 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-[#F3F7FF]">
            Visible Board / Manual Game Information Entry
          </h3>
          <textarea
            rows={3}
            value={snapshotJson}
            onChange={(e) => setSnapshotJson(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] font-mono text-xs text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSync}
              className="px-3.5 py-2 rounded-xl bg-[#16A765] hover:bg-emerald-500 text-[#080F20] text-xs font-bold"
            >
              Synchronize {meta.name} Visible State
            </button>
            {snapshotMsg && (
              <span className="text-xs text-[#16A765] font-medium">
                {snapshotMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="lg:col-span-5 flex flex-col gap-5">
        <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#F3F7FF]">
              Connection Status
            </h3>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              {config.connectionStatus === 'verified' ? (
                <CheckCircle2 className="w-4 h-4 text-[#16A765]" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 text-[#9BB2D8]" aria-hidden="true" />
              )}
              {config.connectionStatus === 'verified'
                ? 'VERIFIED'
                : config.connectionStatus === 'unreachable'
                  ? 'UNREACHABLE'
                  : 'CONFIG REQUIRED'}
            </span>
          </div>
          <p className="text-xs text-[#9BB2D8] leading-relaxed">
            {probeResult?.message || config.connectionNote}
          </p>
        </section>

        <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#F3F7FF]">
            <LockKeyhole className="w-4 h-4 text-[#32C5E8]" aria-hidden="true" />
            <span>Authorization & Compliance</span>
          </div>
          <ul className="text-xs text-[#9BB2D8] space-y-2">
            <li className="flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-[#32C5E8] shrink-0 mt-0.5" aria-hidden="true" />
              <span>Never fabricates successful API connections when credentials or endpoints are absent.</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-[#32C5E8] shrink-0 mt-0.5" aria-hidden="true" />
              <span>Never accesses hidden server-side mines or bypasses platform authentication.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ---------------- 4. Signal History with Search, Filtering & Pagination ---------------- */

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
  const [platformFilter, setPlatformFilter] = useState<'all' | PlatformId>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Evaluated'>('all');
  const [page, setPage] = useState(1);

  const { filtered, totalPages, safePage, pageItems } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = signals.filter((sig) => {
      if (platformFilter !== 'all' && sig.platform !== platformFilter) return false;
      if (statusFilter === 'Active' && sig.status !== 'Active') return false;
      if (statusFilter === 'Evaluated' && sig.status === 'Active') return false;
      if (q) {
        const coords = formatCoordList(sig.recommendedIndices).toLowerCase();
        return (
          sig.id.toLowerCase().includes(q) ||
          coords.includes(q) ||
          sig.platform.includes(q)
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
  }, [signals, platformFilter, statusFilter, search, page]);

  return (
    <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#F3F7FF]">Signal History</h2>
          <p className="text-xs text-[#9BB2D8] tabular-nums">
            {filtered.length} matching records ({signals.length} total stored)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-[#9BB2D8] absolute left-3 top-1/2 -translate-y-1/2"
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
              className="pl-8 pr-3 py-1.5 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-xs text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
            />
          </div>

          <select
            aria-label="Filter by platform"
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value as 'all' | PlatformId);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-xs text-[#F3F7FF]"
          >
            <option value="all">All Platforms</option>
            <option value="onewin">1win Mines</option>
            <option value="bgr8">BGR8 Mines</option>
          </select>

          <select
            aria-label="Filter by evaluation status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'Active' | 'Evaluated');
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-xs text-[#F3F7FF]"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active (Pending)</option>
            <option value="Evaluated">Evaluated</option>
          </select>
        </div>
      </div>

      {pageItems.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#9BB2D8]">
          No signal records found. Generate signals in the Mines Analyzer to populate history.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#32C5E8]/15 text-[#9BB2D8]">
                  <th className="py-2.5 pr-3">Reference</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3 text-right">Mines</th>
                  <th className="py-2.5 px-3">Recommended Coords</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actual Outcome</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#32C5E8]/10">
                {pageItems.map((sig) => (
                  <tr key={sig.id}>
                    <td className="py-2.5 pr-3 font-semibold text-[#F3F7FF] whitespace-nowrap">
                      {sig.id}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[#9BB2D8]">
                      {sig.platform === 'onewin' ? '1win Mines' : 'BGR8 Mines'}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {sig.trapsCount}
                    </td>
                    <td className="py-2.5 px-3 text-[#16A765] font-medium">
                      {formatCoordList(sig.recommendedIndices)}
                    </td>
                    <td className="py-2.5 px-3 text-[#9BB2D8] tabular-nums whitespace-nowrap">
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
                          className="p-1.5 rounded text-[#32C5E8] hover:bg-[#32C5E8]/15"
                          title="Record Actual Result"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSignal(sig.id)}
                          className="p-1.5 rounded text-[#D93646] hover:bg-[#D93646]/15"
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
          <div className="flex items-center justify-between pt-2 border-t border-[#32C5E8]/15 text-xs text-[#9BB2D8]">
            <span className="tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#32C5E8]/25 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#32C5E8]/25 disabled:opacity-40"
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

/* ---------------- 5. Performance Dashboard ---------------- */

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
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
          <div className="text-xs text-[#9BB2D8]">Total Signals</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">
            {metrics.totalSignals}
          </div>
        </div>
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
          <div className="text-xs text-[#9BB2D8]">Evaluated Signals</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">
            {metrics.evaluatedRounds}
          </div>
        </div>
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
          <div className="text-xs text-[#9BB2D8]">Correct Recommendations</div>
          <div className="mt-1.5 text-2xl font-bold text-[#16A765] tabular-nums">
            {metrics.correctRecommendations}
          </div>
        </div>
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
          <div className="text-xs text-[#9BB2D8]">Incorrect Recommendations</div>
          <div className="mt-1.5 text-2xl font-bold text-[#D93646] tabular-nums">
            {metrics.incorrectRecommendations}
          </div>
        </div>
        <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
          <div className="text-xs text-[#9BB2D8]">Measured Performance</div>
          <div className="mt-1.5 text-2xl font-bold text-[#32C5E8] tabular-nums">
            {metrics.measuredSafeRatePct === null
              ? '—'
              : `${metrics.measuredSafeRatePct}%`}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-4">
          <h2 className="text-base font-bold text-[#F3F7FF]">
            Platform Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#32C5E8]/15 text-[#9BB2D8]">
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 px-3 text-right">Signals</th>
                  <th className="py-2 px-3 text-right">Evaluated</th>
                  <th className="py-2 px-3 text-right">Safe / Mine</th>
                  <th className="py-2 pl-3 text-right">Measured %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#32C5E8]/10 tabular-nums">
                {metrics.byPlatform.map((row) => (
                  <tr key={row.platform}>
                    <td className="py-2.5 pr-3 font-semibold">{row.platformName}</td>
                    <td className="py-2.5 px-3 text-right">{row.signalsCount}</td>
                    <td className="py-2.5 px-3 text-right">{row.evaluatedRounds}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[#16A765]">{row.correctRecommendations}</span> /{' '}
                      <span className="text-[#D93646]">{row.incorrectRecommendations}</span>
                    </td>
                    <td className="py-2.5 pl-3 text-right font-bold">
                      {row.measuredSafeRatePct === null
                        ? '—'
                        : `${row.measuredSafeRatePct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-6 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-4">
          <h2 className="text-base font-bold text-[#F3F7FF]">
            Performance by Mine Configuration
          </h2>
          {metrics.byTrapConfig.length === 0 ? (
            <div className="py-4 text-xs text-[#9BB2D8] flex items-center justify-between">
              <span>No mine configurations recorded yet.</span>
              <button
                type="button"
                onClick={onGenerateSignal}
                className="px-3 py-1.5 rounded-lg bg-[#087AFF] text-white font-semibold"
              >
                Generate Signal
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#32C5E8]/15 text-[#9BB2D8]">
                    <th className="py-2 pr-3">Mines</th>
                    <th className="py-2 px-3 text-right">Signals</th>
                    <th className="py-2 px-3 text-right">Safe / Mine</th>
                    <th className="py-2 px-3 text-right">Measured %</th>
                    <th className="py-2 pl-3 text-right">Theoretical %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#32C5E8]/10 tabular-nums">
                  {metrics.byTrapConfig.map((row) => (
                    <tr key={row.trapsCount}>
                      <td className="py-2 pr-3 font-semibold">{row.trapsCount}</td>
                      <td className="py-2 px-3 text-right">{row.signalsCount}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-[#16A765]">{row.correctRecommendations}</span> /{' '}
                        <span className="text-[#D93646]">{row.incorrectRecommendations}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        {row.measuredSafeRatePct === null
                          ? '—'
                          : `${row.measuredSafeRatePct}%`}
                      </td>
                      <td className="py-2 pl-3 text-right text-[#9BB2D8]">
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

      <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#F3F7FF]">
          Historical Tile Observation Matrix
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {empiricalMatrix.map((tile) => (
            <div
              key={tile.tileIndex}
              className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-2 text-center"
            >
              <div className="text-[10px] text-[#9BB2D8]">{tile.coord}</div>
              <div className="text-xs font-bold text-[#F3F7FF] tabular-nums mt-0.5">
                {tile.empiricalSafeRatePct === null
                  ? '—'
                  : `${tile.empiricalSafeRatePct}%`}
              </div>
              <div className="text-[10px] text-[#9BB2D8] tabular-nums">
                {tile.observedSafeCount}S / {tile.observedMineCount}M
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Authentic Runtime Performance Monitor */}
      <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#F3F7FF]">
              Measured Runtime Performance
            </h2>
            <p className="text-xs text-[#9BB2D8]">
              Live browser timings recorded from Web Performance APIs (no simulated numbers).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPerfVersion((v) => v + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#32C5E8]/25 text-xs font-semibold text-[#32C5E8] hover:bg-[#32C5E8]/10"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sample Metrics</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">Initial Load / FCP</div>
            <div className="mt-1 font-bold text-[#F3F7FF] tabular-nums">
              {perf.homepageLoadMs !== null ? `${perf.homepageLoadMs} ms` : '—'}
              {perf.firstContentfulPaintMs !== null
                ? ` / ${perf.firstContentfulPaintMs} ms`
                : ''}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">Dashboard Switch</div>
            <div className="mt-1 font-bold text-[#32C5E8] tabular-nums">
              {perf.dashboardSwitchMs !== null ? `${perf.dashboardSwitchMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">Signal Gen (Math / Total)</div>
            <div className="mt-1 font-bold text-[#16A765] tabular-nums">
              {perf.lastSignalMathMs !== null ? `${perf.lastSignalMathMs} ms` : '—'} /{' '}
              {perf.lastSignalGenMs !== null ? `${perf.lastSignalGenMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">Board Render</div>
            <div className="mt-1 font-bold text-[#F3F7FF] tabular-nums">
              {perf.lastBoardRenderMs !== null ? `${perf.lastBoardRenderMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">Last / Avg API Time</div>
            <div className="mt-1 font-bold text-[#F3F7FF] tabular-nums">
              {perf.lastApiResponseMs !== null ? `${perf.lastApiResponseMs} ms` : '—'} /{' '}
              {perf.avgApiResponseMs !== null ? `${perf.avgApiResponseMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3">
            <div className="text-[11px] text-[#9BB2D8]">JS Errors</div>
            <div
              className={`mt-1 font-bold tabular-nums ${
                perf.jsErrorCount > 0 ? 'text-[#D93646]' : 'text-[#16A765]'
              }`}
            >
              {perf.jsErrorCount}
            </div>
          </div>
          <div className="rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3 col-span-2">
            <div className="text-[11px] text-[#9BB2D8]">Browser JS Heap</div>
            <div className="mt-1 font-bold text-[#F3F7FF] tabular-nums">
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

/* ---------------- 6. Settings View ---------------- */

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
      <section className="lg:col-span-7 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 sm:p-6 flex flex-col gap-5">
        <h2 className="text-lg font-bold text-[#F3F7FF] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#32C5E8]" aria-hidden="true" />
          <span>Analyzer & Notification Settings</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-eng" className="text-xs text-[#9BB2D8]">
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
              className="px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-xs font-semibold text-[#F3F7FF]"
            >
              <option value="ai_assisted">AI-Assisted (Gemini)</option>
              <option value="combinatorial_only">Combinatorial Math Only</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="s-mode" className="text-xs text-[#9BB2D8]">
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
              className="px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-xs font-semibold text-[#F3F7FF]"
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic Refresh</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#32C5E8]/15">
          <div>
            <div className="text-sm font-medium text-[#F3F7FF]">
              Sound Notifications
            </div>
            <p className="text-xs text-[#9BB2D8]">
              Acoustic feedback when signals are generated or evaluated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => playSignalGeneratedSound(true)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-[#32C5E8]/25 text-[#F3F7FF]"
            >
              Test
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ soundEnabled: !settings.soundEnabled })
              }
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#32C5E8]/35 bg-[#32C5E8]/10 text-[#F3F7FF]"
            >
              {settings.soundEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#32C5E8]/15">
          <div>
            <div className="text-sm font-medium text-[#F3F7FF]">
              Show Tile Baseline %
            </div>
            <p className="text-xs text-[#9BB2D8]">
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
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#32C5E8]/35 text-[#F3F7FF]"
          >
            {settings.showTileProbabilities ? 'Visible' : 'Hidden'}
          </button>
        </div>
      </section>

      <section className="lg:col-span-5 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 sm:p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-[#F3F7FF]">
          Local History & Export
        </h2>
        <p className="text-xs text-[#9BB2D8] tabular-nums">
          {signals.length} signal records stored in browser storage.
        </p>

        <button
          type="button"
          disabled={signals.length === 0}
          onClick={() =>
            downloadTextFile(
              exportSignalsAsJson(signals),
              `universal-mines-signals-${new Date().toISOString().slice(0, 10)}.json`,
              'application/json'
            )
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#32C5E8]/25 text-xs font-semibold disabled:opacity-40"
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
              `universal-mines-signals-${new Date().toISOString().slice(0, 10)}.csv`,
              'text/csv'
            )
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#32C5E8]/25 text-xs font-semibold disabled:opacity-40"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Export CSV</span>
        </button>

        {!confirmClear ? (
          <button
            type="button"
            disabled={signals.length === 0}
            onClick={() => setConfirmClear(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#D93646]/40 bg-[#D93646]/10 text-[#D93646] text-xs font-semibold disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Clear Local History</span>
          </button>
        ) : (
          <div className="rounded-xl border border-[#D93646]/40 bg-[#D93646]/10 p-3 flex flex-col gap-2">
            <p className="text-xs">Delete all {signals.length} local records?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAllData();
                  setConfirmClear(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#D93646] text-white text-xs font-bold"
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
