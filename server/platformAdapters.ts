import type { PlatformDirectoryEntry } from './platformRegistry.ts';
import {
  assertPublicDnsResolution,
  doesHostMatchAllowedDomains,
  validateExternalHttpsUrl,
} from './platformSecurity.ts';

export type SelectedPlatformGame = 'mines' | 'aviator';

export type ConnectionRealStatus =
  | 'Connected'
  | 'Authorized'
  | 'Verification Required'
  | 'Authorization Required'
  | 'Sync Error'
  | 'Expired'
  | 'Disconnected'
  | 'Unsupported';

export interface VerificationPipelineStep {
  step: number;
  key:
    | 'url_validation'
    | 'domain_match'
    | 'ssrf_dns_check'
    | 'adapter_lookup'
    | 'authorization'
    | 'connection_verified'
    | 'history_sync';
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

export interface AdapterExecutionResult {
  connected: boolean;
  connectionStatus: ConnectionRealStatus;
  statusMessage: string;
  steps: VerificationPipelineStep[];
  minesRounds: SyncedMinesRound[];
  aviatorRounds: SyncedAviatorRound[];
  httpStatus?: number;
}

const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5000;

async function fetchAuthorizedJsonSafe(
  targetUrl: string,
  authToken: string | null
): Promise<{
  ok: boolean;
  httpStatus?: number;
  json?: unknown;
  reason: string;
}> {
  const urlCheck = validateExternalHttpsUrl(targetUrl);
  if (!urlCheck.valid || !urlCheck.hostname || !urlCheck.normalizedUrl) {
    return { ok: false, reason: urlCheck.reason || 'Invalid target URL.' };
  }

  const dnsCheck = await assertPublicDnsResolution(urlCheck.hostname);
  if (!dnsCheck.safe) {
    return {
      ok: false,
      reason: dnsCheck.reason || 'Host failed SSRF/DNS safety check.',
    };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'MinesBot-AuthorizedAdapter/1.0',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(urlCheck.normalizedUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        httpStatus: response.status,
        reason: 'Unsafe or cross-origin HTTP redirect rejected.',
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        httpStatus: response.status,
        reason: `Authorization or access control rejected (${response.status}). Bypassing gates is never permitted.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        reason: `Endpoint returned HTTP ${response.status}.`,
      };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        httpStatus: response.status,
        reason:
          'Target returned HTML or non-JSON content (no official public JSON API detected).',
      };
    }

    const buf = await response.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        httpStatus: response.status,
        reason: 'Authorized feed payload exceeded 512 KB safety limit.',
      };
    }

    const text = Buffer.from(buf).toString('utf8');
    const parsed = JSON.parse(text) as unknown;
    return {
      ok: true,
      httpStatus: response.status,
      json: parsed,
      reason: 'Authorized JSON feed verified.',
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Outbound verification timed out or failed.';
    return {
      ok: false,
      reason: msg.includes('abort')
        ? 'Verification request timed out (5s limit).'
        : msg,
    };
  }
}

function parseMinesFeedPayload(
  payload: unknown,
  connectionId: string,
  platform: PlatformDirectoryEntry
): SyncedMinesRound[] {
  const root = payload as
    | { rounds?: unknown[]; data?: unknown[]; mines?: unknown[] }
    | unknown[];
  const arr = Array.isArray(root)
    ? root
    : Array.isArray(root?.rounds)
      ? root.rounds
      : Array.isArray(root?.mines)
        ? root.mines
        : Array.isArray(root?.data)
          ? root.data
          : [];

  const out: SyncedMinesRound[] = [];
  for (let i = 0; i < Math.min(arr.length, 200); i++) {
    const item = arr[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') continue;
    const roundId = String(item.roundId ?? item.id ?? '').trim();
    const timestamp = String(item.timestamp ?? item.createdAt ?? '').trim();
    const minesCount = Number(item.minesCount ?? item.trapsCount ?? item.mines ?? 0);
    const safeRaw = Array.isArray(item.revealedSafeIndices)
      ? item.revealedSafeIndices
      : Array.isArray(item.safeIndices)
        ? item.safeIndices
        : [];
    const mineRaw = Array.isArray(item.revealedMineIndices)
      ? item.revealedMineIndices
      : Array.isArray(item.mineIndices)
        ? item.mineIndices
        : [];

    const safe = safeRaw
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 24);
    const mines = mineRaw
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 24);

    if (
      !roundId ||
      !timestamp ||
      Number.isNaN(Date.parse(timestamp)) ||
      !Number.isInteger(minesCount) ||
      minesCount < 1 ||
      minesCount > 24 ||
      (safe.length === 0 && mines.length === 0)
    ) {
      continue;
    }

    out.push({
      id: `M-${connectionId}-${roundId}`,
      connectionId,
      platformId: platform.id,
      platformName: platform.name,
      roundId,
      timestamp: new Date(timestamp).toISOString(),
      minesCount,
      revealedSafeIndices: Array.from(new Set(safe)),
      revealedMineIndices: Array.from(new Set(mines)),
      sourceMode: 'authorized_feed',
    });
  }
  return out;
}

function parseAviatorFeedPayload(
  payload: unknown,
  connectionId: string,
  platform: PlatformDirectoryEntry
): SyncedAviatorRound[] {
  const root = payload as
    | { rounds?: unknown[]; data?: unknown[]; aviator?: unknown[] }
    | unknown[];
  const arr = Array.isArray(root)
    ? root
    : Array.isArray(root?.rounds)
      ? root.rounds
      : Array.isArray(root?.aviator)
        ? root.aviator
        : Array.isArray(root?.data)
          ? root.data
          : [];

  const out: SyncedAviatorRound[] = [];
  for (let i = 0; i < Math.min(arr.length, 250); i++) {
    const item = arr[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') continue;
    const roundId = String(item.roundId ?? item.id ?? '').trim();
    const timestamp = String(item.timestamp ?? item.createdAt ?? '').trim();
    const multiplier = Number(
      item.multiplier ?? item.crashPoint ?? item.payout ?? 0
    );

    if (
      !roundId ||
      !timestamp ||
      Number.isNaN(Date.parse(timestamp)) ||
      !Number.isFinite(multiplier) ||
      multiplier < 1
    ) {
      continue;
    }

    out.push({
      id: `A-${connectionId}-${roundId}`,
      connectionId,
      platformId: platform.id,
      platformName: platform.name,
      roundId,
      timestamp: new Date(timestamp).toISOString(),
      multiplier: Number(multiplier.toFixed(2)),
      sourceMode: 'authorized_feed',
    });
  }
  return out;
}

export interface AdapterAttemptInput {
  platform: PlatformDirectoryEntry;
  websiteUrl: string;
  selectedGame: SelectedPlatformGame;
  authorizedFeedUrl?: string | null;
  authToken?: string | null;
  connectionId: string;
}

export async function executePlatformAdapterConnect(
  input: AdapterAttemptInput
): Promise<AdapterExecutionResult> {
  const { platform, websiteUrl, selectedGame, authorizedFeedUrl, authToken, connectionId } =
    input;
  const steps: VerificationPipelineStep[] = [];

  // 1. Validate URL
  const urlValidation = validateExternalHttpsUrl(websiteUrl);
  if (!urlValidation.valid || !urlValidation.hostname) {
    steps.push({
      step: 1,
      key: 'url_validation',
      label: 'Validate Website URL',
      status: 'failed',
      detail: urlValidation.reason || 'Invalid HTTPS URL.',
    });
    return {
      connected: false,
      connectionStatus: 'Verification Required',
      statusMessage: urlValidation.reason || 'Invalid URL submitted.',
      steps,
      minesRounds: [],
      aviatorRounds: [],
    };
  }
  steps.push({
    step: 1,
    key: 'url_validation',
    label: 'Validate Website URL',
    status: 'passed',
    detail: `HTTPS syntax valid (${urlValidation.hostname}).`,
  });

  // 2. Domain Match Check
  if (!platform.isCustomSlot && platform.allowedDomains.length > 0) {
    const domainMatches = doesHostMatchAllowedDomains(
      urlValidation.hostname,
      platform.allowedDomains
    );
    if (!domainMatches) {
      steps.push({
        step: 2,
        key: 'domain_match',
        label: 'Match Platform Domain',
        status: 'failed',
        detail: `${urlValidation.hostname} does not match ${platform.name} (${platform.allowedDomains.join(', ')}).`,
      });
      return {
        connected: false,
        connectionStatus: 'Verification Required',
        statusMessage: `Domain mismatch: ${urlValidation.hostname} is not an approved domain for ${platform.name}.`,
        steps,
        minesRounds: [],
        aviatorRounds: [],
      };
    }
    steps.push({
      step: 2,
      key: 'domain_match',
      label: 'Match Platform Domain',
      status: 'passed',
      detail: `Matched ${platform.name} domain (${urlValidation.hostname}).`,
    });
  } else {
    steps.push({
      step: 2,
      key: 'domain_match',
      label: 'Identify Custom Domain',
      status: 'passed',
      detail: `Custom host identified (${urlValidation.hostname}).`,
    });
  }

  // 3. DNS / SSRF Safety Check
  const dnsCheck = await assertPublicDnsResolution(urlValidation.hostname);
  if (!dnsCheck.safe) {
    steps.push({
      step: 3,
      key: 'ssrf_dns_check',
      label: 'DNS & SSRF Check',
      status: 'failed',
      detail: dnsCheck.reason || 'Host failed public IP verification.',
    });
    return {
      connected: false,
      connectionStatus: 'Verification Required',
      statusMessage: dnsCheck.reason || 'Blocked unsafe host resolution.',
      steps,
      minesRounds: [],
      aviatorRounds: [],
    };
  }
  steps.push({
    step: 3,
    key: 'ssrf_dns_check',
    label: 'DNS & SSRF Check',
    status: 'passed',
    detail: `Resolved to public IP (${dnsCheck.resolvedIp}).`,
  });

  // Check platform enablement & game compatibility
  if (!platform.enabled) {
    steps.push({
      step: 4,
      key: 'adapter_lookup',
      label: 'Adapter & API Check',
      status: 'failed',
      detail: 'Platform integration is disabled by administrator.',
    });
    return {
      connected: false,
      connectionStatus: 'Unsupported',
      statusMessage: `${platform.name} integration is currently disabled by administrator.`,
      steps,
      minesRounds: [],
      aviatorRounds: [],
    };
  }

  const gameCompat =
    selectedGame === 'mines'
      ? platform.minesCompatibility
      : platform.aviatorCompatibility;

  if (gameCompat === 'Unsupported') {
    steps.push({
      step: 4,
      key: 'adapter_lookup',
      label: 'Adapter & API Check',
      status: 'failed',
      detail: `${selectedGame.toUpperCase()} is marked Unsupported for ${platform.name}.`,
    });
    return {
      connected: false,
      connectionStatus: 'Unsupported',
      statusMessage: `${platform.name} does not support ${selectedGame.toUpperCase()} integration.`,
      steps,
      minesRounds: [],
      aviatorRounds: [],
    };
  }

  // Determine authorized feed endpoint (admin-configured or user-supplied authorized HTTPS feed)
  const effectiveFeedUrl =
    (authorizedFeedUrl && authorizedFeedUrl.trim()) ||
    platform.feedEndpoint ||
    null;

  if (
    !effectiveFeedUrl &&
    (platform.adapterType === 'none' || !platform.feedEndpoint)
  ) {
    steps.push({
      step: 4,
      key: 'adapter_lookup',
      label: 'Adapter & API Check',
      status: 'warning',
      detail: `${platform.adapterId}: No official public ${selectedGame.toUpperCase()} API or authorized feed endpoint verified for ${platform.name}.`,
    });
    steps.push({
      step: 5,
      key: 'authorization',
      label: 'Authorization Gate',
      status: 'pending',
      detail:
        'Provide an authorized read-only HTTPS JSON feed URL or await official operator API onboarding. CAPTCHAs and login gates are never bypassed.',
    });
    steps.push({
      step: 6,
      key: 'connection_verified',
      label: 'Connection Status',
      status: 'warning',
      detail: 'Not connected — URL saved as unverified candidate only.',
    });
    return {
      connected: false,
      connectionStatus: 'Authorization Required',
      statusMessage: `${platform.name} domain verified, but no official ${selectedGame.toUpperCase()} API/feed is authorized yet. Provide a read-only HTTPS JSON feed URL or use manual round tracking.`,
      steps,
      minesRounds: [],
      aviatorRounds: [],
    };
  }

  // If custom feed URL provided, validate domain restriction unless Other Website or matching allowed domains
  if (effectiveFeedUrl) {
    const feedParsed = validateExternalHttpsUrl(effectiveFeedUrl);
    if (!feedParsed.valid || !feedParsed.hostname) {
      steps.push({
        step: 4,
        key: 'adapter_lookup',
        label: 'Adapter & API Check',
        status: 'failed',
        detail: feedParsed.reason || 'Invalid authorized feed URL.',
      });
      return {
        connected: false,
        connectionStatus: 'Sync Error',
        statusMessage: feedParsed.reason || 'Invalid authorized feed URL.',
        steps,
        minesRounds: [],
        aviatorRounds: [],
      };
    }

    if (
      !platform.isCustomSlot &&
      platform.allowedDomains.length > 0 &&
      effectiveFeedUrl !== platform.feedEndpoint &&
      !doesHostMatchAllowedDomains(feedParsed.hostname, platform.allowedDomains)
    ) {
      steps.push({
        step: 4,
        key: 'adapter_lookup',
        label: 'Adapter & API Check',
        status: 'failed',
        detail: `Feed host ${feedParsed.hostname} is outside ${platform.name}'s approved domains.`,
      });
      return {
        connected: false,
        connectionStatus: 'Verification Required',
        statusMessage: `Authorized feed URL host (${feedParsed.hostname}) must match ${platform.name}'s approved domains.`,
        steps,
        minesRounds: [],
        aviatorRounds: [],
      };
    }
  }

  // 4 & 5 & 6. Probe real authorized endpoint
  const probe = await fetchAuthorizedJsonSafe(
    effectiveFeedUrl as string,
    authToken ?? null
  );

  if (!probe.ok) {
    const isAuthErr = probe.httpStatus === 401 || probe.httpStatus === 403;
    steps.push({
      step: 4,
      key: 'adapter_lookup',
      label: 'Adapter & API Check',
      status: isAuthErr ? 'warning' : 'failed',
      detail: probe.reason,
    });
    steps.push({
      step: 5,
      key: 'authorization',
      label: 'Authorization Gate',
      status: isAuthErr ? 'failed' : 'warning',
      detail: isAuthErr
        ? 'Valid read-only API token required by endpoint.'
        : 'Endpoint did not return an authorized JSON round feed.',
    });
    steps.push({
      step: 6,
      key: 'connection_verified',
      label: 'Connection Status',
      status: 'failed',
      detail: 'Connection not established.',
    });
    return {
      connected: false,
      connectionStatus: isAuthErr ? 'Authorization Required' : 'Sync Error',
      statusMessage: probe.reason,
      steps,
      minesRounds: [],
      aviatorRounds: [],
      httpStatus: probe.httpStatus,
    };
  }

  steps.push({
    step: 4,
    key: 'adapter_lookup',
    label: 'Adapter & API Check',
    status: 'passed',
    detail: `${platform.adapterId} verified HTTP ${probe.httpStatus} JSON response.`,
  });
  steps.push({
    step: 5,
    key: 'authorization',
    label: 'Authorization Gate',
    status: 'passed',
    detail: 'Authorized read-only access confirmed.',
  });

  // 7. Parse real game history from authorized feed
  const minesRounds =
    selectedGame === 'mines'
      ? parseMinesFeedPayload(probe.json, connectionId, platform)
      : [];
  const aviatorRounds =
    selectedGame === 'aviator'
      ? parseAviatorFeedPayload(probe.json, connectionId, platform)
      : [];
  const totalParsed = minesRounds.length + aviatorRounds.length;

  steps.push({
    step: 6,
    key: 'connection_verified',
    label: 'Connection Status',
    status: 'passed',
    detail: `Connected to ${platform.name} (${selectedGame.toUpperCase()}).`,
  });
  steps.push({
    step: 7,
    key: 'history_sync',
    label: 'Synchronize History',
    status: totalParsed > 0 ? 'passed' : 'warning',
    detail:
      totalParsed > 0
        ? `Synchronized ${totalParsed} verified ${selectedGame} records.`
        : `Authorized feed connected, 0 matching ${selectedGame} round entries returned.`,
  });

  return {
    connected: true,
    connectionStatus: 'Connected',
    statusMessage:
      totalParsed > 0
        ? `Connected and synchronized ${totalParsed} ${selectedGame} rounds.`
        : `Connected to authorized feed (0 ${selectedGame} rounds returned).`,
    steps,
    minesRounds,
    aviatorRounds,
    httpStatus: probe.httpStatus,
  };
}

export async function runPlatformHealthCheck(
  platform: PlatformDirectoryEntry
): Promise<{
  healthStatus: PlatformDirectoryEntry['healthStatus'];
  detail: string;
}> {
  if (!platform.enabled) {
    return { healthStatus: 'Disabled', detail: 'Platform is disabled.' };
  }
  if (!platform.feedEndpoint || platform.adapterType === 'none') {
    return {
      healthStatus: 'Not Configured',
      detail: 'No authorized feed endpoint configured.',
    };
  }
  const probe = await fetchAuthorizedJsonSafe(platform.feedEndpoint, null);
  if (probe.ok) {
    return {
      healthStatus: 'Healthy',
      detail: `Endpoint responded HTTP ${probe.httpStatus} with valid JSON.`,
    };
  }
  return {
    healthStatus: 'Degraded',
    detail: probe.reason,
  };
}
