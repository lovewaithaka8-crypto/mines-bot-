import type {
  EmpiricalTileStats,
  PerformanceMetrics,
  PlatformId,
  PlatformPerformance,
  SignalRecord,
  TrapConfigPerformance,
} from '../types/mines.ts';
import { calcSingleTileSafety, indexToCoord } from './probabilityModule.ts';

export function sliceRoundsForWindow(
  signals: SignalRecord[],
  roundsToAnalyse: number
): SignalRecord[] {
  if (!roundsToAnalyse || roundsToAnalyse <= 0) return signals;
  return signals.slice(0, roundsToAnalyse);
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

  const platformBuckets: Record<
    PlatformId,
    {
      signalsCount: number;
      evaluatedRounds: number;
      correct: number;
      incorrect: number;
    }
  > = {
    bgr8: { signalsCount: 0, evaluatedRounds: 0, correct: 0, incorrect: 0 },
    onewin: { signalsCount: 0, evaluatedRounds: 0, correct: 0, incorrect: 0 },
  };

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

    const platBucket = platformBuckets[sig.platform] ?? platformBuckets.onewin;
    platBucket.signalsCount += 1;

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
      platBucket.evaluatedRounds += 1;
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
      platBucket.correct += roundCorrect;
      platBucket.incorrect += roundIncorrect;
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

  const byPlatform: PlatformPerformance[] = (
    ['onewin', 'bgr8'] as PlatformId[]
  ).map((pid) => {
    const b = platformBuckets[pid];
    const denom = b.correct + b.incorrect;
    return {
      platform: pid,
      platformName: pid === 'onewin' ? '1win Mines' : 'BGR8 Mines',
      signalsCount: b.signalsCount,
      evaluatedRounds: b.evaluatedRounds,
      correctRecommendations: b.correct,
      incorrectRecommendations: b.incorrect,
      measuredSafeRatePct:
        denom > 0 ? Number(((b.correct / denom) * 100).toFixed(2)) : null,
    };
  });

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
    correctRecommendations,
    incorrectRecommendations,
    totalEvaluatedPicks,
    measuredSafeRatePct,
    theoreticalAvgSingleSafePct:
      signals.length > 0
        ? Number((singleSafeSum / signals.length).toFixed(2))
        : null,
    byPlatform,
    byTrapConfig,
    lastTenSignals: signals.slice(0, 10),
  };
}
