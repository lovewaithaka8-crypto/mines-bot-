export type PlatformId = 'bgr8' | 'onewin';

export type RiskLevel = 'LOW RISK' | 'MEDIUM RISK' | 'HIGH RISK';

export type SignalStatus =
  | 'Active'
  | 'Evaluated: Safe'
  | 'Evaluated: Mine Revealed'
  | 'Archived';

export type TileVisualState =
  | 'unopened'
  | 'selected'
  | 'recommended'
  | 'uncertain'
  | 'revealed_gem'
  | 'revealed_mine';

export type DashboardTheme = 'navy' | 'bgr8-charcoal' | 'slate-light';

export type GenerationMode = 'manual' | 'automatic';

export type AnalysisEngineMode = 'ai_assisted' | 'combinatorial_only';

export type IntegrationMode = 'authorized_api' | 'manual_observation';

export interface SafePathStep {
  step: number;
  index: number;
  row: number;
  col: number;
  coord: string;
  label: string;
  theoreticalConfidencePct: number;
}

export interface PlatformIntegrationConfig {
  platform: PlatformId;
  gameUrl: string;
  apiEndpoint: string;
  integrationMode: IntegrationMode;
  pollIntervalSec: number;
  publicSessionId: string;
  autoSyncTraps: boolean;
  autoDetectNewRound: boolean;
  currentRoundId: string;
  lastDetectedRoundId?: string;
  connectionStatus: 'unconfigured' | 'verified' | 'unreachable';
  connectionNote?: string;
  lastCheckedAt?: string;
  defaultTrapsCount: number;
}

export interface PlatformConfigsMap {
  bgr8: PlatformIntegrationConfig;
  onewin: PlatformIntegrationConfig;
}

export interface UserSettings {
  selectedPlatform: PlatformId;
  trapsByPlatform: Record<PlatformId, number>;
  recommendedCount: number;
  roundsToAnalyse: number;
  generationMode: GenerationMode;
  signalRefreshIntervalSec: number;
  theme: DashboardTheme;
  soundEnabled: boolean;
  showTileProbabilities: boolean;
  analysisEngineMode: AnalysisEngineMode;
}

export interface SignalRecord {
  id: string;
  platform: PlatformId;
  timestamp: string;
  trapsCount: number;
  recommendedCount: number;
  roundsAnalysedCount: number;
  recommendedIndices: number[];
  uncertainIndices: number[];
  safePath: SafePathStep[];
  tileConfidenceMap: Record<number, number>;
  theoreticalSingleSafePct: number;
  theoreticalJointSurvivalPct: number;
  riskLevel: RiskLevel;
  status: SignalStatus;
  revealedSafeIndices: number[];
  revealedMineIndices: number[];
  engineMode: AnalysisEngineMode;
  aiSummary: string;
  riskNote: string;
  sourceMode: IntegrationMode;
  roundRef?: string;
}

export interface PlatformPerformance {
  platform: PlatformId;
  platformName: string;
  signalsCount: number;
  evaluatedRounds: number;
  correctRecommendations: number;
  incorrectRecommendations: number;
  measuredSafeRatePct: number | null;
}

export interface TrapConfigPerformance {
  trapsCount: number;
  signalsCount: number;
  evaluatedRounds: number;
  correctRecommendations: number;
  incorrectRecommendations: number;
  measuredSafeRatePct: number | null;
  theoreticalSingleSafePct: number;
}

export interface PerformanceMetrics {
  totalSignals: number;
  evaluatedRounds: number;
  pendingRounds: number;
  correctRecommendations: number;
  incorrectRecommendations: number;
  totalEvaluatedPicks: number;
  measuredSafeRatePct: number | null;
  theoreticalAvgSingleSafePct: number | null;
  byPlatform: PlatformPerformance[];
  byTrapConfig: TrapConfigPerformance[];
  lastTenSignals: SignalRecord[];
}

export interface EmpiricalTileStats {
  tileIndex: number;
  coord: string;
  observedSafeCount: number;
  observedMineCount: number;
  empiricalSafeRatePct: number | null;
}
