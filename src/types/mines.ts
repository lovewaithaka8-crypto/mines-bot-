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

export type AccentPreference = 'emerald' | 'purple' | 'cyan';

export type GenerationMode = 'manual' | 'automatic';

export type AnalysisEngineMode = 'ai_assisted' | 'combinatorial_only';

/**
 * Analysis window selector:
 * - '7h': Previous 7 hours rolling window (default)
 * - 10, 25, 50: Most recent N recorded rounds
 * - 0: All stored rounds
 */
export type AnalysisWindowSetting = '7h' | 10 | 25 | 50 | 0;

export type WorkspacePage =
  | 'overview'
  | 'analyzer'
  | 'aviator'
  | 'platforms'
  | 'history'
  | 'performance'
  | 'settings'
  | 'help'
  | 'responsible'
  | 'admin';

export interface SafePathStep {
  step: number;
  index: number;
  row: number;
  col: number;
  coord: string;
  label: string;
  theoreticalConfidencePct: number;
}

export interface UserSettings {
  defaultMinesCount: number;
  recommendedCount: number;
  analysisWindow: AnalysisWindowSetting;
  generationMode: GenerationMode;
  signalRefreshIntervalSec: number;
  accentPreference: AccentPreference;
  compactLayout: boolean;
  soundEnabled: boolean;
  outcomeAlertsEnabled: boolean;
  autoSyncBackend: boolean;
  showTileProbabilities: boolean;
  analysisEngineMode: AnalysisEngineMode;
}

export interface SignalRecord {
  id: string;
  timestamp: string;
  trapsCount: number;
  recommendedCount: number;
  roundsAnalysedCount: number;
  windowLabel?: string;
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
  evaluationCoveragePct: number | null;
  correctRecommendations: number;
  incorrectRecommendations: number;
  totalEvaluatedPicks: number;
  measuredSafeRatePct: number | null;
  theoreticalAvgSingleSafePct: number | null;
  sevenHourSignals: number;
  sevenHourEvaluatedRounds: number;
  sevenHourAccuracyPct: number | null;
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

export type GameCompatibilityStatus =
  | 'Verified'
  | 'Available but not integrated'
  | 'Integration available'
  | 'Unsupported'
  | 'Under verification';

export type LicensingStatus =
  | 'Pending Verification'
  | 'Verified Kenyan License'
  | 'Unverified / Offshore'
  | 'Restricted';

export type PlatformAvailability =
  | 'Active Candidate'
  | 'Geo / Access Restricted'
  | 'Offline'
  | 'Custom';

export type AdapterType =
  | 'none'
  | 'authorized_json_feed'
  | 'public_provably_fair_api'
  | 'custom_webhook_feed';

export type HealthStatus =
  | 'Not Configured'
  | 'Healthy'
  | 'Degraded'
  | 'Disabled';

export type PlatformGameType = 'mines' | 'aviator';

export type ConnectionRealStatus =
  | 'Connected'
  | 'Authorized'
  | 'Verification Required'
  | 'Authorization Required'
  | 'Sync Error'
  | 'Expired'
  | 'Disconnected'
  | 'Unsupported';

export interface BettingPlatform {
  id: string;
  name: string;
  shortCode: string;
  brandColor: string;
  officialWebsite: string | null;
  allowedDomains: string[];
  bclbStatus: LicensingStatus;
  licenseNumber: string;
  availabilityStatus: PlatformAvailability;
  minesCompatibility: GameCompatibilityStatus;
  aviatorCompatibility: GameCompatibilityStatus;
  adapterId: string;
  adapterType: AdapterType;
  feedEndpoint?: string | null;
  hasConfiguredFeed?: boolean;
  enabled: boolean;
  healthStatus: HealthStatus;
  lastHealthCheckAt: string | null;
  notes: string;
  isCustomSlot?: boolean;
  updatedAt: string;
}

export interface PlatformConnection {
  id: string;
  platformId: string;
  platformName: string;
  shortCode: string;
  brandColor: string;
  websiteUrl: string;
  authorizedFeedUrl: string | null;
  selectedGame: PlatformGameType;
  supportedGames: PlatformGameType[];
  connectionStatus: ConnectionRealStatus;
  statusMessage: string;
  hasAuthToken: boolean;
  lastSyncAt: string | null;
  syncedRoundsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationPipelineStep {
  step: number;
  key: string;
  label: string;
  status: 'passed' | 'warning' | 'failed' | 'pending';
  detail: string;
}

export interface SyncedMinesRound {
  id: string;
  connectionId: string;
  platformId: string;
  platformName: string;
  roundId: string;
  timestamp: string;
  minesCount: number;
  revealedSafeIndices: number[];
  revealedMineIndices: number[];
  sourceMode: 'authorized_feed';
}

export interface SyncedAviatorRound {
  id: string;
  connectionId: string;
  platformId: string;
  platformName: string;
  roundId: string;
  timestamp: string;
  multiplier: number;
  sourceMode: 'authorized_feed';
}

