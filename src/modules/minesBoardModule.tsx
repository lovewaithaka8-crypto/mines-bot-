import { memo, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Bomb,
  CheckCircle2,
  ClipboardCheck,
  Sparkles,
  Route,
} from 'lucide-react';
import type {
  PlatformId,
  SignalRecord,
  TileVisualState,
} from '../types/mines.ts';
import {
  calcLiveTrapRiskPct,
  calcSingleTileSafety,
  getMultiplierLadder,
  indexToCoord,
} from './probabilityModule.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

interface MinesBoardModuleProps {
  platform: PlatformId;
  activeSignal: SignalRecord | null;
  trapsCount: number;
  recommendedCount: number;
  showTileProbabilities: boolean;
  isAnalyzing: boolean;
  isRecordingOutcome: boolean;
  recordedSafeIndices: number[];
  recordedMineIndices: number[];
  onTileInteract: (index: number) => void;
  onToggleOutcomeRecording: (enabled: boolean) => void;
  onMarkPathSafe: () => void;
  onSaveOutcome: () => void;
  onClearBoard: () => void;
}

export const GemstoneSvg = memo(function GemstoneSvg({
  glow,
}: {
  glow?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 36 36"
      className={`w-6 h-6 sm:w-8 sm:h-8 ${
        glow ? 'drop-shadow-[0_0_8px_rgba(22,167,101,0.65)]' : ''
      }`}
      aria-hidden="true"
    >
      <polygon
        points="18,3 31,12 26,31 10,31 5,12"
        fill="#16A765"
        stroke="#A7F3D0"
        strokeWidth="1.5"
      />
      <polygon
        points="18,3 31,12 18,16 5,12"
        fill="#32C5E8"
        fillOpacity="0.55"
      />
      <polygon
        points="18,3 24,12 18,29 12,12"
        fill="#FFFFFF"
        fillOpacity="0.26"
      />
    </svg>
  );
});

interface TileCellProps {
  index: number;
  visualState: TileVisualState;
  stepNumber: number | null;
  confidencePct: number;
  showTileProbabilities: boolean;
  isInteractive: boolean;
  isAnalyzing: boolean;
  onTileClick: (index: number) => void;
}

