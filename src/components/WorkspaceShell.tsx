import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  BarChart3,
  Grid,
  History,
  Home,
  LayoutDashboard,
  Settings,
  Shield,
  Sparkles,
  Plane,
  HelpCircle,
  UserRound,
} from 'lucide-react';
import type { WorkspacePage } from './PublicHomepage.tsx';
import { MinesBoardModule } from '../modules/minesBoardModule.tsx';
import {
  OverviewView,
  PerformanceDashboardView,
  SettingsModuleView,
  SignalControlPanel,
  SignalHistoryView,
} from '../modules/interfaceModule.tsx';
import type {
  PlatformConfigsMap,
  PlatformId,
  PlatformIntegrationConfig,
  SignalRecord,
  UserSettings,
} from '../types/mines.ts';
import {
  clearSignalsOnBackend,
  deleteSignalOnBackend,
  localMinesRepository,
  syncOutcomeToBackend,
  syncSignalToBackend,
} from '../modules/databaseModule.ts';
import { generatePlatformSignalAsync } from '../modules/signalGenerationModule.ts';
import { detectNewRound } from '../modules/platformBridgeModule.ts';
import {
  playOutcomeMineSound,
  playOutcomeSafeSound,
  playSignalGeneratedSound,
} from '../services/soundEffects.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

const AdminConsoleView = lazy(() =>
  import('./AdminConsoleView.tsx').then((m) => ({ default: m.AdminConsoleView }))
);

const WORKSPACE_NAV: ReadonlyArray<{
  id: WorkspacePage;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'analyzer', label: 'Mines Analyzer', icon: Grid },
  { id: 'aviator', label: 'Aviator · Coming Soon', icon: Plane },
  { id: 'history', label: 'Round History', icon: History },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help & Guide', icon: HelpCircle },
  { id: 'responsible', label: 'Responsible Play', icon: Shield },
  { id: 'admin', label: 'Administration', icon: UserRound },
];

interface WorkspaceShellProps {
  workspacePage: WorkspacePage;
  onChangePage: (page: WorkspacePage) => void;
  onGoHome: () => void;
  settings: UserSettings;
  platformConfigs: PlatformConfigsMap;
  signals: SignalRecord[];
  maintenanceNotice: string;
  switchStartedAt: number | null;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onUpdateTraps: (traps: number) => void;
  onSavePlatformConfig: (
    platform: PlatformId,
    config: PlatformIntegrationConfig
  ) => void;
  onSignalsChange: React.Dispatch<React.SetStateAction<SignalRecord[]>>;
}

