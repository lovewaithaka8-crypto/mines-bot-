import type {
  RiskLevel,
  SignalRecord,
  SyncedMinesRound,
  UserSettings,
} from '../types/mines.ts';
import {
  buildSafePathSteps,
  calcJointSurvivalProbability,
  calcSingleTileSafety,
  classifyRisk,
} from './probabilityModule.ts';
import {
  computeEmpiricalTileMatrix,
  computePerformanceMetrics,
  formatWindowLabel,
  sliceRoundsForWindow,
} from './performanceTrackingModule.ts';
import { fetchJsonWithOptimization } from '../services/networkClient.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

/**
 * Computes statistical recommendations (GREEN) and uncertainty warnings (AMBER).
 * Clearly separates observed historical frequency from estimated future probability
 * and never claims guaranteed outcomes on independent random rounds.
 */
export function generateStatisticalCandidates(
  trapsCount: number,
  recommendedCount: number,
  historyWindow: SignalRecord[],
  windowLabel = 'Previous 7 Hours',
  seedOffset = 0
): {
  recommendedIndices: number[];
  uncertainIndices: number[];
  tileConfidenceMap: Record<number, number>;
  theoreticalSingleSafePct: number;
  theoreticalJointSurvivalPct: number;
  riskLevel: RiskLevel;
  summary: string;
  riskNote: string;
} {
  const traps = Math.max(1, Math.min(24, trapsCount));
  const picks = Math.max(1, Math.min(25 - traps, recommendedCount));
  const baseSingleSafe = calcSingleTileSafety(traps);
  const jointSurvival = calcJointSurvivalProbability(traps, picks);
  const riskLevel = classifyRisk(traps, picks, jointSurvival);
  const empirical = computeEmpiricalTileMatrix(historyWindow);

  const evaluatedRounds = historyWindow.filter(
    (s) => s.revealedSafeIndices.length > 0 || s.revealedMineIndices.length > 0
  ).length;

  const entropyBase =
    Date.now() +
    historyWindow.length * 997 +
    traps * 131 +
    picks * 37 +
    seedOffset;

  const scoredTiles = empirical.map((tile) => {
    const row = Math.floor(tile.tileIndex / 5);
    const col = tile.tileIndex % 5;

    let empiricalShift = 0;
    const totalObs = tile.observedSafeCount + tile.observedMineCount;
    if (totalObs > 0 && tile.empiricalSafeRatePct !== null) {
      const sampleWeight = Math.min(1, totalObs / 15);
      const diffFromBase = tile.empiricalSafeRatePct - baseSingleSafe;
      empiricalShift = Math.max(
        -2.5,
        Math.min(2.5, diffFromBase * 0.08 * sampleWeight)
      );
    }

    const hash =
      Math.sin(
        entropyBase * 0.001 +
          tile.tileIndex * 12.9898 +
          row * 78.233 +
          col * 43.12
      ) * 43758.5453;
    const fractional = hash - Math.floor(hash);
    const dispersionTieBreak = (fractional - 0.5) * 1.4;

    const theoreticalConfidence = Number(
      Math.max(1, Math.min(99, baseSingleSafe + empiricalShift)).toFixed(2)
    );

    return {
      index: tile.tileIndex,
      sortScore: theoreticalConfidence + dispersionTieBreak,
      theoreticalConfidence,
    };
  });

  const sortedBestFirst = [...scoredTiles].sort(
    (a, b) => b.sortScore - a.sortScore
  );
  const recommendedIndices = sortedBestFirst
    .slice(0, picks)
    .map((t) => t.index);

  const remaining = sortedBestFirst.slice(picks);
  const uncertainCount = Math.min(
    Math.max(2, Math.min(traps, remaining.length)),
    remaining.length
  );
  const uncertainIndices = remaining
    .slice(remaining.length - uncertainCount)
    .map((t) => t.index)
    .sort((a, b) => a - b);

  const tileConfidenceMap: Record<number, number> = {};
  for (const item of scoredTiles) {
    tileConfidenceMap[item.index] = item.theoreticalConfidence;
  }

  const summary =
    evaluatedRounds === 0
      ? `Analysed 25-cell grid for ${traps} ${traps === 1 ? 'mine' : 'mines'} (${baseSingleSafe}% single-cell safety, ${jointSurvival}% joint path odds). 0 verified rounds found in ${windowLabel}; estimate relies on exact combinatorics.`
      : `Compared ${evaluatedRounds} verified rounds in ${windowLabel} against theoretical combinatorics (${baseSingleSafe}% baseline safety, ${jointSurvival}% ${picks}-step survival). Past frequency does not alter independent future RNG.`;

  const riskNote =
    riskLevel === 'LOW RISK'
      ? `Estimated ${picks}-step clearance probability is ${jointSurvival}%. Statistical estimates cannot guarantee future random outcomes.`
      : riskLevel === 'MEDIUM RISK'
        ? `Moderate exposure (${jointSurvival}% joint survival across ${picks} picks). Treat highlighted cells as probabilistic estimates only.`
        : `High variance (${jointSurvival}% joint survival against ${traps} mines). Independent random rounds carry substantial risk of hitting a mine.`;

  return {
    recommendedIndices,
    uncertainIndices,
    tileConfidenceMap,
    theoreticalSingleSafePct: baseSingleSafe,
    theoreticalJointSurvivalPct: jointSurvival,
    riskLevel,
    summary,
    riskNote,
  };
}

