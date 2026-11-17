import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  PublicHomepage,
  type WorkspacePage,
} from './components/PublicHomepage.tsx';
import type {
  PlatformConfigsMap,
  PlatformId,
  PlatformIntegrationConfig,
  SignalRecord,
  UserSettings,
} from './types/mines.ts';
import { localMinesRepository } from './modules/databaseModule.ts';
import { fetchJsonWithOptimization } from './services/networkClient.ts';
import { performanceMonitor } from './services/performanceMonitor.ts';

const WorkspaceShell = lazy(() => import('./components/WorkspaceShell.tsx'));

function WorkspaceFallback() {
  return (
    <div className="min-h-screen bg-[#080F20] text-[#F3F7FF] flex flex-col">
      <div className="h-16 border-b border-[#32C5E8]/15 bg-[#080F20] px-6 flex items-center justify-between">
        <div className="font-display font-extrabold text-base text-[#F3F7FF]">
          UNIVERSAL MINES AI
        </div>
        <div className="text-xs text-[#9BB2D8]">Loading Workspace...</div>
      </div>
      <div className="flex-1 mx-auto w-full max-w-[1440px] p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="hidden lg:block lg:col-span-2 h-80 rounded-2xl bg-[#10182B] border border-[#32C5E8]/15" />
        <div className="lg:col-span-10 h-96 rounded-2xl bg-[#10182B] border border-[#32C5E8]/15" />
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
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfigsMap>(
    () => localMinesRepository.loadPlatformConfigs()
  );
  const [signals, setSignals] = useState<SignalRecord[]>(() =>
    localMinesRepository.loadSignals()
  );
  const [maintenanceNotice, setMaintenanceNotice] = useState('');

  useEffect(() => {
    const teardownErrors = performanceMonitor.initErrorTracking();
    const controller = new AbortController();

    fetchJsonWithOptimization<{ maintenanceNotice?: string }>(
      '/api/system/status',
      {
        signal: controller.signal,
        timeoutMs: 4000,
        cacheTtlMs: 10000,
      }
    )
      .then(({ ok, data }) => {
        if (ok && data?.maintenanceNotice) {
          setMaintenanceNotice(data.maintenanceNotice);
        }
      })
      .catch(() => {});

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
      if (partial.selectedPlatform) {
        const maxSafe = 25 - next.trapsByPlatform[partial.selectedPlatform];
        next.recommendedCount = Math.min(next.recommendedCount, maxSafe);
      }
      localMinesRepository.saveSettings(next);
      return next;
    });
  }, []);

  const handleUpdateTraps = useCallback((traps: number) => {
    const validTraps = Math.max(1, Math.min(24, traps));
    setSettings((prev) => {
      const pid = prev.selectedPlatform;
      const next: UserSettings = {
        ...prev,
        trapsByPlatform: {
          ...prev.trapsByPlatform,
          [pid]: validTraps,
        },
        recommendedCount: Math.min(prev.recommendedCount, 25 - validTraps),
      };
      localMinesRepository.saveSettings(next);
      return next;
    });
  }, []);

  const handleSavePlatformConfig = useCallback(
    (platform: PlatformId, config: PlatformIntegrationConfig) => {
      setPlatformConfigs((prev) => {
        const next = { ...prev, [platform]: config };
        localMinesRepository.savePlatformConfigs(next);
        return next;
      });
    },
    []
  );

  const openWorkspacePage = useCallback(
    (page: WorkspacePage) => {
      setSwitchStartedAt(
        typeof performance !== 'undefined' ? performance.now() : null
      );
      if (page === 'bgr8' || page === 'onewin') {
        handleUpdateSettings({ selectedPlatform: page });
      }
      setWorkspacePage(page);
      setRouteMode('workspace');
    },
    [handleUpdateSettings]
  );

  if (routeMode === 'home') {
    return (
      <PublicHomepage
        platformConfigs={platformConfigs}
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
        platformConfigs={platformConfigs}
        signals={signals}
        maintenanceNotice={maintenanceNotice}
        switchStartedAt={switchStartedAt}
        onUpdateSettings={handleUpdateSettings}
        onUpdateTraps={handleUpdateTraps}
        onSavePlatformConfig={handleSavePlatformConfig}
        onSignalsChange={setSignals}
      />
    </Suspense>
  );
}