const TileCell = memo(function TileCell({
  index,
  visualState,
  stepNumber,
  confidencePct,
  showTileProbabilities,
  isInteractive,
  isAnalyzing,
  onTileClick,
}: TileCellProps) {
  const coord = indexToCoord(index);

  let surfaceClass = 'tile-unopened border-[#32C5E8]/40 text-[#F3F7FF]';
  let stateText = 'UNOPENED';

  if (visualState === 'revealed_mine') {
    surfaceClass =
      'bg-[#D93646]/25 border-[#D93646] text-[#F3F7FF] shadow-[inset_0_0_18px_rgba(217,54,70,0.45)]';
    stateText = 'REVEALED MINE';
  } else if (visualState === 'revealed_gem') {
    surfaceClass =
      'bg-[#16A765]/25 border-[#16A765] text-[#F3F7FF] shadow-[0_0_20px_rgba(22,167,101,0.3)]';
    stateText = 'REVEALED GEM';
  } else if (visualState === 'selected') {
    surfaceClass =
      'bg-[#087AFF]/30 border-[#32C5E8] ring-2 ring-[#32C5E8] text-[#F3F7FF]';
    stateText = 'SELECTED SAFE';
  } else if (visualState === 'recommended') {
    surfaceClass =
      'bg-[#16A765]/22 border-[#16A765]/90 text-[#F3F7FF] shadow-[0_0_16px_rgba(22,167,101,0.22)]';
    stateText = 'RECOMMENDED';
  } else if (visualState === 'uncertain') {
    surfaceClass =
      'bg-orange-500/20 border-orange-400/80 text-[#F3F7FF]';
    stateText = 'UNCERTAIN';
  }

  return (
    <button
      type="button"
      onClick={() => onTileClick(index)}
      aria-label={`Tile ${coord}, ${stateText}, baseline ${confidencePct}%`}
      className={`tile-cell relative aspect-square min-h-[48px] sm:min-h-[72px] rounded-xl sm:rounded-2xl border p-1 sm:p-2 flex flex-col items-center justify-between ${
        isAnalyzing
          ? 'transition-none'
          : 'transition-[transform,border-color,background-color] duration-150'
      } ${
        isInteractive
          ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.97]'
          : 'cursor-default'
      } ${surfaceClass} focus-visible:outline-2 focus-visible:outline-[#32C5E8]`}
    >
      <div className="w-full flex items-center justify-between text-[10px] sm:text-xs font-semibold">
        <span className="opacity-80">{coord}</span>
        {stepNumber !== null ? (
          <span
            title={`Selection Path Step ${stepNumber}`}
            className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#16A765] text-[#080F20] text-[10px] sm:text-xs font-bold flex items-center justify-center shadow"
          >
            {stepNumber}
          </span>
        ) : showTileProbabilities ? (
          <span className="opacity-80 tabular-nums text-[10px]">
            {confidencePct.toFixed(0)}%
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 my-auto">
        {visualState === 'revealed_mine' ? (
          <>
            <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-[#D93646]" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-red-200">
              MINE
            </span>
          </>
        ) : visualState === 'revealed_gem' ? (
          <>
            <GemstoneSvg glow />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-emerald-200">
              GEM
            </span>
          </>
        ) : visualState === 'recommended' ? (
          <>
            <GemstoneSvg />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-emerald-300">
              SAFE
            </span>
          </>
        ) : visualState === 'uncertain' ? (
          <>
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-orange-200">
              UNCERTAIN
            </span>
          </>
        ) : visualState === 'selected' ? (
          <>
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#32C5E8]" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-cyan-100">
              SELECTED
            </span>
          </>
        ) : (
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#32C5E8]/55" aria-hidden="true" />
        )}
      </div>

      <div className="h-1.5" />
    </button>
  );
});

export function MinesBoardModule({
  platform,
  activeSignal,
  trapsCount,
  recommendedCount,
  showTileProbabilities,
  isAnalyzing,
  isRecordingOutcome,
  recordedSafeIndices,
  recordedMineIndices,
  onTileInteract,
  onToggleOutcomeRecording,
  onMarkPathSafe,
  onSaveOutcome,
  onClearBoard,
}: MinesBoardModuleProps) {
  const renderStartRef = useRef<number>(0);
  renderStartRef.current =
    typeof performance !== 'undefined' ? performance.now() : 0;

  const ladder = useMemo(
    () => getMultiplierLadder(trapsCount, platform),
    [trapsCount, platform]
  );
  const clampedPicks = Math.min(recommendedCount, 25 - trapsCount);
  const baseSafety = useMemo(
    () => calcSingleTileSafety(trapsCount),
    [trapsCount]
  );

  const revealedSafeCount = isRecordingOutcome
    ? recordedSafeIndices.length
    : (activeSignal?.revealedSafeIndices.length ?? 0);

  const gemsRemaining = Math.max(0, 25 - trapsCount - revealedSafeCount);
  const liveTrapRisk = calcLiveTrapRiskPct(trapsCount, revealedSafeCount);

  const targetMult =
    ladder[Math.max(0, clampedPicks - 1)]?.multiplier ?? 1;

  const { stepMap, tileStates } = useMemo(() => {
    const sMap = new Map<number, number>();
    if (activeSignal) {
      activeSignal.recommendedIndices.forEach((idx, i) => sMap.set(idx, i + 1));
    }

    const uncertainSet = new Set(activeSignal?.uncertainIndices ?? []);
    const recSafeSet = new Set(recordedSafeIndices);
    const recMineSet = new Set(recordedMineIndices);
    const sigSafeSet = new Set(activeSignal?.revealedSafeIndices ?? []);
    const sigMineSet = new Set(activeSignal?.revealedMineIndices ?? []);

    const states: TileVisualState[] = new Array<TileVisualState>(25);
    for (let index = 0; index < 25; index++) {
      if (isRecordingOutcome) {
        if (recMineSet.has(index)) states[index] = 'revealed_mine';
        else if (recSafeSet.has(index)) states[index] = 'selected';
        else if (sMap.has(index)) states[index] = 'recommended';
        else if (uncertainSet.has(index)) states[index] = 'uncertain';
        else states[index] = 'unopened';
      } else {
        if (sigMineSet.has(index)) states[index] = 'revealed_mine';
        else if (sigSafeSet.has(index)) states[index] = 'revealed_gem';
        else if (sMap.has(index)) states[index] = 'recommended';
        else if (uncertainSet.has(index)) states[index] = 'uncertain';
        else states[index] = 'unopened';
      }
    }
    return { stepMap: sMap, tileStates: states };
  }, [
    activeSignal,
    isRecordingOutcome,
    recordedSafeIndices,
    recordedMineIndices,
  ]);

  useEffect(() => {
    if (typeof performance !== 'undefined' && renderStartRef.current > 0) {
      performanceMonitor.recordBoardRender(
        performance.now() - renderStartRef.current
      );
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Theoretical Multiplier Strip */}
      <section
        aria-label="Theoretical Multiplier Strip"
        className="surface-panel rounded-2xl border border-[#32C5E8]/20 px-4 py-3 flex flex-col gap-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#9BB2D8] font-medium">
            {platform === 'onewin' ? '1win Mines' : 'BGR8 Mines'} Theoretical Multipliers ({trapsCount}{' '}
            {trapsCount === 1 ? 'Mine' : 'Mines'})
          </span>
          <span className="font-semibold text-[#32C5E8] tabular-nums">
            Step {clampedPicks} Multiplier: {targetMult}×
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {ladder.slice(0, 12).map((step) => {
            const isTarget = step.picks === clampedPicks;
            const isPassed = step.picks < clampedPicks;
            return (
              <div
                key={step.picks}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-xs tabular-nums ${
                  isTarget
                    ? 'border-[#087AFF] bg-[#087AFF] text-[#F3F7FF] font-bold shadow-[0_0_12px_rgba(8,122,255,0.45)]'
                    : isPassed
                      ? 'border-[#16A765]/50 bg-[#16A765]/15 text-emerald-300 font-semibold'
                      : 'border-[#32C5E8]/20 bg-[#171E32] text-[#9BB2D8]'
                }`}
              >
                <span className="opacity-70 mr-1">{step.picks}.</span>
                <span>{step.multiplier}×</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main 5x5 Board */}
      <section
        aria-label="5 by 5 Interactive Mines Analyzer"
        className="surface-panel rounded-2xl border border-[#32C5E8]/25 p-4 sm:p-6 flex flex-col gap-5 shadow-[0_0_32px_rgba(50,197,232,0.08)]"
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-4 rounded-xl border border-[#32C5E8]/15 bg-[#171E32] p-3 text-center">
          <div>
            <div className="text-[11px] text-[#9BB2D8]">Safe Tiles Left</div>
            <div className="text-base sm:text-lg font-bold text-[#16A765] tabular-nums">
              {gemsRemaining}
            </div>
          </div>
          <div className="border-x border-[#32C5E8]/15">
            <div className="text-[11px] text-[#9BB2D8]">Mine Probability</div>
            <div className="text-base sm:text-lg font-bold text-orange-400 tabular-nums">
              {liveTrapRisk}%
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9BB2D8]">Revealed Safe</div>
            <div className="text-base sm:text-lg font-bold text-[#32C5E8] tabular-nums">
              {revealedSafeCount} / {25 - trapsCount}
            </div>
          </div>
        </div>

        {/* Actual Outcome Recording Controls */}
        {activeSignal && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[#9BB2D8] tabular-nums">
              Signal <strong className="text-[#32C5E8]">{activeSignal.id}</strong> ·{' '}
              {new Date(activeSignal.timestamp).toLocaleTimeString()}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isRecordingOutcome ? (
                <button
                  type="button"
                  onClick={() => onToggleOutcomeRecording(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#32C5E8]/40 bg-[#32C5E8]/15 text-[#F3F7FF] hover:bg-[#32C5E8]/25 transition-colors"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-[#32C5E8]" aria-hidden="true" />
                  <span>Record Actual Result</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onMarkPathSafe}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#16A765]/50 bg-[#16A765]/15 text-emerald-300"
                  >
                    Mark Path Safe
                  </button>
                  <button
                    type="button"
                    onClick={onSaveOutcome}
                    disabled={
                      recordedSafeIndices.length === 0 &&
                      recordedMineIndices.length === 0
                    }
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#087AFF] hover:bg-blue-500 disabled:opacity-50 text-white"
                  >
                    Save Outcome ({recordedSafeIndices.length}S / {recordedMineIndices.length}M)
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleOutcomeRecording(false)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-[#9BB2D8] hover:text-white"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClearBoard}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#32C5E8]/20 text-[#9BB2D8] hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {isRecordingOutcome && activeSignal && (
          <p className="text-xs text-[#F3F7FF] bg-[#087AFF]/15 border border-[#087AFF]/40 rounded-xl px-3.5 py-2">
            Click tiles to record legitimately revealed Safe Gems or Confirmed Revealed Mines from your game round, then click Save Outcome.
          </p>
        )}

        <div
          className="grid grid-cols-5 gap-1.5 sm:gap-3"
          role="grid"
          aria-label="5 by 5 Mines Board"
        >
          {tileStates.map((visualState, index) => (
            <TileCell
              key={index}
              index={index}
              visualState={visualState}
              stepNumber={stepMap.get(index) ?? null}
              confidencePct={activeSignal?.tileConfidenceMap[index] ?? baseSafety}
              showTileProbabilities={showTileProbabilities}
              isInteractive={isRecordingOutcome && activeSignal !== null}
              isAnalyzing={isAnalyzing}
              onTileClick={onTileInteract}
            />
          ))}
        </div>

        {/* Strict Signal Color Legend */}
        <div className="pt-2 border-t border-[#32C5E8]/15 flex flex-wrap items-center gap-4 text-xs text-[#9BB2D8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#087D9D] inline-block" aria-hidden="true" />
            <span>Cyan: Unopened</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#16A765] inline-block" aria-hidden="true" />
            <span>Green: Statistical Recommendation</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" aria-hidden="true" />
            <span>Orange: Uncertain Tile</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#D93646] inline-block" aria-hidden="true" />
            <span>Red: Confirmed Revealed Mine Only</span>
          </span>
        </div>
      </section>

      {/* Selection Path */}
      <section
        aria-label="Selection Path"
        className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-4 sm:p-5 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-[#16A765]" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-bold text-[#F3F7FF]">
              Selection Path
            </h3>
          </div>
          <span className="text-xs text-[#9BB2D8]">
            Unknown tiles are never labeled confirmed mines
          </span>
        </div>

        {!activeSignal || activeSignal.safePath.length === 0 ? (
          <p className="text-xs text-[#9BB2D8]">
            Generate a signal to inspect recommended coordinates and ordered selection steps.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeSignal.safePath.map((step) => (
                <li
                  key={step.index}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[#16A765]/40 bg-[#16A765]/12 text-xs"
                >
                  <span className="font-semibold text-[#F3F7FF]">
                    <span className="text-[#16A765] mr-1.5">{step.step}.</span>
                    {step.label}
                  </span>
                  <span className="text-[11px] text-emerald-300 tabular-nums">
                    {step.coord} · {step.theoreticalConfidencePct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ol>
            <div className="rounded-xl bg-[#171E32] border border-[#32C5E8]/15 p-3 text-xs text-[#9BB2D8] leading-relaxed">
              <p className="text-[#F3F7FF]">{activeSignal.aiSummary}</p>
              <p className="mt-1">{activeSignal.riskNote}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
