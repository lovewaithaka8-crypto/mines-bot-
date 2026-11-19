import type {
  AnalysisWindowSetting,
  EmpiricalTileStats,
  PerformanceMetrics,
  SignalRecord,
  TrapConfigPerformance,
} from '../types/mines.ts';
import { calcSingleTileSafety, indexToCoord } from './probabilityModule.ts';

export const SEVEN_HOURS_MS = 7 * 60 * 60 * 1000;

export function filterLastSevenHours(
  signals: SignalRecord[],
  nowMs = Date.now()
): SignalRecord[] {
  const cutoff = nowMs - SEVEN_HOURS_MS;
  return signals.filter((sig) => {
    const ts = Date.parse(sig.timestamp);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

export function sliceRoundsForWindow(
  signals: SignalRecord[],
  analysisWindow: AnalysisWindowSetting
): SignalRecord[] {
  if (analysisWindow === '7h') {
    return filterLastSevenHours(signals);
  }
  if (!analysisWindow || analysisWindow <= 0) return signals;
  return signals.slice(0, analysisWindow);
}

export function formatWindowLabel(analysisWindow: AnalysisWindowSetting): string {
  if (analysisWindow === '7h') return 'Previous 7 Hours';
  if (analysisWindow === 0) return 'All Stored Rounds';
  return `Last ${analysisWindow} Rounds`;
}

export function computeEmpiricalTileMatrix(
  signals: SignalRecord[]
): EmpiricalTileStats[] {
  const safeCounts = new Array<number>(25).fill(0);
  const mineCounts = new Array<number>(25).fill(0);

  for (const sig of signals) {
    for (const idx of sig.revealedSafeIndices) {
      if (idx >= 0 && idx < 25) safeCounts[idx] += 1;
    }
    for (const idx of sig.revealedMineIndices) {
      if (idx >= 0 && idx < 25) mineCounts[idx] += 1;
    }
  }

  return Array.from({ length: 25 }, (_, tileIndex) => {
    const safe = safeCounts[tileIndex];
    const mine = mineCounts[tileIndex];
    const total = safe + mine;
    return {
      tileIndex,
      coord: indexToCoord(tileIndex),
      observedSafeCount: safe,
      observedMineCount: mine,
      empiricalSafeRatePct:
        total > 0 ? Number(((safe / total) * 100).toFixed(1)) : null,
    };
  });
}

export function computePerformanceMetrics(
  signals: SignalRecord[]
): PerformanceMetrics {
  let evaluatedRounds = 0;
  let pendingRounds = 0;
  let correctRecommendations = 0;
  let incorrectRecommendations = 0;
  let singleSafeSum = 0;

  const trapMap = new Map<
    number,
    {
      signalsCount: number;
      evaluatedRounds: number;
      correct: number;
      incorrect: number;
    }
  >();

  for (const sig of signals) {
    singleSafeSum += sig.theoreticalSingleSafePct;

    const trapBucket = trapMap.get(sig.trapsCount) ?? {
      signalsCount: 0,
      evaluatedRounds: 0,
      correct: 0,
      incorrect: 0,
    };
    trapBucket.signalsCount += 1;

    const hasOutcome =
      sig.revealedSafeIndices.length > 0 || sig.revealedMineIndices.length > 0;

    if (hasOutcome) {
      evaluatedRounds += 1;
      trapBucket.evaluatedRounds += 1;

      const recSet = new Set(sig.recommendedIndices);
      let roundCorrect = 0;
      let roundIncorrect = 0;

      for (const safeIdx of sig.revealedSafeIndices) {
        if (recSet.has(safeIdx)) roundCorrect += 1;
      }
      for (const mineIdx of sig.revealedMineIndices) {
        if (recSet.has(mineIdx)) roundIncorrect += 1;
      }

      correctRecommendations += roundCorrect;
      incorrectRecommendations += roundIncorrect;
      trapBucket.correct += roundCorrect;
      trapBucket.incorrect += roundIncorrect;
    } else if (sig.status === 'Active') {
      pendingRounds += 1;
    }

    trapMap.set(sig.trapsCount, trapBucket);
  }

  const totalEvaluatedPicks = correctRecommendations + incorrectRecommendations;
  const measuredSafeRatePct =
    totalEvaluatedPicks > 0
      ? Number(((correctRecommendations / totalEvaluatedPicks) * 100).toFixed(2))
      : null;
  const evaluationCoveragePct =
    signals.length > 0
      ? Number(((evaluatedRounds / signals.length) * 100).toFixed(1))
      : null;

  // Previous 7-hour verified window metrics
  const sevenHourList = filterLastSevenHours(signals);
  let sevenHourEvaluatedRounds = 0;
  let sevenHourCorrect = 0;
  let sevenHourIncorrect = 0;
  for (const sig of sevenHourList) {
    const hasOutcome =
      sig.revealedSafeIndices.length > 0 || sig.revealedMineIndices.length > 0;
    if (!hasOutcome) continue;
    sevenHourEvaluatedRounds += 1;
    const recSet = new Set(sig.recommendedIndices);
    for (const safeIdx of sig.revealedSafeIndices) {
      if (recSet.has(safeIdx)) sevenHourCorrect += 1;
    }
    for (const mineIdx of sig.revealedMineIndices) {
      if (recSet.has(mineIdx)) sevenHourIncorrect += 1;
    }
  }
  const sevenHourDenom = sevenHourCorrect + sevenHourIncorrect;
  const sevenHourAccuracyPct =
    sevenHourDenom > 0
      ? Number(((sevenHourCorrect / sevenHourDenom) * 100).toFixed(2))
      : null;

  const byTrapConfig: TrapConfigPerformance[] = Array.from(trapMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([trapsCount, b]) => {
      const denom = b.correct + b.incorrect;
      return {
        trapsCount,
        signalsCount: b.signalsCount,
        evaluatedRounds: b.evaluatedRounds,
        correctRecommendations: b.correct,
        incorrectRecommendations: b.incorrect,
        measuredSafeRatePct:
          denom > 0 ? Number(((b.correct / denom) * 100).toFixed(2)) : null,
        theoreticalSingleSafePct: calcSingleTileSafety(trapsCount),
      };
    });

  return {
    totalSignals: signals.length,
    evaluatedRounds,
    pendingRounds,
    evaluationCoveragePct,
    correctRecommendations,
    incorrectRecommendations,
    totalEvaluatedPicks,
    measuredSafeRatePct,
    theoreticalAvgSingleSafePct:
      signals.length > 0
        ? Number((singleSafeSum / signals.length).toFixed(2))
        : null,
    sevenHourSignals: sevenHourList.length,
    sevenHourEvaluatedRounds,
    sevenHourAccuracyPct,
    byTrapConfig,
    lastTenSignals: signals.slice(0, 10),
  };
}
