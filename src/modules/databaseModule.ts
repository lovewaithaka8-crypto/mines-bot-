import type {
  AnalysisWindowSetting,
  SignalRecord,
  UserSettings,
} from '../types/mines.ts';
import {
  fetchJsonWithOptimization,
  invalidateNetworkCache,
} from '../services/networkClient.ts';

const SETTINGS_KEY = 'universal_mines_settings_prod_v1';
const SIGNALS_KEY = 'universal_mines_signals_prod_v1';

export const DEFAULT_SETTINGS: UserSettings = {
  defaultMinesCount: 3,
  recommendedCount: 4,
  analysisWindow: '7h',
  generationMode: 'manual',
  signalRefreshIntervalSec: 30,
  accentPreference: 'emerald',
  compactLayout: false,
  soundEnabled: true,
  outcomeAlertsEnabled: true,
  autoSyncBackend: true,
  showTileProbabilities: true,
  analysisEngineMode: 'ai_assisted',
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeAnalysisWindow(raw: unknown): AnalysisWindowSetting {
  if (raw === '7h') return '7h';
  if (raw === 10 || raw === 25 || raw === 50 || raw === 0) return raw;
  return '7h';
}

export const localMinesRepository = {
  loadSettings(): UserSettings {
    const parsed = safeParse<
      Partial<UserSettings> & {
        trapsByPlatform?: Record<string, number>;
        roundsToAnalyse?: number;
      }
    >(localStorage.getItem(SETTINGS_KEY), {});

    // Migrate legacy default traps if present without losing user preference
    const legacyTraps =
      parsed.trapsByPlatform?.onewin ?? parsed.trapsByPlatform?.bgr8;
    const defaultMinesCount = Math.max(
      1,
      Math.min(24, Number(parsed.defaultMinesCount ?? legacyTraps ?? 3))
    );

    const recommendedCount = Math.max(
      1,
      Math.min(25 - defaultMinesCount, Number(parsed.recommendedCount ?? 4))
    );

    const analysisWindow = normalizeAnalysisWindow(
      parsed.analysisWindow ?? parsed.roundsToAnalyse
    );

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      defaultMinesCount,
      recommendedCount,
      analysisWindow,
    };
  },

  saveSettings(settings: UserSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
      application: 'Mines Bot',
      signalsCount: signals.length,
      signals,
    },
    null,
    2
  );
}

export function exportSignalsAsCsv(signals: SignalRecord[]): string {
  const headers = [
    'Prediction ID',
    'Timestamp',
    'Mines',
    'Window',
    'Recommended Path',
    'Uncertain Cells',
    'Single Safe %',
    'Joint Survival %',
    'Risk Tier',
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
      s.timestamp,
      s.trapsCount,
      s.windowLabel ?? 'Previous 7 Hours',
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