export function generatePredictionId(existingCount: number): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const seq = String(existingCount + 1).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `MB-${datePart}-${seq}${rand}`;
}

export async function generateMinesSignalAsync(params: {
  trapsCount: number;
  settings: UserSettings;
  allSignals: SignalRecord[];
  syncedMinesRounds?: SyncedMinesRound[];
  seedOffset: number;
  abortSignal: AbortSignal;
}): Promise<SignalRecord> {
  const {
    trapsCount,
    settings,
    allSignals,
    syncedMinesRounds = [],
    seedOffset,
    abortSignal,
  } = params;
  const windowSignals = sliceRoundsForWindow(allSignals, settings.analysisWindow);
  const windowLabel = formatWindowLabel(settings.analysisWindow);

  // Convert verified synced external platform Mines rounds into read-only empirical window observations
  const syncedAsObservations: SignalRecord[] = syncedMinesRounds.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    trapsCount: r.minesCount,
    recommendedCount: 1,
    roundsAnalysedCount: 1,
    windowLabel,
    recommendedIndices: [],
    uncertainIndices: [],
    safePath: [],
    tileConfidenceMap: {},
    theoreticalSingleSafePct: 0,
    theoreticalJointSurvivalPct: 0,
    riskLevel: 'MEDIUM RISK',
    status: r.revealedMineIndices.length > 0 ? 'Evaluated: Mine Revealed' : 'Evaluated: Safe',
    revealedSafeIndices: r.revealedSafeIndices,
    revealedMineIndices: r.revealedMineIndices,
    engineMode: settings.analysisEngineMode,
    aiSummary: '',
    riskNote: '',
  }));

  const combinedEmpiricalWindow =
    syncedAsObservations.length > 0
      ? [...windowSignals, ...syncedAsObservations]
      : windowSignals;

  const totalStart =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const mathStart = totalStart;

  const baseline = generateStatisticalCandidates(
    trapsCount,
    settings.recommendedCount,
    combinedEmpiricalWindow,
    windowLabel,
    seedOffset
  );

  const mathMs =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
    mathStart;

  let finalRecommended = baseline.recommendedIndices;
  let finalUncertain = baseline.uncertainIndices;
  let finalSummary = baseline.summary;
  let finalRiskNote = baseline.riskNote;

  if (settings.analysisEngineMode === 'ai_assisted') {
    const metrics = computePerformanceMetrics(windowSignals);
    const empiricalHighlights = computeEmpiricalTileMatrix(
      combinedEmpiricalWindow
    )
      .filter((t) => t.observedSafeCount > 0 || t.observedMineCount > 0)
      .map((t) => ({
        coord: t.coord,
        observedSafe: t.observedSafeCount,
        observedMine: t.observedMineCount,
      }));

    const { ok, status, data } = await fetchJsonWithOptimization<{
      recommendedIndices?: number[];
      uncertainIndices?: number[];
      aiSummary?: string;
      riskNote?: string;
      error?: string;
    }>('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      timeoutMs: 12000,
      retries: 1,
      retryDelayMs: 300,
      body: JSON.stringify({
        trapsCount,
        recommendedCount: settings.recommendedCount,
        roundsAnalysedCount: combinedEmpiricalWindow.length,
        windowLabel,
        theoreticalSingleSafePct: baseline.theoreticalSingleSafePct,
        theoreticalJointSurvivalPct: baseline.theoreticalJointSurvivalPct,
        riskLevel: baseline.riskLevel,
        evaluatedRoundsCount: metrics.evaluatedRounds,
        measuredSafeRatePct: metrics.measuredSafeRatePct,
        candidateSafeIndices: baseline.recommendedIndices,
        candidateUncertainIndices: baseline.uncertainIndices,
        empiricalHighlights,
      }),
    });

    if (!ok) {
      throw new Error(
        data.error || `AI analysis request failed (${status}).`
      );
    }

    if (
      Array.isArray(data.recommendedIndices) &&
      data.recommendedIndices.length > 0
    ) {
      finalRecommended = data.recommendedIndices;
    }
    if (Array.isArray(data.uncertainIndices)) {
      finalUncertain = data.uncertainIndices;
    }
    if (data.aiSummary) finalSummary = data.aiSummary;
    if (data.riskNote) finalRiskNote = data.riskNote;
  }

  const safePath = buildSafePathSteps(
    finalRecommended,
    baseline.tileConfidenceMap,
    baseline.theoreticalSingleSafePct
  );

  const totalMs =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
    totalStart;
  performanceMonitor.recordSignalGeneration(totalMs, mathMs);

  return {
    id: generatePredictionId(allSignals.length),
    timestamp: new Date().toISOString(),
    trapsCount,
    recommendedCount: settings.recommendedCount,
    roundsAnalysedCount: combinedEmpiricalWindow.length,
    windowLabel,
    recommendedIndices: finalRecommended,
    uncertainIndices: finalUncertain,
    safePath,
    tileConfidenceMap: baseline.tileConfidenceMap,
    theoreticalSingleSafePct: baseline.theoreticalSingleSafePct,
    theoreticalJointSurvivalPct: baseline.theoreticalJointSurvivalPct,
    riskLevel: baseline.riskLevel,
    status: 'Active',
    revealedSafeIndices: [],
    revealedMineIndices: [],
    engineMode: settings.analysisEngineMode,
    aiSummary: finalSummary,
    riskNote: finalRiskNote,
  };
}
