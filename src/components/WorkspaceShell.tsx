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
  Bomb,
  ChevronLeft,
  ChevronRight,
  Globe,
  HelpCircle,
  History,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Plane,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type {
  BettingPlatform,
  PlatformConnection,
  SignalRecord,
  SyncedAviatorRound,
  SyncedMinesRound,
  UserSettings,
  WorkspacePage,
} from '../types/mines.ts';
import { MinesBoardModule } from '../modules/minesBoardModule.tsx';
import {
  OverviewView,
  PerformanceDashboardView,
  SettingsModuleView,
  SignalControlPanel,
  SignalHistoryView,
} from '../modules/interfaceModule.tsx';
import { PlatformsView } from './PlatformsView.tsx';
import { AviatorWorkspace } from './AviatorWorkspace.tsx';
import {
  HelpGuideView,
  ResponsiblePlayView,
} from './SecondaryPages.tsx';
import {
  clearSignalsOnBackend,
  deleteSignalOnBackend,
  localMinesRepository,
  syncOutcomeToBackend,
  syncSignalToBackend,
} from '../modules/databaseModule.ts';
import { generateMinesSignalAsync } from '../modules/signalGenerationModule.ts';
import {
  fetchPlatformDirectory,
  fetchSyncedPlatformData,
  fetchUserConnections,
  refreshPlatformConnection,
} from '../services/platformClient.ts';
import {
  playOutcomeMineSound,
  playOutcomeSafeSound,
  playSignalGeneratedSound,
} from '../services/soundEffects.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

const AdminConsoleView = lazy(() =>
  import('./AdminConsoleView.tsx').then((m) => ({
    default: m.AdminConsoleView,
  }))
);

export interface WorkspaceSystemStatus {
  engineReady: boolean;
  aiAnalysisEnabled: boolean;
  adminConfigured: boolean;
  maintenanceNotice: string;
}

const PRIMARY_NAV: ReadonlyArray<{
  id: WorkspacePage;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'analyzer', label: 'Mines', icon: Bomb },
  { id: 'aviator', label: 'Aviator', icon: Plane },
  { id: 'platforms', label: 'Platforms', icon: Globe },
  { id: 'history', label: 'History', icon: History },
];

const SECONDARY_NAV: ReadonlyArray<{
  id: WorkspacePage;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help', icon: HelpCircle },
  { id: 'responsible', label: 'Responsible', icon: ShieldCheck },
  { id: 'admin', label: 'Admin', icon: UserRound },
];

const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

interface WorkspaceShellProps {
  workspacePage: WorkspacePage;
  onChangePage: (page: WorkspacePage) => void;
  onGoHome: () => void;
  settings: UserSettings;
  signals: SignalRecord[];
  systemStatus: WorkspaceSystemStatus;
  switchStartedAt: number | null;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onSignalsChange: React.Dispatch<React.SetStateAction<SignalRecord[]>>;
}

