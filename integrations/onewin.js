/**
 * Independent 1win Mines Integration Module (/integrations/onewin.js)
 * Supports authorized visible game-state synchronization, trap count mapping,
 * and user-authorized screen-reading capture for 1win Mines.
 * Never bypasses authentication, manipulates requests, or accesses hidden mines.
 */

export const ONEWIN_PLATFORM_META = {
  id: 'onewin',
  name: '1win Mines',
  gridSize: 25,
  minTraps: 1,
  maxTraps: 24,
  presetTraps: [1, 3, 5, 7],
  houseEdgeFactor: 0.97,
  supportsOfficialApi: false,
  defaultGameUrl: 'https://1win.example/casino/play/mines',
};

/**
 * Validates a supported 1win Mines URL without credentials.
 * @param {string} rawUrl
 */
export function validateOnewinUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, normalized: '', reason: 'Enter a 1win Mines game URL.' };
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
 * Probes an authorized 1win endpoint through the local proxy without credentials.
 * @param {object} config
 */
export async function probeOnewinEndpoint(config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('/api/bgr8/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        platform: 'onewin',
        gameUrl: String(config.gameUrl || '').trim(),
        apiEndpoint: String(config.apiEndpoint || '').trim(),
        integrationMode: config.integrationMode || 'manual_observation',
        publicSessionId: String(config.publicSessionId || '').trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to probe 1win endpoint.');
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parses visible 1win Mines round state (manual input or authorized screen-reader capture).
 * Strictly rejects any hidden mine seeds or unauthorized server fields.
 * @param {string} rawJson
 */
export function parseOnewinVisibleState(rawJson) {
  const trimmed = String(rawJson || '').trim();
  if (!trimmed) {
    return { error: 'Provide a visible 1win Mines round JSON snapshot.' };
  }
  try {
    const obj = JSON.parse(trimmed);
    if ('hiddenMines' in obj || 'serverSeed' in obj || 'rngSeed' in obj || 'trapsMap' in obj) {
      return { error: 'Rejected: hidden server-side trap fields are strictly prohibited.' };
    }

    const roundId =
      typeof obj.roundId === 'string' && obj.roundId.trim()
        ? obj.roundId.trim()
        : `1WIN-${Date.now().toString().slice(-6)}`;

    const trapsCount = Math.max(1, Math.min(24, Number(obj.trapsCount ?? obj.traps ?? obj.mines ?? 3)));
    const sanitizeIndices = (arr) =>
      Array.isArray(arr)
        ? Array.from(new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 24)))
        : [];

    return {
      snapshot: {
        platform: 'onewin',
        roundId,
        trapsCount,
        revealedSafeIndices: sanitizeIndices(obj.revealedSafeIndices ?? obj.openedGems),
        revealedMineIndices: sanitizeIndices(obj.revealedMineIndices ?? obj.revealedTraps),
        syncedAt: new Date().toISOString(),
        source: obj.source === 'screen_reader' ? 'screen_reader' : 'manual',
      },
    };
  } catch {
    return {
      error: 'Invalid JSON. Example: {"roundId":"1WIN-908","trapsCount":3,"revealedSafeIndices":[2,8]}',
    };
  }
}
