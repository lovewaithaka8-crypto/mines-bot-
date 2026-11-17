/**
 * Independent BGR8 Mines Integration Module (/integrations/bgr8.js)
 * Supports authorized endpoint verification, visible game-state parsing,
 * trap synchronization, and user-authorized screen-reading snapshots.
 * Never bypasses authentication or accesses hidden server-side mine locations.
 */

export const BGR8_PLATFORM_META = {
  id: 'bgr8',
  name: 'BGR8 Mines',
  gridSize: 25,
  minTraps: 1,
  maxTraps: 24,
  houseEdgeFactor: 0.99,
  supportsOfficialApi: false,
  defaultGameUrl: 'https://bgr8.example/games/mines',
};

/**
 * Validates a supported BGR8 game or API URL without storing credentials.
 * @param {string} rawUrl
 */
export function validateBgr8Url(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, normalized: '', reason: 'Enter a BGR8 game URL.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, normalized: '', reason: 'Only HTTP/HTTPS URLs are supported.' };
    }
    parsed.username = '';
    parsed.password = '';
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, normalized: '', reason: 'Invalid URL format.' };
  }
}

/**
 * Probes an authorized BGR8 endpoint through the local proxy without credentials.
 * @param {object} config
 */
export async function probeBgr8Endpoint(config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('/api/bgr8/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        platform: 'bgr8',
        gameUrl: String(config.gameUrl || '').trim(),
        apiEndpoint: String(config.apiEndpoint || '').trim(),
        integrationMode: config.integrationMode || 'manual_observation',
        publicSessionId: String(config.publicSessionId || '').trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to probe BGR8 endpoint.');
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses visible BGR8 game state (manual input or authorized screen-reader capture).
 * Strictly rejects any hidden mine seeds or unauthorized server payload fields.
 * @param {string} rawJson
 */
export function parseBgr8VisibleState(rawJson) {
  const trimmed = String(rawJson || '').trim();
  if (!trimmed) {
    return { error: 'Provide a visible BGR8 round JSON snapshot.' };
  }
  try {
    const obj = JSON.parse(trimmed);
    if ('hiddenMines' in obj || 'serverSeed' in obj || 'rngSeed' in obj || 'minesLayout' in obj) {
      return { error: 'Rejected: hidden server-side mine fields are strictly prohibited.' };
    }

    const roundId =
      typeof obj.roundId === 'string' && obj.roundId.trim()
        ? obj.roundId.trim()
        : `BGR8-${Date.now().toString().slice(-6)}`;

    const trapsCount = Math.max(1, Math.min(24, Number(obj.trapsCount ?? obj.minesCount ?? obj.mines ?? 3)));
    const sanitizeIndices = (arr) =>
      Array.isArray(arr)
        ? Array.from(new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 24)))
        : [];

    return {
      snapshot: {
        platform: 'bgr8',
        roundId,
        trapsCount,
        revealedSafeIndices: sanitizeIndices(obj.revealedSafeIndices ?? obj.openedGems),
        revealedMineIndices: sanitizeIndices(obj.revealedMineIndices ?? obj.revealedBombs),
        syncedAt: new Date().toISOString(),
        source: obj.source === 'screen_reader' ? 'screen_reader' : 'manual',
      },
    };
  } catch {
    return {
      error: 'Invalid JSON. Example: {"roundId":"BGR8-401","trapsCount":3,"revealedSafeIndices":[1,7]}',
    };
  }
}
