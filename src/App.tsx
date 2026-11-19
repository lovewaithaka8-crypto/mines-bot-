import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { PublicHomepage } from './components/PublicHomepage.tsx';
import type { WorkspaceSystemStatus } from './components/WorkspaceShell.tsx';
import type {
  SignalRecord,
  UserSettings,
  WorkspacePage,
} from './types/mines.ts';
import { localMinesRepository } from './modules/databaseModule.ts';
import { fetchJsonWithOptimization } from './services/networkClient.ts';
import { performanceMonitor } from './services/performanceMonitor.ts';

const WorkspaceShell = lazy(() => import('./components/WorkspaceShell.tsx'));

function WorkspaceFallback() {
  return (
    <div className="min-h-screen midnight-workspace-canvas text-[#F4F7FC] flex">
      <div className="hidden lg:flex w-[76px] shrink-0 bg-[#080F1B] border-r border-white/[0.08] flex-col items-center py-4 gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0D1726] border border-white/[0.08]" />
        <div className="w-10 h-10 rounded-xl bg-[#0D1726]/70" />
        <div className="w-10 h-10 rounded-xl bg-[#0D1726]/70" />
        <div className="w-10 h-10 rounded-xl bg-[#0D1726]/70" />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-white/[0.08] bg-[#050A12]/80 px-6 flex items-center justify-between">
          <div className="font-display font-extrabold text-base text-[#F4F7FC]">
            Mines Bot
          </div>
          <div className="text-xs text-[#91A0B5]">Loading Workspace...</div>
        </div>
        <div className="flex-1 mx-auto w-full max-w-[1440px] p-6">
          <div className="h-96 rounded-2xl glass-panel" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [routeMode, setRouteMode] = useState<'home' | 'workspace'>('home');
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>('overview');
  const [switchStartedAt, setSwitchStartedAt] = useState<number | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() =>
    localMinesRepository.loadSettings()
  );
  const [signals, setSignals] = useState<SignalRecord[]>(() =>
    localMinesRepository.loadSignals()
  );
  const [systemStatus, setSystemStatus] = useState<WorkspaceSystemStatus>({
    engineReady: true,
    aiAnalysisEnabled: false,
    adminConfigured: false,
    maintenanceNotice: '',
  });

  useEffect(() => {
    const teardownErrors = performanceMonitor.initErrorTracking();
    const controller = new AbortController();

    fetchJsonWithOptimization<{
      engineReady?: boolean;
      aiAnalysisEnabled?: boolean;
      adminConfigured?: boolean;
      maintenanceNotice?: string;
    }>('/api/system/status', {
      signal: controller.signal,
      timeoutMs: 4000,
      cacheTtlMs: 10000,
    })
      .then(({ ok, data }) => {
        if (ok && data) {
          setSystemStatus({
            engineReady: Boolean(data.engineReady),
            aiAnalysisEnabled: Boolean(data.aiAnalysisEnabled),
            adminConfigured: Boolean(data.adminConfigured),
            maintenanceNotice: data.maintenanceNotice ?? '',
          });
        }
      })
      .catch(() => {
        setSystemStatus((prev) => ({ ...prev, engineReady: false }));
      });

    if (localMinesRepository.loadSignals().length === 0) {
      fetchJsonWithOptimization<{ signals?: SignalRecord[] }>(
        '/api/signals?limit=100&offset=0',
        {
          signal: controller.signal,
          timeoutMs: 5000,
          cacheTtlMs: 5000,
        }
      )
        .then(({ ok, data }) => {
          if (ok && data?.signals && data.signals.length > 0) {
            localMinesRepository.saveSignals(data.signals);
            setSignals(data.signals);
          }
        })
        .catch(() => {});
    }

    return () => {
      controller.abort();
      teardownErrors();
    };
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      const maxSafe = 25 - next.defaultMinesCount;
      next.recommendedCount = Math.max(
        1,
        Math.min(next.recommendedCount, maxSafe)
      );
      localMinesRepository.saveSettings(next);
      return next;
    });
  }, []);

  const openWorkspacePage = useCallback((page: WorkspacePage) => {
    setSwitchStartedAt(
      typeof performance !== 'undefined' ? performance.now() : null
    );
    setWorkspacePage(page);
    setRouteMode('workspace');
  }, []);

  if (routeMode === 'home') {
    return (
      <PublicHomepage
        storedSignalsCount={signals.length}
        onOpenWorkspace={openWorkspacePage}
      />
    );
  }

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <WorkspaceShell
        workspacePage={workspacePage}
        onChangePage={setWorkspacePage}
        onGoHome={() => setRouteMode('home')}
        settings={settings}
        signals={signals}
        systemStatus={systemStatus}
        switchStartedAt={switchStartedAt}
        onUpdateSettings={handleUpdateSettings}
        onSignalsChange={setSignals}
      />
    </Suspense>
  );
}
