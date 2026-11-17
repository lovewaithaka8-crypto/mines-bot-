import type { PlatformId, PlatformIntegrationConfig } from '../types/mines.ts';
import {
  BGR8_PLATFORM_META,
  parseBgr8VisibleState,
  probeBgr8Endpoint,
  validateBgr8Url,
} from '../../integrations/bgr8.js';
import {
  ONEWIN_PLATFORM_META,
  parseOnewinVisibleState,
  probeOnewinEndpoint,
  validateOnewinUrl,
} from '../../integrations/onewin.js';

export interface PlatformProbeResult {
  validUrl: boolean;
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  normalizedDomain: string | null;
  message: string;
  checkedAt: string;
  capabilities: string[];
}

export interface ParsedRoundSnapshot {
  platform: PlatformId;
  roundId: string;
  trapsCount: number;
  revealedSafeIndices: number[];
  revealedMineIndices: number[];
  syncedAt: string;
  source: 'screen_reader' | 'manual';
}

export function getPlatformMeta(platform: PlatformId) {
  return platform === 'bgr8' ? BGR8_PLATFORM_META : ONEWIN_PLATFORM_META;
}

export function validatePlatformUrl(platform: PlatformId, url: string) {
  return platform === 'bgr8' ? validateBgr8Url(url) : validateOnewinUrl(url);
}

export async function probePlatformConnection(
  platform: PlatformId,
  config: PlatformIntegrationConfig
): Promise<PlatformProbeResult> {
  const result =
    platform === 'bgr8'
      ? await probeBgr8Endpoint(config)
      : await probeOnewinEndpoint(config);
  return result as PlatformProbeResult;
}

export function parsePlatformSnapshot(
  platform: PlatformId,
  rawJson: string
): { snapshot?: ParsedRoundSnapshot; error?: string } {
  const parsed =
    platform === 'bgr8'
      ? parseBgr8VisibleState(rawJson)
      : parseOnewinVisibleState(rawJson);
  return parsed as { snapshot?: ParsedRoundSnapshot; error?: string };
}

export function detectNewRound(
  previousRoundId: string | undefined,
  incomingRoundId: string
): boolean {
  if (!incomingRoundId.trim()) return false;
  if (!previousRoundId) return true;
  return previousRoundId.trim() !== incomingRoundId.trim();
}
