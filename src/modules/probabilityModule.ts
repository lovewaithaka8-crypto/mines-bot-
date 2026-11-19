import type { RiskLevel, SafePathStep } from '../types/mines.ts';

const COLS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface MultiplierStep {
  picks: number;
  multiplier: number;
  survivalPct: number;
}

const ROW_COL_25: ReadonlyArray<{ row: number; col: number }> = Array.from(
  { length: 25 },
  (_, i) => ({
    row: Math.floor(i / 5) + 1,
    col: (i % 5) + 1,
  })
);

const COORDS_25: ReadonlyArray<string> = Array.from(
  { length: 25 },
  (_, i) => `${COLS[i % 5]}${Math.floor(i / 5) + 1}`
);

const singleSafetyCache = new Map<number, number>();
const jointProbCache = new Map<string, number>();
const multiplierLadderCache = new Map<number, MultiplierStep[]>();

export function indexToRowCol(index: number): { row: number; col: number } {
  const safeIndex = Math.max(0, Math.min(24, Math.floor(index)));
  return ROW_COL_25[safeIndex];
}

export function indexToCoord(index: number): string {
  const safeIndex = Math.max(0, Math.min(24, Math.floor(index)));
  return COORDS_25[safeIndex];
}

export function formatCoordList(indices: number[]): string {
  return indices.map(indexToCoord).join(', ');
}

export function calcSingleTileSafety(trapsCount: number): number {
  const clamped = Math.max(1, Math.min(24, trapsCount));
  const cached = singleSafetyCache.get(clamped);
  if (cached !== undefined) return cached;
  const val = Number((((25 - clamped) / 25) * 100).toFixed(2));
  singleSafetyCache.set(clamped, val);
  return val;
}

export function calcLiveTrapRiskPct(
  trapsCount: number,
  revealedSafeCount = 0
): number {
  const clampedTraps = Math.max(1, Math.min(24, trapsCount));
  const remainingTiles = Math.max(1, 25 - Math.max(0, revealedSafeCount));
  return Number(Math.min(100, (clampedTraps / remainingTiles) * 100).toFixed(2));
}

export function calcJointSurvivalProbability(
  trapsCount: number,
  picksCount: number
): number {
  const traps = Math.max(1, Math.min(24, trapsCount));
  const maxPicks = 25 - traps;
  const picks = Math.max(1, Math.min(maxPicks, picksCount));
  const cacheKey = `${traps}:${picks}`;

  const cached = jointProbCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let probability = 1;
  for (let i = 0; i < picks; i++) {
    probability *= (25 - traps - i) / (25 - i);
  }
  const result = Number((probability * 100).toFixed(2));
  jointProbCache.set(cacheKey, result);
  return result;
}

export function getMultiplierLadder(trapsCount: number): MultiplierStep[] {
  const traps = Math.max(1, Math.min(24, trapsCount));
  const cached = multiplierLadderCache.get(traps);
  if (cached) return cached;

  const edge = 0.99;
  const maxPicks = 25 - traps;
  const ladder: MultiplierStep[] = [];
  let probability = 1;

  for (let picks = 1; picks <= maxPicks; picks++) {
    probability *= (25 - traps - (picks - 1)) / (25 - (picks - 1));
    const rawMult = edge / probability;
    const multiplier =
      rawMult >= 100 ? Number(rawMult.toFixed(1)) : Number(rawMult.toFixed(2));
    ladder.push({
      picks,
      multiplier,
      survivalPct: Number((probability * 100).toFixed(2)),
    });
  }

  multiplierLadderCache.set(traps, ladder);
  return ladder;
}

export function classifyRisk(
  trapsCount: number,
  picksCount: number,
  jointSurvivalPct: number
): RiskLevel {
  if (jointSurvivalPct >= 55 && trapsCount <= 5 && picksCount <= 5) {
    return 'LOW RISK';
  }
  if (jointSurvivalPct >= 22 && trapsCount <= 12) {
    return 'MEDIUM RISK';
  }
  return 'HIGH RISK';
}

export function buildSafePathSteps(
  orderedIndices: number[],
  tileConfidenceMap: Record<number, number>,
  fallbackSingleSafePct: number
): SafePathStep[] {
  return orderedIndices.map((index, idx) => {
    const { row, col } = indexToRowCol(index);
    return {
      step: idx + 1,
      index,
      row,
      col,
      coord: indexToCoord(index),
      label: `Row ${row} – Column ${col}`,
      theoreticalConfidencePct:
        tileConfidenceMap[index] ?? fallbackSingleSafePct,
    };
  });
}