export default function WorkspaceShell({
  workspacePage,
  onChangePage,
  onGoHome,
  settings,
  platformConfigs,
  signals,
  maintenanceNotice,
  switchStartedAt,
  onUpdateSettings,
  onUpdateTraps,
  onSavePlatformConfig,
  onSignalsChange,
}: WorkspaceShellProps) {
  const [activeSignalId, setActiveSignalId] = useState<string | null>(() =>
    signals.length > 0 ? signals[0].id : null
  );
  const [isRecordingOutcome, setIsRecordingOutcome] = useState(false);
  const [recordedOutcome, setRecordedOutcome] = useState<{
    safe: number[];
    mine: number[];
  }>({ safe: [], mine: [] });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden
  );

  const seedCounterRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const isRecordingRef = useRef(false);
  const hasActiveSignalRef = useRef(false);

  const activePlatform = settings.selectedPlatform;
  const activeTraps = settings.trapsByPlatform[activePlatform];
  const activePlatformConfig = platformConfigs[activePlatform];

  const activeSignal = useMemo(
    () => signals.find((s) => s.id === activeSignalId) ?? null,
    [signals, activeSignalId]
  );

  isRecordingRef.current = isRecordingOutcome;
  hasActiveSignalRef.current = activeSignal !== null;

  useEffect(() => {
    if (switchStartedAt !== null && typeof performance !== 'undefined') {
      performanceMonitor.recordDashboardSwitch(
        performance.now() - switchStartedAt
      );
    }
  }, [switchStartedAt]);

  // Pause background automatic polling when tab is hidden
  useEffect(() => {
    const onVisChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  const cancelOngoingRequest = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    inFlightRef.current = false;
  }, []);

  const handleUpdateSettingsWrapped = useCallback(
    (partial: Partial<UserSettings>) => {
      if (
        'selectedPlatform' in partial ||
        'recommendedCount' in partial ||
        'roundsToAnalyse' in partial ||
        'analysisEngineMode' in partial
      ) {
        cancelOngoingRequest();
        setIsAnalyzing(false);
      }
      onUpdateSettings(partial);
    },
    [cancelOngoingRequest, onUpdateSettings]
  );

  const handleUpdateTrapsWrapped = useCallback(
    (traps: number) => {
      cancelOngoingRequest();
      setIsAnalyzing(false);
      onUpdateTraps(traps);
    },
    [cancelOngoingRequest, onUpdateTraps]
  );

  const handleSelectPlatform = useCallback(
    (platform: PlatformId) => {
      if (platform === settings.selectedPlatform) return;
      setIsRecordingOutcome(false);
      handleUpdateSettingsWrapped({ selectedPlatform: platform });
      const matching = signals.find((s) => s.platform === platform);
      setActiveSignalId(matching ? matching.id : null);
    },
    [settings.selectedPlatform, signals, handleUpdateSettingsWrapped]
  );

  const triggerSignalGeneration = useCallback(
    async (forceReplace = false) => {
      if (inFlightRef.current) {
        if (!forceReplace) return;
        cancelOngoingRequest();
      }

      const controller = new AbortController();
      activeAbortRef.current = controller;
      inFlightRef.current = true;
      setIsAnalyzing(true);
      setApiError(null);
      setIsRecordingOutcome(false);
      seedCounterRef.current += 1;

      try {
        const newRecord = await generatePlatformSignalAsync({
          settings,
          platformConfig: platformConfigs[settings.selectedPlatform],
          allSignals: signals,
          seedOffset: seedCounterRef.current,
          abortSignal: controller.signal,
        });

        if (controller.signal.aborted) return;

        onSignalsChange((prev) => {
          const next = [newRecord, ...prev];
          localMinesRepository.saveSignals(next);
          return next;
        });
        void syncSignalToBackend(newRecord);
        setActiveSignalId(newRecord.id);
        playSignalGeneratedSound(settings.soundEnabled);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setApiError(
          err instanceof Error
            ? err.message
            : 'Signal generation encountered an error.'
        );
      } finally {
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
          inFlightRef.current = false;
          setIsAnalyzing(false);
        }
      }
    },
    [
      settings,
      platformConfigs,
      signals,
      cancelOngoingRequest,
      onSignalsChange,
    ]
  );

  // Controlled automatic polling: paused when tab hidden or offline
  useEffect(() => {
    if (settings.generationMode !== 'automatic' || !isPageVisible) return;
    const intervalMs = Math.max(5, settings.signalRefreshIntervalSec) * 1000;
    const timer = window.setInterval(() => {
      if (
        !inFlightRef.current &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      ) {
        void triggerSignalGeneration(false);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    settings.generationMode,
    settings.signalRefreshIntervalSec,
    isPageVisible,
    triggerSignalGeneration,
  ]);

  const evaluateSignalOutcome = useCallback(
    (signalId: string, revealedSafe: number[], revealedMines: number[]) => {
      let hitSuggestedMine = false;
      let nextStatus: SignalRecord['status'] = 'Evaluated: Safe';

      onSignalsChange((prev) => {
        const next = prev.map((sig) => {
          if (sig.id !== signalId) return sig;
          const recSet = new Set(sig.recommendedIndices);
          hitSuggestedMine = revealedMines.some((idx) => recSet.has(idx));
          nextStatus = hitSuggestedMine
            ? 'Evaluated: Mine Revealed'
            : 'Evaluated: Safe';
          return {
            ...sig,
            revealedSafeIndices: revealedSafe,
            revealedMineIndices: revealedMines,
            status: nextStatus,
          };
        });
        localMinesRepository.saveSignals(next);
        return next;
      });

      void syncOutcomeToBackend(
        signalId,
        revealedSafe,
        revealedMines,
        nextStatus
      );

      if (hitSuggestedMine) {
        playOutcomeMineSound(settings.soundEnabled);
      } else {
        playOutcomeSafeSound(settings.soundEnabled);
      }
    },
    [onSignalsChange, settings.soundEnabled]
  );

  // Stable callback identity so clicking a tile ONLY re-renders that tile
  const handleTileInteract = useCallback((index: number) => {
    if (!isRecordingRef.current || !hasActiveSignalRef.current) return;
    setRecordedOutcome((prev) => {
      const inSafe = prev.safe.includes(index);
      const inMine = prev.mine.includes(index);
      if (inSafe) {
        return {
          safe: prev.safe.filter((i) => i !== index),
          mine: [...prev.mine, index],
        };
      }
      if (inMine) {
        return {
          safe: prev.safe,
          mine: prev.mine.filter((i) => i !== index),
        };
      }
      return {
        safe: [...prev.safe, index],
        mine: prev.mine,
      };
    });
  }, []);

  const handleToggleOutcomeRecording = useCallback(
    (enabled: boolean) => {
      setIsRecordingOutcome(enabled);
      if (enabled && activeSignal) {
        setRecordedOutcome({
          safe: activeSignal.revealedSafeIndices ?? [],
          mine: activeSignal.revealedMineIndices ?? [],
        });
      } else {
        setRecordedOutcome({ safe: [], mine: [] });
      }
    },
    [activeSignal]
  );

  const handleClearBoard = useCallback(() => {
    cancelOngoingRequest();
    setIsAnalyzing(false);
    setIsRecordingOutcome(false);
    setRecordedOutcome({ safe: [], mine: [] });
    setActiveSignalId(null);
    setApiError(null);
  }, [cancelOngoingRequest]);

  const handleMarkPathSafe = useCallback(() => {
    if (activeSignal) {
      setRecordedOutcome({
        safe: [...activeSignal.recommendedIndices],
        mine: [],
      });
    }
  }, [activeSignal]);

  const handleSaveOutcome = useCallback(() => {
    if (activeSignal) {
      evaluateSignalOutcome(
        activeSignal.id,
        recordedOutcome.safe,
        recordedOutcome.mine
      );
      handleToggleOutcomeRecording(false);
    }
  }, [
    activeSignal,
    evaluateSignalOutcome,
    recordedOutcome,
    handleToggleOutcomeRecording,
  ]);

  const handleSyncSnapshot = useCallback(
    (
      platform: PlatformId,
      roundId: string,
      trapsCount: number,
      revealedSafe: number[],
      revealedMines: number[]
    ) => {
      const cfg = platformConfigs[platform];
      const isNewRound = detectNewRound(cfg.currentRoundId, roundId);

      if (cfg.autoSyncTraps) {
        onUpdateSettings({
          selectedPlatform: platform,
          trapsByPlatform: {
            ...settings.trapsByPlatform,
            [platform]: trapsCount,
          },
          recommendedCount: Math.min(settings.recommendedCount, 25 - trapsCount),
        });
      }

      if (
        activeSignal &&
        activeSignal.platform === platform &&
        (revealedSafe.length > 0 || revealedMines.length > 0)
      ) {
        evaluateSignalOutcome(activeSignal.id, revealedSafe, revealedMines);
      }

      if (
        isNewRound &&
        cfg.autoDetectNewRound &&
        settings.generationMode === 'automatic'
      ) {
        void triggerSignalGeneration(true);
      }
    },
    [
      platformConfigs,
      settings.trapsByPlatform,
      settings.recommendedCount,
      settings.generationMode,
      activeSignal,
      onUpdateSettings,
      evaluateSignalOutcome,
      triggerSignalGeneration,
    ]
  );

  return (
    <div className="min-h-screen bg-[#050A12] text-[#F3F7FF] flex flex-col">
      {/* Workspace Top Bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-400/15 bg-[#050A12]/95 backdrop-blur-2xl">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onGoHome}
            className="logo text-left text-base sm:text-lg font-extrabold tracking-tight text-[#F3F7FF] whitespace-nowrap shrink-0"
          >
            UNIVERSAL MINES AI
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#8B5CF6]/25 text-xs font-semibold text-[#A7B6CE] hover:text-[#06101D] whitespace-nowrap"
            >
              <Home className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Homepage</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onChangePage('analyzer');
                void triggerSignalGeneration(false);
              }}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00FF88] hover:bg-emerald-400 disabled:opacity-60 text-[#06101D] text-xs font-bold whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isAnalyzing ? 'Analysing...' : 'Generate Signal'}</span>
            </button>
          </div>
        </div>

        {/* Icon-led mobile navigation */}
        <nav aria-label="Workspace mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden items-center justify-between gap-1 border-t border-emerald-400/20 bg-[#080D18]/95 backdrop-blur-2xl px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_36px_rgba(0,255,136,0.08)]">
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            const active = workspacePage === item.id;
            return (
              <button key={item.id} type="button" aria-label={item.label} title={item.label} onClick={() => onChangePage(item.id)}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-semibold transition-all ${
                  active ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/25 shadow-[0_0_18px_rgba(0,255,136,0.13)]' : 'text-slate-400 hover:text-white'
                }`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {maintenanceNotice && (
        <div className="bg-orange-500/15 border-b border-orange-400/30 px-4 py-2 text-center text-xs text-orange-200">
          {maintenanceNotice}
        </div>
      )}

      <div className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Workspace Sidebar */}
        <aside
          aria-label="Dashboard Navigation"
          className="hidden lg:flex lg:col-span-3 xl:col-span-2 rounded-2xl border border-white/[0.06] bg-[#0A111C]/90 backdrop-blur-2xl p-3 flex-col gap-1 sticky top-20 shadow-[0_12px_48px_rgba(0,0,0,0.3)]"
        >
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            const active = workspacePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangePage(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors text-left ${
                  active
                    ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-300/20 shadow-[0_0_20px_rgba(0,255,136,0.14)]'
                    : 'text-[#9BB2D8] hover:bg-white/5 hover:text-[#F3F7FF]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Workspace Content */}
        <main className="lg:col-span-9 xl:col-span-10 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-400/15">
            <div>
              <h1 className="font-display text-xl font-bold text-[#F3F7FF]">
                {WORKSPACE_NAV.find((n) => n.id === workspacePage)?.label}
              </h1>
              <p className="text-xs text-[#9BB2D8]">
                Direct access workspace · Zero fabricated data ·{' '}
                {activePlatform === 'onewin' ? '1win Mines' : 'BGR8 Mines'} selected
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-[#9BB2D8]">
              <Activity className="w-3.5 h-3.5 text-[#00FF88]" aria-hidden="true" />
              <span className="tabular-nums">{signals.length} Signals Stored</span>
            </div>
          </div>

          {workspacePage === 'overview' && (
            <OverviewView
              signals={signals}
              platformConfigs={platformConfigs}
              selectedPlatform={activePlatform}
              onNavigate={onChangePage}
            />
          )}

          {(workspacePage === 'analyzer' || workspacePage === 'generate') && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-4 order-2 xl:order-1">
                <SignalControlPanel
                  settings={settings}
                  platformConfig={activePlatformConfig}
                  activeSignal={activeSignal}
                  isAnalyzing={isAnalyzing}
                  apiError={apiError}
                  onSelectPlatform={handleSelectPlatform}
                  onUpdateSettings={handleUpdateSettingsWrapped}
                  onUpdateTraps={handleUpdateTrapsWrapped}
                  onGenerateSignal={() => void triggerSignalGeneration(false)}
                  onRefreshAnalysis={() => void triggerSignalGeneration(true)}
                  onClearBoard={handleClearBoard}
                  onDismissError={() => setApiError(null)}
                />
              </div>

              <div className="xl:col-span-8 order-1 xl:order-2">
                <MinesBoardModule
                  platform={activePlatform}
                  activeSignal={activeSignal}
                  trapsCount={activeTraps}
                  recommendedCount={settings.recommendedCount}
                  showTileProbabilities={settings.showTileProbabilities}
                  isAnalyzing={isAnalyzing}
                  isRecordingOutcome={isRecordingOutcome}
                  recordedSafeIndices={recordedOutcome.safe}
                  recordedMineIndices={recordedOutcome.mine}
                  onTileInteract={handleTileInteract}
                  onToggleOutcomeRecording={handleToggleOutcomeRecording}
                  onMarkPathSafe={handleMarkPathSafe}
                  onSaveOutcome={handleSaveOutcome}
                  onClearBoard={handleClearBoard}
                />
              </div>
            </div>
          )}

          {workspacePage === 'aviator' && (
            <div className="min-h-[55vh] flex items-center justify-center">
              <section className="relative overflow-hidden w-full max-w-2xl rounded-3xl border border-[#8B5CF6]/35 bg-[#101A2C]/80 backdrop-blur-xl p-8 sm:p-12 text-center shadow-[0_0_45px_rgba(139,92,246,0.12)]">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10"><Plane className="h-8 w-8 text-red-400" /></div>
                <div className="inline-flex rounded-full border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-3 py-1 text-xs font-bold tracking-[0.16em] text-[#C4A5FF]">COMING SOON</div>
                <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">Aviator Intelligence</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#9BB2D8]">The Aviator workspace is not available yet. No predictions or live signals are generated here.</p>
                <button type="button" onClick={() => onChangePage('analyzer')} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#00FF88] px-5 py-3 text-sm font-bold text-[#06101D]">Go to Mines Analyzer <Grid className="h-4 w-4" /></button>
              </section>
            </div>
          )}

          {workspacePage === 'history' && (
            <SignalHistoryView
              signals={signals}
              onInspectSignal={(id, openLog) => {
                const target = signals.find((s) => s.id === id);
                if (target) {
                  handleUpdateSettingsWrapped({
                    selectedPlatform: target.platform,
                  });
                  setActiveSignalId(id);
                  handleToggleOutcomeRecording(openLog);
                  onChangePage('analyzer');
                }
              }}
              onDeleteSignal={(id) => {
                onSignalsChange((prev) => {
                  const next = prev.filter((s) => s.id !== id);
                  localMinesRepository.saveSignals(next);
                  if (activeSignalId === id) {
                    setActiveSignalId(next.length > 0 ? next[0].id : null);
                  }
                  return next;
                });
                void deleteSignalOnBackend(id);
              }}
            />
          )}

          {workspacePage === 'performance' && (
            <PerformanceDashboardView
              signals={signals}
              onGenerateSignal={() => {
                onChangePage('analyzer');
                void triggerSignalGeneration(false);
              }}
            />
          )}

          {workspacePage === 'settings' && (
            <SettingsModuleView
              settings={settings}
              signals={signals}
              onUpdateSettings={handleUpdateSettingsWrapped}
              onClearAllData={() => {
                localMinesRepository.clearSignals();
                onSignalsChange([]);
                setActiveSignalId(null);
                void clearSignalsOnBackend();
              }}
            />
          )}

          {workspacePage === 'admin' && (
            <Suspense
              fallback={
                <div className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-6 text-xs text-[#9BB2D8]">
                  Loading Administration Console...
                </div>
              }
            >
              <AdminConsoleView />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
