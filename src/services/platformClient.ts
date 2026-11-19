import type {
  BettingPlatform,
  PlatformConnection,
  PlatformGameType,
  SyncedAviatorRound,
  SyncedMinesRound,
  VerificationPipelineStep,
} from '../types/mines.ts';
import {
  fetchJsonWithOptimization,
  invalidateNetworkCache,
} from './networkClient.ts';

export async function fetchPlatformDirectory(): Promise<{
  platforms: BettingPlatform[];
  userConnectionsCount: number;
}> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    platforms?: BettingPlatform[];
    userConnectionsCount?: number;
    error?: string;
  }>('/api/platforms', {
    timeoutMs: 6000,
    cacheTtlMs: 3000,
  });
  if (!ok) {
    throw new Error(data.error || `Failed to load platforms (${status}).`);
  }
  return {
    platforms: data.platforms ?? [],
    userConnectionsCount: data.userConnectionsCount ?? 0,
  };
}

export async function fetchUserConnections(): Promise<PlatformConnection[]> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    connections?: PlatformConnection[];
    error?: string;
  }>('/api/platforms/connections', {
    timeoutMs: 6000,
  });
  if (!ok) {
    throw new Error(data.error || `Failed to load connections (${status}).`);
  }
  return data.connections ?? [];
}

export async function fetchSyncedPlatformData(): Promise<{
  minesRounds: SyncedMinesRound[];
  aviatorRounds: SyncedAviatorRound[];
}> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    minesRounds?: SyncedMinesRound[];
    aviatorRounds?: SyncedAviatorRound[];
    error?: string;
  }>('/api/platforms/synced-data', {
    timeoutMs: 6000,
  });
  if (!ok) {
    throw new Error(data.error || `Failed to load synced data (${status}).`);
  }
  return {
    minesRounds: data.minesRounds ?? [],
    aviatorRounds: data.aviatorRounds ?? [],
  };
}

export async function connectPlatformWebsite(payload: {
  platformId: string;
  customPlatformName?: string;
  websiteUrl: string;
  selectedGame: PlatformGameType;
  authorizedFeedUrl?: string;
  authToken?: string;
}): Promise<{
  ok: boolean;
  connected: boolean;
  connection: PlatformConnection | null;
  steps: VerificationPipelineStep[];
  statusMessage: string;
  syncedCount: number;
}> {
  const { ok, data } = await fetchJsonWithOptimization<{
    connected?: boolean;
    connection?: PlatformConnection | null;
    steps?: VerificationPipelineStep[];
    statusMessage?: string;
    syncedCount?: number;
    error?: string;
  }>('/api/platforms/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 10000,
    body: JSON.stringify(payload),
  });
  invalidateNetworkCache('GET:/api/platforms');
  return {
    ok,
    connected: Boolean(data.connected),
    connection: data.connection ?? null,
    steps: data.steps ?? [],
    statusMessage:
      data.statusMessage || data.error || 'Verification did not complete.',
    syncedCount: data.syncedCount ?? 0,
  };
}

export async function refreshPlatformConnection(connectionId: string): Promise<{
  connected: boolean;
  connection?: PlatformConnection;
  steps?: VerificationPipelineStep[];
  statusMessage: string;
}> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    connected?: boolean;
    connection?: PlatformConnection;
    steps?: VerificationPipelineStep[];
    statusMessage?: string;
    error?: string;
  }>(`/api/platforms/connections/${encodeURIComponent(connectionId)}/refresh`, {
    method: 'POST',
    timeoutMs: 10000,
  });
  invalidateNetworkCache('GET:/api/platforms');
  if (!ok && !data.connection) {
    throw new Error(data.error || `Refresh failed (${status}).`);
  }
  return {
    connected: Boolean(data.connected),
    connection: data.connection,
    steps: data.steps,
    statusMessage: data.statusMessage || data.error || 'Refresh completed.',
  };
}

export async function reconnectPlatformConnection(
  connectionId: string,
  payload?: { authToken?: string; authorizedFeedUrl?: string }
): Promise<{
  connected: boolean;
  connection?: PlatformConnection;
  steps?: VerificationPipelineStep[];
  statusMessage: string;
}> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    connected?: boolean;
    connection?: PlatformConnection;
    steps?: VerificationPipelineStep[];
    statusMessage?: string;
    error?: string;
  }>(
    `/api/platforms/connections/${encodeURIComponent(connectionId)}/reconnect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 10000,
      body: JSON.stringify(payload ?? {}),
    }
  );
  invalidateNetworkCache('GET:/api/platforms');
  if (!ok && !data.connection) {
    throw new Error(data.error || `Reconnect failed (${status}).`);
  }
  return {
    connected: Boolean(data.connected),
    connection: data.connection,
    steps: data.steps,
    statusMessage: data.statusMessage || data.error || 'Reconnect attempted.',
  };
}

export async function disconnectPlatformConnection(
  connectionId: string
): Promise<PlatformConnection> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    connection?: PlatformConnection;
    error?: string;
  }>(
    `/api/platforms/connections/${encodeURIComponent(connectionId)}/disconnect`,
    {
      method: 'POST',
      timeoutMs: 6000,
    }
  );
  invalidateNetworkCache('GET:/api/platforms');
  if (!ok || !data.connection) {
    throw new Error(data.error || `Disconnect failed (${status}).`);
  }
  return data.connection;
}

export async function deletePlatformConnection(
  connectionId: string
): Promise<void> {
  const { ok, status, data } = await fetchJsonWithOptimization<{
    deleted?: boolean;
    error?: string;
  }>(`/api/platforms/connections/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
    timeoutMs: 6000,
  });
  invalidateNetworkCache('GET:/api/platforms');
  if (!ok) {
    throw new Error(data.error || `Delete failed (${status}).`);
  }
}