export default function WorkspaceShell({
  workspacePage,
  onChangePage,
  onGoHome,
  settings,
  signals,
  systemStatus,
  switchStartedAt,
  onUpdateSettings,
  onSignalsChange,
}: WorkspaceShellProps) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

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

  // Kenyan platform directory & authorized connections state
  const [platforms, setPlatforms] = useState<BettingPlatform[]>([]);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [syncedMinesRounds, setSyncedMinesRounds] = useState<
    SyncedMinesRound[]
  >([]);
  const [syncedAviatorRounds, setSyncedAviatorRounds] = useState<
    SyncedAviatorRound[]
  >([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [aviatorRefreshing, setAviatorRefreshing] = useState(false);

  const seedCounterRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const isRecordingRef = useRef(false);
  const hasActiveSignalRef = useRef(false);

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

  const loadPlatformsState = useCallback(async () => {
    setPlatformsLoading(true);
    try {
      const [dirRes, connRes, syncRes] = await Promise.all([
        fetchPlatformDirectory(),
        fetchUserConnections(),
        fetchSyncedPlatformData(),
      ]);
      setPlatforms(dirRes.platforms);
      setConnections(connRes);
      setSyncedMinesRounds(syncRes.minesRounds);
      setSyncedAviatorRounds(syncRes.aviatorRounds);
    } catch {
      // Non-blocking fallback when backend directory unavailable
    } finally {
      setPlatformsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlatformsState();
  }, [loadPlatformsState]);

  const handleRefreshAviatorFeeds = useCallback(async () => {
    const aviatorConns = connections.filter(
      (c) => c.selectedGame === 'aviator' && c.connectionStatus === 'Connected'
    );
    if (aviatorConns.length === 0) return;
    setAviatorRefreshing(true);
    try {
      await Promise.all(
        aviatorConns.map((c) => refreshPlatformConnection(c.id))
      );
      await loadPlatformsState();
    } finally {
      setAviatorRefreshing(false);
    }
  }, [connections, loadPlatformsState]);

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
        'defaultMinesCount' in partial ||
        'recommendedCount' in partial ||
        'analysisWindow' in partial ||
        'analysisEngineMode' in partial
      ) {
        cancelOngoingRequest();
        setIsAnalyzing(false);
      }
      onUpdateSettings(partial);
    },
    [cancelOngoingRequest, onUpdateSettings]
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
        const newRecord = await generateMinesSignalAsync({
          trapsCount: settings.defaultMinesCount,
          settings,
          allSignals: signals,
          syncedMinesRounds,
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
      signals,
      syncedMinesRounds,
      cancelOngoingRequest,
      onSignalsChange,
    ]
  );

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

  const connectedPlatformsCount = useMemo(
    () =>
      connections.filter((c) => c.connectionStatus === 'Connected').length,
    [connections]
  );

  const activeNavMeta = ALL_NAV.find((n) => n.id === workspacePage);

  return (
    <div className="min-h-screen midnight-workspace-canvas text-[#F4F7FC] flex">
      {/* Desktop Expandable Compact Icon-Rail Navigation */}
      <aside
        aria-label="Workspace Icon Rail"
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen border-r border-white/[0.08] bg-[#080F1B]/95 backdrop-blur-2xl transition-[width] duration-200 z-30 ${
          railExpanded ? 'w-56' : 'w-[76px]'
        }`}
      >
        <div className="h-16 px-3 flex items-center justify-between border-b border-white/[0.08]">
          <button
            type="button"
            onClick={onGoHome}
            title="Mines Bot Homepage"
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#00D98B]/15 border border-[#00D98B]/40 flex items-center justify-center shrink-0 emerald-icon-glow">
              <Sparkles className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
            </div>
            {railExpanded && (
              <span className="logo text-sm font-extrabold tracking-tight text-[#F4F7FC] truncate">
                Mines Bot
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRailExpanded((v) => !v)}
            aria-label={railExpanded ? 'Collapse rail' : 'Expand rail'}
            title={railExpanded ? 'Collapse' : 'Expand'}
            className="p-1.5 rounded-lg text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-white/5 shrink-0"
          >
            {railExpanded ? (
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = workspacePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => onChangePage(item.id)}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                  railExpanded ? 'justify-start' : 'justify-center'
                } ${
                  active
                    ? 'bg-[#00D98B]/14 text-[#00D98B] border border-[#00D98B]/35 emerald-glow'
                    : 'text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {railExpanded && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          <div className="my-2 border-t border-white/[0.08]" />

          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = workspacePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => onChangePage(item.id)}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                  railExpanded ? 'justify-start' : 'justify-center'
                } ${
                  active
                    ? 'bg-[#00D98B]/14 text-[#00D98B] border border-[#00D98B]/35 emerald-glow'
                    : 'text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {railExpanded && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-2.5 border-t border-white/[0.08]">
          <button
            type="button"
            title="Public Homepage"
            onClick={onGoHome}
            className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-white/5 ${
              railExpanded ? 'justify-start' : 'justify-center'
            }`}
          >
            <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
            {railExpanded && <span>Home</span>}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Bar */}
        <header className="sticky top-0 z-20 h-16 border-b border-white/[0.08] bg-[#050A12]/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onGoHome}
              className="lg:hidden inline-flex items-center gap-2 font-display font-extrabold text-sm text-[#F4F7FC]"
            >
              <Sparkles className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
              <span>Mines Bot</span>
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-[#F4F7FC] truncate">
              {activeNavMeta?.label ?? 'Workspace'}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#91A0B5] px-2.5 py-1 rounded-lg border border-white/[0.08] bg-[#0A111C]">
              <Activity className="w-3.5 h-3.5 text-[#00D98B]" aria-hidden="true" />
              <span className="tabular-nums">{signals.length} Signals</span>
            </div>

            <button
              type="button"
              onClick={() => {
                onChangePage('analyzer');
                void triggerSignalGeneration(false);
              }}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] disabled:opacity-60 text-[#050A12] text-xs font-bold emerald-glow transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isAnalyzing ? 'Analysing...' : 'Generate'}</span>
            </button>
          </div>
        </header>

        {systemStatus.maintenanceNotice && (
          <div className="bg-amber-500/15 border-b border-amber-400/30 px-4 py-2 text-center text-xs text-amber-200">
            {systemStatus.maintenanceNotice}
          </div>
        )}

        {/* Workspace Content */}
        <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-8">
          {workspacePage === 'overview' && (
            <OverviewView
              signals={signals}
              connectedPlatformsCount={connectedPlatformsCount}
              onNavigate={onChangePage}
            />
          )}

          {workspacePage === 'analyzer' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-4 order-2 xl:order-1">
                <SignalControlPanel
                  settings={settings}
                  activeSignal={activeSignal}
                  isAnalyzing={isAnalyzing}
                  apiError={apiError}
                  syncedMinesRoundsCount={syncedMinesRounds.length}
                  onUpdateSettings={handleUpdateSettingsWrapped}
                  onGenerateSignal={() => void triggerSignalGeneration(false)}
                  onRefreshAnalysis={() => void triggerSignalGeneration(true)}
                  onClearBoard={handleClearBoard}
                  onDismissError={() => setApiError(null)}
                  onOpenPlatforms={() => onChangePage('platforms')}
                />
              </div>

              <div className="xl:col-span-8 order-1 xl:order-2">
                <MinesBoardModule
                  activeSignal={activeSignal}
                  trapsCount={settings.defaultMinesCount}
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
            <AviatorWorkspace
              aviatorRounds={syncedAviatorRounds}
              connections={connections}
              refreshing={aviatorRefreshing}
              onRefreshFeeds={handleRefreshAviatorFeeds}
              onNavigate={onChangePage}
            />
          )}

          {workspacePage === 'platforms' && (
            <PlatformsView
              platforms={platforms}
              connections={connections}
              loading={platformsLoading}
              onRefreshAll={loadPlatformsState}
              onNavigate={onChangePage}
            />
          )}

          {workspacePage === 'history' && (
            <SignalHistoryView
              signals={signals}
              onInspectSignal={(id, openLog) => {
                const target = signals.find((s) => s.id === id);
                if (target) {
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

          {workspacePage === 'help' && (
            <HelpGuideView onNavigate={onChangePage} />
          )}

          {workspacePage === 'responsible' && (
            <ResponsiblePlayView onNavigate={onChangePage} />
          )}

          {workspacePage === 'admin' && (
            <Suspense
              fallback={
                <div className="glass-panel rounded-2xl p-6 text-xs text-[#91A0B5]">
                  Loading Administration Console...
                </div>
              }
            >
              <AdminConsoleView />
            </Suspense>
          )}
        </main>
      </div>

      {/* Mobile Floating Bottom Navigation */}
      <nav
        aria-label="Mobile workspace navigation"
        className="fixed bottom-3 left-3 right-3 z-40 lg:hidden rounded-2xl border border-[#00D98B]/25 bg-[#080F1B]/95 backdrop-blur-2xl px-1.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] flex items-center justify-around gap-1"
      >
        {PRIMARY_NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = workspacePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                onChangePage(item.id);
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-[#00D98B]/15 text-[#00D98B]'
                  : 'text-[#91A0B5] hover:text-[#F4F7FC]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-[10px] font-semibold transition-colors ${
            mobileMoreOpen ||
            workspacePage === 'history' ||
            SECONDARY_NAV.some((s) => s.id === workspacePage)
              ? 'bg-[#8B5CF6]/20 text-[#C4B5FD]'
              : 'text-[#91A0B5] hover:text-[#F4F7FC]'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Drawer */}
      {mobileMoreOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/70 backdrop-blur-sm flex items-end p-3"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full rounded-2xl border border-white/15 bg-[#0A111C] p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#F4F7FC]">
                More Navigation
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close menu"
                className="p-1 rounded-lg text-[#91A0B5] hover:text-[#F4F7FC]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'history' as WorkspacePage, label: 'History', icon: History }, ...SECONDARY_NAV].map(
                (item) => {
                  const Icon = item.icon;
                  const active = workspacePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMobileMoreOpen(false);
                        onChangePage(item.id);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-[11px] font-semibold ${
                        active
                          ? 'border-[#00D98B]/50 bg-[#00D98B]/15 text-[#00D98B]'
                          : 'border-white/10 bg-[#050A12] text-[#91A0B5]'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                }
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  onGoHome();
                }}
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-white/10 bg-[#050A12] text-[#91A0B5] text-[11px] font-semibold"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                <span>Homepage</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
