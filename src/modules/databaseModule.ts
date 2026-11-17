import type {
  PlatformConfigsMap,
  PlatformId,
  SignalRecord,
  UserSettings,
} from '../types/mines.ts';
import {
  fetchJsonWithOptimization,
  invalidateNetworkCache,
} from '../services/networkClient.ts';

const SETTINGS_KEY = 'universal_mines_settings_prod_v1';
const PLATFORM_CONFIGS_KEY = 'universal_mines_platform_configs_prod_v1';
const SIGNALS_KEY = 'universal_mines_signals_prod_v1';

export const DEFAULT_SETTINGS: UserSettings = {
  selectedPlatform: 'onewin',
  trapsByPlatform: {
    bgr8: 3,
    onewin: 3,
  },
  recommendedCount: 4,
  roundsToAnalyse: 25,
  generationMode: 'manual',
  signalRefreshIntervalSec: 15,
  theme: 'navy',
  soundEnabled: true,
  showTileProbabilities: true,
  analysisEngineMode: 'ai_assisted',
};

export const DEFAULT_PLATFORM_CONFIGS: PlatformConfigsMap = {
  bgr8: {
    platform: 'bgr8',
    gameUrl: '',
    apiEndpoint: '',
    integrationMode: 'manual_observation',
    pollIntervalSec: 15,
    publicSessionId: '',
    autoSyncTraps: true,
    autoDetectNewRound: true,
    currentRoundId: '',
    connectionStatus: 'unconfigured',
    connectionNote:
      'Configuration required: enter an authorized BGR8 endpoint or use Manual Observation input.',
    defaultTrapsCount: 3,
  },
  onewin: {
    platform: 'onewin',
    gameUrl: '',
    apiEndpoint: '',
    integrationMode: 'manual_observation',
    pollIntervalSec: 15,
    publicSessionId: '',
    autoSyncTraps: true,
    autoDetectNewRound: true,
    currentRoundId: '',
    connectionStatus: 'unconfigured',
    connectionNote:
      'Configuration required: enter an authorized 1win endpoint or use Manual Observation input.',
    defaultTrapsCount: 3,
  },
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const localMinesRepository = {
  loadSettings(): UserSettings {
    const parsed = safeParse<Partial<UserSettings>>(
      localStorage.getItem(SETTINGS_KEY),
      {}
    );
    const selectedPlatform: PlatformId =
      parsed.selectedPlatform === 'bgr8' ? 'bgr8' : 'onewin';
    const trapsByPlatform = {
      bgr8: Math.max(
        1,
        Math.min(24, Number(parsed.trapsByPlatform?.bgr8 ?? 3))
      ),
      onewin: Math.max(
        1,
        Math.min(24, Number(parsed.trapsByPlatform?.onewin ?? 3))
      ),
    };
    const activeTraps = trapsByPlatform[selectedPlatform];
    const recommendedCount = Math.max(
      1,
      Math.min(25 - activeTraps, Number(parsed.recommendedCount ?? 4))
    );

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      selectedPlatform,
      trapsByPlatform,
      recommendedCount,
    };
  },

  saveSettings(settings: UserSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  loadPlatformConfigs(): PlatformConfigsMap {
    const parsed = safeParse<Partial<PlatformConfigsMap>>(
      localStorage.getItem(PLATFORM_CONFIGS_KEY),
      {}
    );
    return {
      bgr8: { ...DEFAULT_PLATFORM_CONFIGS.bgr8, ...(parsed.bgr8 ?? {}) },
      onewin: { ...DEFAULT_PLATFORM_CONFIGS.onewin, ...(parsed.onewin ?? {}) },
    };
  },

  savePlatformConfigs(configs: PlatformConfigsMap): void {
    localStorage.setItem(PLATFORM_CONFIGS_KEY, JSON.stringify(configs));
  },

  loadSignals(): SignalRecord[] {
    const parsed = safeParse<SignalRecord[]>(
      localStorage.getItem(SIGNALS_KEY),
      []
    );
    return Array.isArray(parsed) ? parsed : [];
  },

  saveSignals(signals: SignalRecord[]): void {
    localStorage.setItem(SIGNALS_KEY, JSON.stringify(signals));
  },

  clearSignals(): void {
    localStorage.removeItem(SIGNALS_KEY);
  },
};

export async function syncSignalToBackend(signal: SignalRecord): Promise<void> {
  try {
    await fetchJsonWithOptimization('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
      timeoutMs: 5000,
      retries: 1,
    });
    invalidateNetworkCache('GET:/api/signals');
  } catch {
    // Browser local storage retains record even if network call fails
  }
}

export async function syncOutcomeToBackend(
  signalId: string,
  revealedSafeIndices: number[],
  revealedMineIndices: number[],
  status: string
): Promise<void> {
  try {
    await fetchJsonWithOptimization(
      `/api/signals/${encodeURIComponent(signalId)}/outcome`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revealedSafeIndices,
          revealedMineIndices,
          status,
        }),
        timeoutMs: 5000,
        retries: 1,
      }
    );
    invalidateNetworkCache('GET:/api/signals');
  } catch {
    // Local storage remains updated
  }
}

export async function deleteSignalOnBackend(signalId: string): Promise<void> {
  try {
    await fetchJsonWithOptimization(
      `/api/signals/${encodeURIComponent(signalId)}`,
      {
        method: 'DELETE',
        timeoutMs: 5000,
      }
    );
    invalidateNetworkCache('GET:/api/signals');
  } catch {
    // Non-blocking
  }
}

export async function clearSignalsOnBackend(): Promise<void> {
  try {
    await fetchJsonWithOptimization('/api/signals', {
      method: 'DELETE',
      timeoutMs: 5000,
    });
    invalidateNetworkCache('GET:/api/signals');
  } catch {
    // Non-blocking
  }
}

export function exportSignalsAsJson(signals: SignalRecord[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      platform: 'Universal Mines AI (BGR8 + 1win)',
      signalsCount: signals.length,
      signals,
    },
    null,
    2
  );
}

export function exportSignalsAsCsv(signals: SignalRecord[]): string {
  const headers = [
    'Signal ID',
    'Platform',
    'Timestamp',
    'Traps',
    'Recommended Path',
    'Uncertain Tiles',
    'Theoretical Single Safe %',
    'Theoretical Joint Survival %',
    'Risk Level',
    'Status',
    'Revealed Safe',
    'Revealed Mines',
    'Engine Mode',
  ];

  const escapeCell = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = signals.map((s) =>
    [
      s.id,
      s.platform,
      s.timestamp,
      s.trapsCount,
      s.safePath.map((p) => p.label).join(' -> '),
      s.uncertainIndices.join('|'),
      s.theoreticalSingleSafePct,
      s.theoreticalJointSurvivalPct,
      s.riskLevel,
      s.status,
      s.revealedSafeIndices.join('|'),
      s.revealedMineIndices.join('|'),
      s.engineMode,
    ]
      .map(escapeCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
