import { memo, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Bomb,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  Route,
  Sparkles,
} from 'lucide-react';
import type { SignalRecord, TileVisualState } from '../types/mines.ts';
import {
  calcLiveTrapRiskPct,
  calcSingleTileSafety,
  getMultiplierLadder,
  indexToCoord,
} from './probabilityModule.ts';
import { performanceMonitor } from '../services/performanceMonitor.ts';

interface MinesBoardModuleProps {
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
        glow ? 'drop-shadow-[0_0_8px_rgba(0,217,139,0.7)]' : ''
      }`}
      aria-hidden="true"
    >
      <polygon
        points="18,3 31,12 26,31 10,31 5,12"
        fill="#00D98B"
        stroke="#A7F3D0"
        strokeWidth="1.5"
      />
      <polygon points="18,3 31,12 18,16 5,12" fill="#38BDF8" fillOpacity="0.5" />
      <polygon points="18,3 24,12 18,29 12,12" fill="#FFFFFF" fillOpacity="0.28" />
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

  let surfaceClass = 'tile-unopened text-[#F4F7FC]';
  let stateText = 'UNOPENED';

  if (visualState === 'revealed_mine') {
    surfaceClass =
      'bg-rose-500/20 border-rose-500 text-[#F4F7FC] shadow-[inset_0_0_18px_rgba(244,63,94,0.4)]';
    stateText = 'REVEALED MINE';
  } else if (visualState === 'revealed_gem') {
    surfaceClass =
      'bg-[#00D98B]/22 border-[#00D98B] text-[#F4F7FC] emerald-glow';
    stateText = 'VERIFIED SAFE';
  } else if (visualState === 'selected') {
    surfaceClass =
      'bg-[#38BDF8]/25 border-[#38BDF8] ring-2 ring-[#38BDF8] text-[#F4F7FC]';
    stateText = 'SELECTED SAFE';
  } else if (visualState === 'recommended') {
    surfaceClass =
      'bg-[#00D98B]/16 border-[#00D98B]/85 text-[#F4F7FC] shadow-[0_0_16px_rgba(0,217,139,0.22)]';
    stateText = 'RECOMMENDED';
  } else if (visualState === 'uncertain') {
    surfaceClass =
      'bg-[#8B5CF6]/18 border-[#8B5CF6]/70 text-[#F4F7FC]';
    stateText = 'UNCERTAIN';
  }

  return (
    <button
      type="button"
      onClick={() => onTileClick(index)}
      aria-label={`Cell ${coord}, ${stateText}, estimated ${confidencePct}%`}
      className={`tile-cell relative aspect-square min-h-[48px] sm:min-h-[72px] rounded-xl sm:rounded-2xl border p-1 sm:p-2 flex flex-col items-center justify-between ${
        isAnalyzing
          ? 'transition-none'
          : 'transition-[transform,border-color,background-color] duration-150'
      } ${
        isInteractive
          ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.97]'
          : 'cursor-default'
      } ${surfaceClass} focus-visible:outline-2 focus-visible:outline-[#00D98B]`}
    >
      <div className="w-full flex items-center justify-between text-[10px] sm:text-xs font-semibold">
        <span className="opacity-80">{coord}</span>
        {stepNumber !== null ? (
          <span
            title={`Selection Path Step ${stepNumber}`}
            className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-[#00D98B] text-[#050A12] text-[10px] sm:text-xs font-bold flex items-center justify-center shadow"
          >
            {stepNumber}
          </span>
        ) : showTileProbabilities ? (
          <span className="opacity-75 tabular-nums text-[10px]">
            {confidencePct.toFixed(0)}%
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 my-auto">
        {visualState === 'revealed_mine' ? (
          <>
            <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-rose-200">
              MINE
            </span>
          </>
        ) : visualState === 'revealed_gem' ? (
          <>
            <GemstoneSvg glow />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-[#00D98B]">
              VERIFIED
            </span>
          </>
        ) : visualState === 'recommended' ? (
          <>
            <GemstoneSvg />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-[#00D98B]">
              PICK
            </span>
          </>
        ) : visualState === 'uncertain' ? (
          <>
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-[#C4B5FD]" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-[#C4B5FD]">
              RISK
            </span>
          </>
        ) : visualState === 'selected' ? (
          <>
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#38BDF8]" aria-hidden="true" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider text-[#38BDF8]">
              SAFE
            </span>
          </>
        ) : (
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#38BDF8]/45" aria-hidden="true" />
        )}
      </div>

      <div className="h-1" />
    </button>
  );
});

export function MinesBoardModule({
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

  const ladder = useMemo(() => getMultiplierLadder(trapsCount), [trapsCount]);
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

  const hasVerifiedOutcome =
    Boolean(activeSignal) &&
    ((activeSignal?.revealedSafeIndices.length ?? 0) > 0 ||
      (activeSignal?.revealedMineIndices.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Theoretical Multiplier Strip */}
      <section
        aria-label="Theoretical Multiplier Progression"
        className="glass-panel rounded-2xl px-4 py-3 flex flex-col gap-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#91A0B5] font-medium">
            Theoretical Multiplier Curve ({trapsCount}{' '}
            {trapsCount === 1 ? 'Mine' : 'Mines'})
          </span>
          <span className="font-semibold text-[#38BDF8] tabular-nums">
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
                    ? 'border-[#00D98B] bg-[#00D98B] text-[#050A12] font-bold emerald-glow'
                    : isPassed
                      ? 'border-[#00D98B]/40 bg-[#00D98B]/12 text-[#00D98B] font-semibold'
                      : 'border-[#38BDF8]/15 bg-[#080F1B] text-[#91A0B5]'
                }`}
              >
                <span className="opacity-70 mr-1">{step.picks}.</span>
                <span>{step.multiplier}×</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main 5x5 Mines Board */}
      <section
        aria-label="5 by 5 Interactive Mines Board"
        className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col gap-5"
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-4 rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 text-center">
          <div>
            <div className="text-[11px] text-[#91A0B5]">Safe Left</div>
            <div className="text-base sm:text-lg font-bold text-[#00D98B] tabular-nums">
              {gemsRemaining}
            </div>
          </div>
          <div className="border-x border-white/[0.08]">
            <div className="text-[11px] text-[#91A0B5]">Mine Risk</div>
            <div className="text-base sm:text-lg font-bold text-[#8B5CF6] tabular-nums">
              {liveTrapRisk}%
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#91A0B5]">Verified</div>
            <div className="text-base sm:text-lg font-bold text-[#38BDF8] tabular-nums">
              {revealedSafeCount} / {25 - trapsCount}
            </div>
          </div>
        </div>

        {/* Historical Outcome Recording Bar */}
        {activeSignal && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[#91A0B5] tabular-nums flex flex-wrap items-center gap-2">
              <strong className="text-[#38BDF8]">{activeSignal.id}</strong>
              <span aria-hidden="true">·</span>
              <span>{new Date(activeSignal.timestamp).toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  hasVerifiedOutcome ? 'text-[#00D98B] font-semibold' : 'text-[#8B5CF6]'
                }
              >
                {hasVerifiedOutcome ? 'Historical Result Recorded' : 'Estimated Future Picks'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isRecordingOutcome ? (
                <button
                  type="button"
                  onClick={() => onToggleOutcomeRecording(true)}
                  title="Record Actual Result"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#38BDF8]/35 bg-[#38BDF8]/12 text-[#F4F7FC] hover:bg-[#38BDF8]/20 transition-colors"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                  <span>Record Result</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onMarkPathSafe}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#00D98B]/45 bg-[#00D98B]/12 text-[#00D98B]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>All Safe</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSaveOutcome}
                    disabled={
                      recordedSafeIndices.length === 0 &&
                      recordedMineIndices.length === 0
                    }
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#00D98B] hover:bg-[#00c47d] disabled:opacity-50 text-[#050A12]"
                  >
                    Save ({recordedSafeIndices.length}S / {recordedMineIndices.length}M)
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleOutcomeRecording(false)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-[#91A0B5] hover:text-[#F4F7FC]"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClearBoard}
                title="Reset Board"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-[#132638]"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

        {isRecordingOutcome && activeSignal && (
          <p className="text-xs text-[#F4F7FC] bg-[#38BDF8]/12 border border-[#38BDF8]/35 rounded-xl px-3.5 py-2">
            Click cells to cycle: Safe Gem → Confirmed Mine → Unset, then Save.
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

        {/* Visual Legend */}
        <div className="pt-2 border-t border-[#38BDF8]/15 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#91A0B5]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#132238] border border-[#38BDF8]/40 inline-block" aria-hidden="true" />
            <span>Unopened</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#00D98B] inline-block" aria-hidden="true" />
            <span>Recommended Estimate</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#8B5CF6] inline-block" aria-hidden="true" />
            <span>Elevated Uncertainty</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" aria-hidden="true" />
            <span>Verified Revealed Mine Only</span>
          </span>
        </div>
      </section>

      {/* Analysis Explanation & Selection Sequence */}
      <section
        aria-label="Selection Path and Statistical Explanation"
        className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
            <h3 className="text-sm font-bold text-[#F4F7FC]">
              Selection Path
            </h3>
          </div>
          <span className="text-xs text-[#91A0B5]">
            Random outcomes cannot be guaranteed
          </span>
        </div>

        {!activeSignal || activeSignal.safePath.length === 0 ? (
          <p className="text-xs text-[#91A0B5]">
            Generate a prediction to compute recommended coordinates and 7-hour statistical context.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeSignal.safePath.map((step) => (
                <li
                  key={step.index}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[#00D98B]/30 bg-[#00D98B]/10 text-xs"
                >
                  <span className="font-semibold text-[#F4F7FC]">
                    <span className="text-[#00D98B] mr-1.5">{step.step}.</span>
                    {step.label}
                  </span>
                  <span className="text-[11px] text-[#00D98B] tabular-nums">
                    {step.coord} · {step.theoreticalConfidencePct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ol>
            <div className="rounded-xl bg-[#050A12]/80 border border-[#38BDF8]/15 p-3.5 text-xs text-[#91A0B5] leading-relaxed">
              <p className="text-[#F4F7FC]">{activeSignal.aiSummary}</p>
              <p className="mt-1.5">{activeSignal.riskNote}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
