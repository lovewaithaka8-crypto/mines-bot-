import type {
  PlatformIntegrationConfig,
  RiskLevel,
  SignalRecord,
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
  sliceRoundsForWindow,
} from './performanceTrackingModule.ts';
import { fetchJsonWithOptimization } from '../services/networkClient.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

/**
 * Computes statistical recommendations (GREEN) and uncertainty warnings (ORANGE).
 * Never labels any unrevealed tile as a confirmed mine (RED is reserved strictly for revealed mines).
 */
export function generateStatisticalCandidates(
  trapsCount: number,
  recommendedCount: number,
  historyWindow: SignalRecord[],
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

  // Lower-ranked tiles are marked ORANGE (uncertain selection warning), never confirmed mines
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
      ? `Analysed 25-tile grid for ${traps} ${traps === 1 ? 'trap' : 'traps'} (${baseSingleSafe}% single-tile safety, ${jointSurvival}% joint path odds). No evaluated rounds recorded yet; recommendations use exact combinatorics and dispersion balancing.`
      : `Evaluated ${evaluatedRounds} historical rounds alongside combinatorics (${baseSingleSafe}% single-tile safety, ${jointSurvival}% path survival). Hidden traps remain memoryless and unknown until legitimately revealed.`;

  const riskNote =
    riskLevel === 'LOW RISK'
      ? `Path survival probability is ${jointSurvival}%. Green tiles indicate lower statistical variance; orange tiles carry elevated uncertainty.`
      : riskLevel === 'MEDIUM RISK'
        ? `Moderate exposure (${jointSurvival}% joint survival across ${picks} steps). Orange tiles carry elevated uncertainty.`
        : `High variance (${jointSurvival}% joint clearance against ${traps} traps). Treat recommended tiles as probabilistic guidance only.`;

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

export function generateSignalId(
  platform: 'bgr8' | 'onewin',
  existingCount: number
): string {
  const prefix = platform === 'onewin' ? '1W' : 'B8';
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const seq = String(existingCount + 1).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${datePart}-${seq}${rand}`;
}

export async function generatePlatformSignalAsync(params: {
  settings: UserSettings;
  platformConfig: PlatformIntegrationConfig;
  allSignals: SignalRecord[];
  seedOffset: number;
  abortSignal: AbortSignal;
}): Promise<SignalRecord> {
  const { settings, platformConfig, allSignals, seedOffset, abortSignal } =
    params;
  const platform = settings.selectedPlatform;
  const trapsCount = settings.trapsByPlatform[platform];

  const platformSignals = allSignals.filter((s) => s.platform === platform);
  const windowSignals = sliceRoundsForWindow(
    platformSignals,
    settings.roundsToAnalyse
  );

  const totalStart =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const mathStart = totalStart;

  const baseline = generateStatisticalCandidates(
    trapsCount,
    settings.recommendedCount,
    windowSignals,
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
    const empiricalHighlights = computeEmpiricalTileMatrix(windowSignals)
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
        platform,
        trapsCount,
        recommendedCount: settings.recommendedCount,
        roundsAnalysedCount: windowSignals.length,
        theoreticalSingleSafePct: baseline.theoreticalSingleSafePct,
        theoreticalJointSurvivalPct: baseline.theoreticalJointSurvivalPct,
        riskLevel: baseline.riskLevel,
        evaluatedRoundsCount: metrics.evaluatedRounds,
        measuredSafeRatePct: metrics.measuredSafeRatePct,
        candidateSafeIndices: baseline.recommendedIndices,
        candidateUncertainIndices: baseline.uncertainIndices,
        empiricalHighlights,
        sourceMode: platformConfig.integrationMode,
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
    id: generateSignalId(platform, allSignals.length),
    platform,
    timestamp: new Date().toISOString(),
    trapsCount,
    recommendedCount: settings.recommendedCount,
    roundsAnalysedCount: windowSignals.length,
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
    sourceMode: platformConfig.integrationMode,
    roundRef: platformConfig.currentRoundId,
  };
}
