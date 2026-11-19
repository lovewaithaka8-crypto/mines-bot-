import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  INITIAL_KENYAN_PLATFORMS,
  type PlatformDirectoryEntry,
} from './server/platformRegistry.ts';
import {
  executePlatformAdapterConnect,
  runPlatformHealthCheck,
  type ConnectionRealStatus,
  type SelectedPlatformGame,
  type SyncedAviatorRound,
  type SyncedMinesRound,
} from './server/platformAdapters.ts';
import {
  checkRateLimit,
  decryptToken,
  encryptToken,
  getOrCreateWorkspaceSession,
  validateExternalHttpsUrl,
} from './server/platformSecurity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'universal-mines-db.json');

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
}

interface ContactMessage {
  id: string;
  timestamp: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface SystemSettingsRecord {
  aiAnalysisEnabled: boolean;
  defaultSevenHourWindow: boolean;
  maxStoredSignals: number;
  maintenanceNotice: string;
  updatedAt: string;
}

interface ServerSignalEntry {
  id: string;
  timestamp: string;
  trapsCount: number;
  recommendedCount: number;
  roundsAnalysedCount?: number;
  windowLabel?: string;
  recommendedIndices: number[];
  uncertainIndices: number[];
  safePath?: Array<{
    step: number;
    index: number;
    row: number;
    col: number;
    coord: string;
    label: string;
    theoreticalConfidencePct: number;
  }>;
  tileConfidenceMap?: Record<number, number>;
  theoreticalSingleSafePct: number;
  theoreticalJointSurvivalPct: number;
  riskLevel: string;
  status: string;
  revealedSafeIndices: number[];
  revealedMineIndices: number[];
  engineMode: string;
  aiSummary: string;
  riskNote: string;
}

interface StoredPlatformConnection {
  id: string;
  workspaceOwnerId: string;
  platformId: string;
  platformName: string;
  shortCode: string;
  brandColor: string;
  websiteUrl: string;
  authorizedFeedUrl: string | null;
  selectedGame: SelectedPlatformGame;
  supportedGames: SelectedPlatformGame[];
  connectionStatus: ConnectionRealStatus;
  statusMessage: string;
  encryptedAuthToken: string | null;
  hasAuthToken: boolean;
  lastSyncAt: string | null;
  syncedRoundsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredMinesRoundRecord extends SyncedMinesRound {
  workspaceOwnerId: string;
}

interface StoredAviatorRoundRecord extends SyncedAviatorRound {
  workspaceOwnerId: string;
}

interface DatabaseSchema {
  signals: ServerSignalEntry[];
  activityLogs: ActivityLogEntry[];
  contactMessages: ContactMessage[];
  systemConfig: SystemSettingsRecord;
  platforms: PlatformDirectoryEntry[];
  platformConnections: StoredPlatformConnection[];
  syncedMinesRounds: StoredMinesRoundRecord[];
  syncedAviatorRounds: StoredAviatorRoundRecord[];
}

const DEFAULT_DB: DatabaseSchema = {
  signals: [],
  activityLogs: [],
  contactMessages: [],
  systemConfig: {
    aiAnalysisEnabled: true,
    defaultSevenHourWindow: true,
    maxStoredSignals: 500,
    maintenanceNotice: '',
    updatedAt: new Date().toISOString(),
  },
  platforms: structuredClone(INITIAL_KENYAN_PLATFORMS),
  platformConnections: [],
  syncedMinesRounds: [],
  syncedAviatorRounds: [],
};

function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return structuredClone(DEFAULT_DB);
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    const rawCfg = (parsed.systemConfig ?? {}) as Partial<SystemSettingsRecord>;
    const existingPlatforms = Array.isArray(parsed.platforms)
      ? parsed.platforms
      : [];
    const existingIds = new Set(existingPlatforms.map((p) => p.id));
    const mergedPlatforms = [
      ...existingPlatforms,
      ...INITIAL_KENYAN_PLATFORMS.filter((p) => !existingIds.has(p.id)),
    ];

    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      activityLogs: Array.isArray(parsed.activityLogs)
        ? parsed.activityLogs
        : [],
      contactMessages: Array.isArray(parsed.contactMessages)
        ? parsed.contactMessages
        : [],
      systemConfig: {
        aiAnalysisEnabled:
          typeof rawCfg.aiAnalysisEnabled === 'boolean'
            ? rawCfg.aiAnalysisEnabled
            : DEFAULT_DB.systemConfig.aiAnalysisEnabled,
        defaultSevenHourWindow:
          typeof rawCfg.defaultSevenHourWindow === 'boolean'
            ? rawCfg.defaultSevenHourWindow
            : DEFAULT_DB.systemConfig.defaultSevenHourWindow,
        maxStoredSignals:
          typeof rawCfg.maxStoredSignals === 'number'
            ? rawCfg.maxStoredSignals
            : DEFAULT_DB.systemConfig.maxStoredSignals,
        maintenanceNotice:
          typeof rawCfg.maintenanceNotice === 'string'
            ? rawCfg.maintenanceNotice
            : '',
        updatedAt:
          typeof rawCfg.updatedAt === 'string'
            ? rawCfg.updatedAt
            : new Date().toISOString(),
      },
      platforms: mergedPlatforms,
      platformConnections: Array.isArray(parsed.platformConnections)
        ? parsed.platformConnections
        : [],
      syncedMinesRounds: Array.isArray(parsed.syncedMinesRounds)
        ? parsed.syncedMinesRounds
        : [],
      syncedAviatorRounds: Array.isArray(parsed.syncedAviatorRounds)
        ? parsed.syncedAviatorRounds
        : [],
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

function writeDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function appendLog(
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string
): void {
  const db = readDb();
  const entry: ActivityLogEntry = {
    id: `LOG-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };
  db.activityLogs = [entry, ...db.activityLogs].slice(0, 250);
  writeDb(db);
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or use Combinatorial Math Only mode.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function verifyAdminKey(
  req: express.Request,
  res: express.Response
): boolean {
  const configuredKey = process.env.ADMIN_ACCESS_KEY;
  if (!configuredKey || !configuredKey.trim()) {
    res.status(503).json({
      error:
        'ADMIN_ACCESS_KEY is not configured on the server. Set ADMIN_ACCESS_KEY in environment secrets to enable Administration.',
      configured: false,
    });
    return false;
  }

  const provided = String(
    req.header('x-admin-key') ||
      req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
  ).trim();

  if (!provided) {
    res.status(401).json({
      error: 'Administrator key is required.',
      configured: true,
    });
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(configuredKey.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    appendLog('warn', 'admin_auth', 'Rejected invalid administrator key attempt.');
    res.status(403).json({
      error: 'Invalid administrator access key.',
      configured: true,
    });
    return false;
  }

  return true;
}

const app = express();
app.disable('x-powered-by');
app.set('etag', 'strong');

// Built-in lightweight gzip compression for JSON payloads > 1KB
app.use((req, res, next) => {
  const accept = String(req.headers['accept-encoding'] || '');
  if (!accept.includes('gzip')) {
    next();
    return;
  }

  const origJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const serialized = JSON.stringify(body);
    if (serialized.length < 1024) {
      return origJson(body);
    }
    zlib.gzip(Buffer.from(serialized, 'utf8'), (err, compressed) => {
      if (err || res.headersSent) {
        if (!res.headersSent) origJson(body);
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.send(compressed);
    });
    return res;
  }) as typeof res.json;

  next();
});

app.use(express.json({ limit: '1mb' }));

// Public System Status (non-sensitive capabilities only)
app.get('/api/system/status', (_req, res) => {
  const db = readDb();
  res.setHeader('Cache-Control', 'private, max-age=10');
  res.json({
    engineReady: true,
    aiAnalysisEnabled:
      db.systemConfig.aiAnalysisEnabled && Boolean(process.env.GEMINI_API_KEY),
    defaultSevenHourWindow: db.systemConfig.defaultSevenHourWindow,
    maintenanceNotice: db.systemConfig.maintenanceNotice,
    adminConfigured: Boolean(process.env.ADMIN_ACCESS_KEY?.trim()),
    storedSignalsCount: db.signals.length,
  });
});

// Signal Persistence Endpoints (Paginated Real File-Backed Node.js Storage)
app.get('/api/signals', (req, res) => {
  const db = readDb();
  const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100) || 100));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    signals: db.signals.slice(offset, offset + limit),
    total: db.signals.length,
    limit,
    offset,
  });
});

app.post('/api/signals', (req, res) => {
  const signal = req.body as ServerSignalEntry;
  if (!signal || !signal.id || !Array.isArray(signal.recommendedIndices)) {
    res.status(400).json({ error: 'Invalid signal payload.' });
    return;
  }
  const db = readDb();
  const limit = db.systemConfig.maxStoredSignals || 500;
  db.signals = [signal, ...db.signals.filter((s) => s.id !== signal.id)].slice(
    0,
    limit
  );
  writeDb(db);
  appendLog(
    'info',
    'signal_recorded',
    `Saved prediction ${signal.id} (${signal.trapsCount} mines, ${signal.windowLabel ?? '7h window'}).`
  );
  res.status(201).json({ signal });
});

app.patch('/api/signals/:id/outcome', (req, res) => {
  const { id } = req.params;
  const body = req.body as {
    revealedSafeIndices?: number[];
    revealedMineIndices?: number[];
    status?: string;
  };

  const db = readDb();
  const targetIdx = db.signals.findIndex((s) => s.id === id);
  if (targetIdx === -1) {
    res.status(404).json({ error: 'Prediction record not found on server.' });
    return;
  }

  db.signals[targetIdx] = {
    ...db.signals[targetIdx],
    revealedSafeIndices: Array.isArray(body.revealedSafeIndices)
      ? body.revealedSafeIndices
      : db.signals[targetIdx].revealedSafeIndices,
    revealedMineIndices: Array.isArray(body.revealedMineIndices)
      ? body.revealedMineIndices
      : db.signals[targetIdx].revealedMineIndices,
    status: body.status || db.signals[targetIdx].status,
  };
  writeDb(db);
  appendLog('info', 'signal_evaluated', `Updated verified outcome for ${id}.`);
  res.json({ signal: db.signals[targetIdx] });
});

app.delete('/api/signals/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.signals = db.signals.filter((s) => s.id !== id);
  writeDb(db);
  appendLog('info', 'signal_deleted', `Deleted prediction ${id}.`);
  res.json({ deleted: true });
});

app.delete('/api/signals', (_req, res) => {
  const db = readDb();
  const count = db.signals.length;
  db.signals = [];
  writeDb(db);
  appendLog('info', 'signals_cleared', `Cleared ${count} stored predictions.`);
  res.json({ cleared: true, count });
});

// Contact Support Endpoint
app.post('/api/contact', (req, res) => {
  const body = req.body as Partial<ContactMessage>;
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const subject = String(body.subject || 'Support Inquiry').trim();
  const message = String(body.message || '').trim();

  if (!name || !email || !email.includes('@') || message.length < 10) {
    res.status(400).json({
      error:
        'Provide your name, a valid email address, and a message (minimum 10 characters).',
    });
    return;
  }

  const db = readDb();
  const entry: ContactMessage = {
    id: `MSG-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    name,
    email,
    subject,
    message,
  };
  db.contactMessages = [entry, ...db.contactMessages].slice(0, 200);
  writeDb(db);
  appendLog('info', 'contact', `Received support message ${entry.id} from ${email}.`);

  res.status(201).json({
    id: entry.id,
    receivedAt: entry.timestamp,
    message: 'Support message recorded cleanly.',
  });
});

// Standalone Mines Bot AI Statistical Analysis Endpoint
interface AnalyzeRequestBody {
  trapsCount: number;
  recommendedCount: number;
  roundsAnalysedCount: number;
  windowLabel?: string;
  theoreticalSingleSafePct: number;
  theoreticalJointSurvivalPct: number;
  riskLevel: string;
  evaluatedRoundsCount: number;
  measuredSafeRatePct: number | null;
  candidateSafeIndices: number[];
  candidateUncertainIndices: number[];
  empiricalHighlights: Array<{
    coord: string;
    observedSafe: number;
    observedMine: number;
  }>;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const db = readDb();
    if (!db.systemConfig.aiAnalysisEnabled) {
      res.status(403).json({
        error: 'AI analysis is currently disabled by administrator configuration.',
      });
      return;
    }

    const body = req.body as AnalyzeRequestBody;
    const trapsCount = Math.max(1, Math.min(24, Number(body.trapsCount || 3)));
    const recommendedCount = Math.max(
      1,
      Math.min(25 - trapsCount, Number(body.recommendedCount || 4))
    );
    const windowLabel = body.windowLabel || 'Previous 7 Hours';

    const ai = getGeminiClient();

    const prompt = [
      'You are the statistical probability engine for Mines Bot (standalone 5x5 grid, 25 cells indexed 0..24).',
      'Strict rules:',
      '1. Never claim to know hidden mine locations or predict random outcomes with certainty.',
      '2. Never label any unknown cell as a confirmed mine.',
      '3. Never fabricate accuracy percentages or guarantee wins.',
      '4. recommendedIndices and uncertainIndices must be mutually disjoint integers in 0..24.',
      '5. recommendedIndices must be ordered as the suggested selection sequence.',
      '6. Clearly distinguish observed historical frequency from estimated future probability.',
      '',
      `Mine Configuration: ${trapsCount} mines on 25 cells, ${recommendedCount} recommended cells.`,
      `Theoretical Single-Cell Safety: ${body.theoreticalSingleSafePct}%`,
      `Theoretical Joint Survival (${recommendedCount} steps): ${body.theoreticalJointSurvivalPct}%`,
      `Risk Tier: ${body.riskLevel}`,
      `Analysis Window: ${windowLabel} (${body.roundsAnalysedCount} rounds, ${body.evaluatedRoundsCount} evaluated)`,
      `Verified Historical Safe Rate: ${
        body.measuredSafeRatePct === null
          ? 'No evaluated rounds recorded in this window yet'
          : `${body.measuredSafeRatePct}%`
      }`,
      `Baseline Recommended Candidates (ordered): ${JSON.stringify(
        body.candidateSafeIndices
      )}`,
      `Baseline Uncertain Variance Candidates: ${JSON.stringify(
        body.candidateUncertainIndices
      )}`,
      `Observed Historical Cell Frequencies: ${JSON.stringify(
        body.empiricalHighlights ?? []
      )}`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Respond strictly in JSON matching the requested schema. Keep summaries concise (2-3 clear sentences), mathematically accurate, and honest about the limitations of statistical estimates on independent random rounds.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedIndices: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            uncertainIndices: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            aiSummary: { type: Type.STRING },
            riskNote: { type: Type.STRING },
          },
          required: [
            'recommendedIndices',
            'uncertainIndices',
            'aiSummary',
            'riskNote',
          ],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      appendLog('error', 'ai_analysis', 'Gemini returned empty response.');
      res.status(502).json({ error: 'Gemini API returned an empty response.' });
      return;
    }

    const parsed = JSON.parse(rawText) as {
      recommendedIndices: number[];
      uncertainIndices: number[];
      aiSummary: string;
      riskNote: string;
    };

    const safePath: number[] = [];
    const used = new Set<number>();

    for (const idx of parsed.recommendedIndices ?? []) {
      if (
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx <= 24 &&
        !used.has(idx) &&
        safePath.length < recommendedCount
      ) {
        used.add(idx);
        safePath.push(idx);
      }
    }
    for (const fallbackIdx of body.candidateSafeIndices ?? []) {
      if (safePath.length >= recommendedCount) break;
      if (
        Number.isInteger(fallbackIdx) &&
        fallbackIdx >= 0 &&
        fallbackIdx <= 24 &&
        !used.has(fallbackIdx)
      ) {
        used.add(fallbackIdx);
        safePath.push(fallbackIdx);
      }
    }

    const uncertainIndices: number[] = [];
    const maxUncertain = Math.min(trapsCount, 25 - safePath.length);
    for (const idx of parsed.uncertainIndices ?? []) {
      if (
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx <= 24 &&
        !used.has(idx) &&
        uncertainIndices.length < maxUncertain
      ) {
        used.add(idx);
        uncertainIndices.push(idx);
      }
    }
    for (const fallbackUncertain of body.candidateUncertainIndices ?? []) {
      if (uncertainIndices.length >= maxUncertain) break;
      if (
        Number.isInteger(fallbackUncertain) &&
        fallbackUncertain >= 0 &&
        fallbackUncertain <= 24 &&
        !used.has(fallbackUncertain)
      ) {
        used.add(fallbackUncertain);
        uncertainIndices.push(fallbackUncertain);
      }
    }

    appendLog(
      'info',
      'ai_analysis',
      `Generated Mines Bot analysis (${trapsCount} mines, ${windowLabel}).`
    );

    res.json({
      recommendedIndices: safePath,
      uncertainIndices: uncertainIndices.sort((a, b) => a - b),
      aiSummary: parsed.aiSummary,
      riskNote: parsed.riskNote,
      model: 'gemini-4-hydrogen',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server analysis error.';
    appendLog('error', 'ai_analysis', message);
    const status = message.includes('GEMINI_API_KEY')
      ? 400
      : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
        ? 429
        : message.includes('403') || message.includes('PERMISSION_DENIED')
          ? 403
          : 500;
    res.status(status).json({ error: message });
  }
});

// Backend-Protected Administration Routes
app.get('/api/admin/overview', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  const errorLogs = db.activityLogs.filter((l) => l.level === 'error');
  res.json({
    databaseStats: {
      signalsStored: db.signals.length,
      activityLogsCount: db.activityLogs.length,
      errorLogsCount: errorLogs.length,
      contactMessagesCount: db.contactMessages.length,
      dbFileSizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
    },
    systemConfig: db.systemConfig,
    activityLogs: db.activityLogs.slice(0, 50),
    errorLogs: errorLogs.slice(0, 30),
    contactMessages: db.contactMessages.slice(0, 30),
    securityStatus: {
      geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      adminKeyConfigured: Boolean(process.env.ADMIN_ACCESS_KEY),
      standaloneMode: true,
    },
  });
});

app.put('/api/admin/config', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const body = req.body as Partial<SystemSettingsRecord>;
  const db = readDb();
  db.systemConfig = {
    aiAnalysisEnabled:
      typeof body.aiAnalysisEnabled === 'boolean'
        ? body.aiAnalysisEnabled
        : db.systemConfig.aiAnalysisEnabled,
    defaultSevenHourWindow:
      typeof body.defaultSevenHourWindow === 'boolean'
        ? body.defaultSevenHourWindow
        : db.systemConfig.defaultSevenHourWindow,
    maxStoredSignals: Math.max(
      50,
      Math.min(5000, Number(body.maxStoredSignals ?? db.systemConfig.maxStoredSignals))
    ),
    maintenanceNotice: String(
      body.maintenanceNotice ?? db.systemConfig.maintenanceNotice
    ).slice(0, 240),
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  appendLog('info', 'admin_config', 'Administrator updated Mines Bot configuration.');
  res.json({ systemConfig: db.systemConfig });
});

app.delete('/api/admin/logs', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  db.activityLogs = [];
  writeDb(db);
  res.json({ cleared: true });
});

/* ---------------- Kenyan Platform Directory & Integration Routes ---------------- */

function sanitizePlatformForPublic(p: PlatformDirectoryEntry) {
  return {
    id: p.id,
    name: p.name,
    shortCode: p.shortCode,
    brandColor: p.brandColor,
    officialWebsite: p.officialWebsite,
    allowedDomains: p.allowedDomains,
    bclbStatus: p.bclbStatus,
    licenseNumber: p.licenseNumber,
    availabilityStatus: p.availabilityStatus,
    minesCompatibility: p.minesCompatibility,
    aviatorCompatibility: p.aviatorCompatibility,
    adapterId: p.adapterId,
    adapterType: p.adapterType,
    hasConfiguredFeed: Boolean(p.feedEndpoint),
    enabled: p.enabled,
    healthStatus: p.healthStatus,
    lastHealthCheckAt: p.lastHealthCheckAt,
    notes: p.notes,
    isCustomSlot: Boolean(p.isCustomSlot),
    updatedAt: p.updatedAt,
  };
}

function sanitizeConnectionForClient(c: StoredPlatformConnection) {
  return {
    id: c.id,
    platformId: c.platformId,
    platformName: c.platformName,
    shortCode: c.shortCode,
    brandColor: c.brandColor,
    websiteUrl: c.websiteUrl,
    authorizedFeedUrl: c.authorizedFeedUrl,
    selectedGame: c.selectedGame,
    supportedGames: c.supportedGames,
    connectionStatus: c.connectionStatus,
    statusMessage: c.statusMessage,
    hasAuthToken: c.hasAuthToken,
    lastSyncAt: c.lastSyncAt,
    syncedRoundsCount: c.syncedRoundsCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

app.get('/api/platforms', (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const db = readDb();
  const userConnections = db.platformConnections.filter(
    (c) => c.workspaceOwnerId === workspaceId
  );
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    platforms: db.platforms.map(sanitizePlatformForPublic),
    userConnectionsCount: userConnections.length,
  });
});

app.get('/api/platforms/connections', (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const db = readDb();
  const connections = db.platformConnections
    .filter((c) => c.workspaceOwnerId === workspaceId)
    .map(sanitizeConnectionForClient);
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ connections });
});

app.get('/api/platforms/synced-data', (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const db = readDb();
  const minesRounds = db.syncedMinesRounds
    .filter((r) => r.workspaceOwnerId === workspaceId)
    .map(({ workspaceOwnerId: _owner, ...rest }) => rest);
  const aviatorRounds = db.syncedAviatorRounds
    .filter((r) => r.workspaceOwnerId === workspaceId)
    .map(({ workspaceOwnerId: _owner, ...rest }) => rest);

  res.setHeader('Cache-Control', 'no-cache');
  res.json({ minesRounds, aviatorRounds });
});

app.post('/api/platforms/connect', async (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const limitCheck = checkRateLimit(`connect:${workspaceId}`, 12, 60_000);
  if (!limitCheck.allowed) {
    res.status(429).json({
      error: `Too many connection attempts. Try again in ${limitCheck.retryAfterSec}s.`,
    });
    return;
  }

  const body = req.body as {
    platformId?: string;
    customPlatformName?: string;
    websiteUrl?: string;
    selectedGame?: SelectedPlatformGame;
    authorizedFeedUrl?: string;
    authToken?: string;
  };

  const platformId = String(body.platformId || '').trim();
  const selectedGame: SelectedPlatformGame =
    body.selectedGame === 'aviator' ? 'aviator' : 'mines';
  const websiteUrl = String(body.websiteUrl || '').trim();
  const authorizedFeedUrl = String(body.authorizedFeedUrl || '').trim() || null;
  const rawToken = String(body.authToken || '').trim() || null;

  const db = readDb();
  const platform = db.platforms.find((p) => p.id === platformId);
  if (!platform) {
    res.status(404).json({ error: 'Selected platform not found in directory.' });
    return;
  }

  const connectionId = `CONN-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const result = await executePlatformAdapterConnect({
    platform,
    websiteUrl,
    selectedGame,
    authorizedFeedUrl,
    authToken: rawToken,
    connectionId,
  });

  // Update platform health if its configured feed was exercised
  if (platform.feedEndpoint) {
    const pIdx = db.platforms.findIndex((p) => p.id === platform.id);
    if (pIdx !== -1) {
      db.platforms[pIdx] = {
        ...db.platforms[pIdx],
        healthStatus: result.connected ? 'Healthy' : 'Degraded',
        lastHealthCheckAt: new Date().toISOString(),
      };
    }
  }

  const now = new Date().toISOString();
  const supportedGames: SelectedPlatformGame[] = [];
  if (platform.minesCompatibility !== 'Unsupported') supportedGames.push('mines');
  if (platform.aviatorCompatibility !== 'Unsupported') supportedGames.push('aviator');

  const displayName =
    platform.isCustomSlot && body.customPlatformName?.trim()
      ? body.customPlatformName.trim().slice(0, 60)
      : platform.name;

  const urlParsed = validateExternalHttpsUrl(websiteUrl);
  const connectionRecord: StoredPlatformConnection = {
    id: connectionId,
    workspaceOwnerId: workspaceId,
    platformId: platform.id,
    platformName: displayName,
    shortCode: platform.shortCode,
    brandColor: platform.brandColor,
    websiteUrl: urlParsed.normalizedUrl || websiteUrl,
    authorizedFeedUrl,
    selectedGame,
    supportedGames: supportedGames.length > 0 ? supportedGames : [selectedGame],
    connectionStatus: result.connectionStatus,
    statusMessage: result.statusMessage,
    encryptedAuthToken: rawToken ? encryptToken(rawToken) : null,
    hasAuthToken: Boolean(rawToken),
    lastSyncAt: result.connected ? now : null,
    syncedRoundsCount: result.minesRounds.length + result.aviatorRounds.length,
    createdAt: now,
    updatedAt: now,
  };

  // Only persist connection entry if URL itself was syntactically valid & safe host
  const urlStepPassed =
    result.steps.find((s) => s.key === 'url_validation')?.status === 'passed' &&
    result.steps.find((s) => s.key === 'domain_match')?.status === 'passed' &&
    result.steps.find((s) => s.key === 'ssrf_dns_check')?.status === 'passed';

  if (urlStepPassed) {
    db.platformConnections = [
      connectionRecord,
      ...db.platformConnections,
    ].slice(0, 200);

    if (result.minesRounds.length > 0) {
      const taggedMines = result.minesRounds.map((r) => ({
        ...r,
        workspaceOwnerId: workspaceId,
      }));
      db.syncedMinesRounds = [...taggedMines, ...db.syncedMinesRounds].slice(
        0,
        1000
      );
    }

    if (result.aviatorRounds.length > 0) {
      const taggedAviator = result.aviatorRounds.map((r) => ({
        ...r,
        workspaceOwnerId: workspaceId,
      }));
      db.syncedAviatorRounds = [
        ...taggedAviator,
        ...db.syncedAviatorRounds,
      ].slice(0, 1500);
    }
    writeDb(db);
  }

  appendLog(
    result.connected ? 'info' : 'warn',
    'platform_connect',
    `${displayName} (${selectedGame}) -> ${result.connectionStatus}: ${result.statusMessage}`
  );

  res.status(urlStepPassed ? 200 : 400).json({
    connected: result.connected,
    connection: urlStepPassed ? sanitizeConnectionForClient(connectionRecord) : null,
    steps: result.steps,
    statusMessage: result.statusMessage,
    syncedCount: result.minesRounds.length + result.aviatorRounds.length,
  });
});

app.post('/api/platforms/connections/:id/refresh', async (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const limitCheck = checkRateLimit(`refresh:${workspaceId}`, 20, 60_000);
  if (!limitCheck.allowed) {
    res.status(429).json({
      error: `Rate limit reached. Retry in ${limitCheck.retryAfterSec}s.`,
    });
    return;
  }

  const db = readDb();
  const idx = db.platformConnections.findIndex(
    (c) => c.id === req.params.id && c.workspaceOwnerId === workspaceId
  );
  if (idx === -1) {
    res.status(404).json({ error: 'Connection not found in your workspace.' });
    return;
  }

  const conn = db.platformConnections[idx];
  if (conn.connectionStatus === 'Disconnected') {
    res.status(400).json({
      error: 'Connection is disconnected. Use Reconnect first.',
    });
    return;
  }

  const platform = db.platforms.find((p) => p.id === conn.platformId);
  if (!platform) {
    res.status(404).json({ error: 'Platform registry entry missing.' });
    return;
  }

  const token = conn.encryptedAuthToken
    ? decryptToken(conn.encryptedAuthToken)
    : null;

  const result = await executePlatformAdapterConnect({
    platform,
    websiteUrl: conn.websiteUrl,
    selectedGame: conn.selectedGame,
    authorizedFeedUrl: conn.authorizedFeedUrl,
    authToken: token,
    connectionId: conn.id,
  });

  const now = new Date().toISOString();
  const nextStatus: ConnectionRealStatus =
    result.httpStatus === 401 || result.httpStatus === 403
      ? 'Expired'
      : result.connectionStatus;

  if (result.minesRounds.length > 0) {
    const existingIds = new Set(
      db.syncedMinesRounds
        .filter((r) => r.workspaceOwnerId === workspaceId)
        .map((r) => r.id)
    );
    const additions = result.minesRounds
      .filter((r) => !existingIds.has(r.id))
      .map((r) => ({ ...r, workspaceOwnerId: workspaceId }));
    db.syncedMinesRounds = [...additions, ...db.syncedMinesRounds].slice(
      0,
      1000
    );
  }

  if (result.aviatorRounds.length > 0) {
    const existingIds = new Set(
      db.syncedAviatorRounds
        .filter((r) => r.workspaceOwnerId === workspaceId)
        .map((r) => r.id)
    );
    const additions = result.aviatorRounds
      .filter((r) => !existingIds.has(r.id))
      .map((r) => ({ ...r, workspaceOwnerId: workspaceId }));
    db.syncedAviatorRounds = [...additions, ...db.syncedAviatorRounds].slice(
      0,
      1500
    );
  }

  const totalSyncedForConn =
    db.syncedMinesRounds.filter(
      (r) => r.workspaceOwnerId === workspaceId && r.connectionId === conn.id
    ).length +
    db.syncedAviatorRounds.filter(
      (r) => r.workspaceOwnerId === workspaceId && r.connectionId === conn.id
    ).length;

  db.platformConnections[idx] = {
    ...conn,
    connectionStatus: nextStatus,
    statusMessage: result.statusMessage,
    lastSyncAt: result.connected ? now : conn.lastSyncAt,
    syncedRoundsCount: totalSyncedForConn,
    updatedAt: now,
  };
  writeDb(db);

  res.json({
    connected: result.connected,
    connection: sanitizeConnectionForClient(db.platformConnections[idx]),
    steps: result.steps,
    statusMessage: result.statusMessage,
  });
});

app.post('/api/platforms/connections/:id/reconnect', async (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const body = (req.body || {}) as {
    authToken?: string;
    authorizedFeedUrl?: string;
  };
  const db = readDb();
  const idx = db.platformConnections.findIndex(
    (c) => c.id === req.params.id && c.workspaceOwnerId === workspaceId
  );
  if (idx === -1) {
    res.status(404).json({ error: 'Connection not found in your workspace.' });
    return;
  }

  const conn = db.platformConnections[idx];
  const platform = db.platforms.find((p) => p.id === conn.platformId);
  if (!platform) {
    res.status(404).json({ error: 'Platform entry missing.' });
    return;
  }

  const nextToken = body.authToken?.trim()
    ? body.authToken.trim()
    : conn.encryptedAuthToken
      ? decryptToken(conn.encryptedAuthToken)
      : null;
  const nextFeedUrl = body.authorizedFeedUrl?.trim()
    ? body.authorizedFeedUrl.trim()
    : conn.authorizedFeedUrl;

  const result = await executePlatformAdapterConnect({
    platform,
    websiteUrl: conn.websiteUrl,
    selectedGame: conn.selectedGame,
    authorizedFeedUrl: nextFeedUrl,
    authToken: nextToken,
    connectionId: conn.id,
  });

  const now = new Date().toISOString();
  db.platformConnections[idx] = {
    ...conn,
    authorizedFeedUrl: nextFeedUrl,
    encryptedAuthToken: nextToken ? encryptToken(nextToken) : null,
    hasAuthToken: Boolean(nextToken),
    connectionStatus: result.connectionStatus,
    statusMessage: result.statusMessage,
    lastSyncAt: result.connected ? now : conn.lastSyncAt,
    updatedAt: now,
  };
  writeDb(db);

  res.json({
    connected: result.connected,
    connection: sanitizeConnectionForClient(db.platformConnections[idx]),
    steps: result.steps,
    statusMessage: result.statusMessage,
  });
});

app.post('/api/platforms/connections/:id/disconnect', (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const db = readDb();
  const idx = db.platformConnections.findIndex(
    (c) => c.id === req.params.id && c.workspaceOwnerId === workspaceId
  );
  if (idx === -1) {
    res.status(404).json({ error: 'Connection not found in your workspace.' });
    return;
  }
  db.platformConnections[idx] = {
    ...db.platformConnections[idx],
    connectionStatus: 'Disconnected',
    statusMessage: 'Disconnected by user.',
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  res.json({
    connection: sanitizeConnectionForClient(db.platformConnections[idx]),
  });
});

app.delete('/api/platforms/connections/:id', (req, res) => {
  const workspaceId = getOrCreateWorkspaceSession(req, res);
  const db = readDb();
  const target = db.platformConnections.find(
    (c) => c.id === req.params.id && c.workspaceOwnerId === workspaceId
  );
  if (!target) {
    res.status(404).json({ error: 'Connection not found in your workspace.' });
    return;
  }
  db.platformConnections = db.platformConnections.filter(
    (c) => !(c.id === req.params.id && c.workspaceOwnerId === workspaceId)
  );
  db.syncedMinesRounds = db.syncedMinesRounds.filter(
    (r) => !(r.connectionId === req.params.id && r.workspaceOwnerId === workspaceId)
  );
  db.syncedAviatorRounds = db.syncedAviatorRounds.filter(
    (r) => !(r.connectionId === req.params.id && r.workspaceOwnerId === workspaceId)
  );
  writeDb(db);
  appendLog('info', 'platform_deleted', `Removed private connection ${target.platformName}.`);
  res.json({ deleted: true });
});

/* ---------------- Admin Platform Management (ADMIN_ACCESS_KEY Protected) ---------------- */

app.get('/api/admin/platforms', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  const syncErrors = db.activityLogs.filter(
    (l) =>
      l.category === 'platform_connect' ||
      l.category === 'platform_health' ||
      l.level === 'error'
  );
  res.json({
    platforms: db.platforms,
    syncErrors: syncErrors.slice(0, 40),
  });
});

app.post('/api/admin/platforms', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const body = req.body as Partial<PlatformDirectoryEntry>;
  const name = String(body.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Platform name is required.' });
    return;
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const db = readDb();
  const id = db.platforms.some((p) => p.id === slug)
    ? `${slug}-${Date.now().toString(36)}`
    : slug || `plat-${Date.now().toString(36)}`;

  const entry: PlatformDirectoryEntry = {
    id,
    name,
    shortCode: (body.shortCode || name.slice(0, 2)).toUpperCase().slice(0, 3),
    brandColor: body.brandColor || '#00D98B',
    officialWebsite: body.officialWebsite?.trim() || null,
    allowedDomains: Array.isArray(body.allowedDomains)
      ? body.allowedDomains.map((d) => String(d).trim()).filter(Boolean)
      : [],
    bclbStatus: body.bclbStatus || 'Pending Verification',
    licenseNumber: String(body.licenseNumber || '').trim(),
    availabilityStatus: body.availabilityStatus || 'Active Candidate',
    minesCompatibility: body.minesCompatibility || 'Under verification',
    aviatorCompatibility: body.aviatorCompatibility || 'Under verification',
    adapterId: body.adapterId || `${id}-adapter`,
    adapterType: body.adapterType || 'none',
    feedEndpoint: body.feedEndpoint?.trim() || null,
    enabled: body.enabled ?? true,
    healthStatus: body.feedEndpoint ? 'Not Configured' : 'Not Configured',
    lastHealthCheckAt: null,
    notes: String(body.notes || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  db.platforms = [...db.platforms, entry];
  writeDb(db);
  appendLog('info', 'admin_platform_add', `Added platform directory entry ${entry.name}.`);
  res.status(201).json({ platform: entry });
});

app.put('/api/admin/platforms/:id', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const body = req.body as Partial<PlatformDirectoryEntry>;
  const db = readDb();
  const idx = db.platforms.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Platform entry not found.' });
    return;
  }

  const current = db.platforms[idx];
  if (body.feedEndpoint && body.feedEndpoint.trim()) {
    const check = validateExternalHttpsUrl(body.feedEndpoint.trim());
    if (!check.valid) {
      res.status(400).json({ error: check.reason || 'Invalid feed endpoint URL.' });
      return;
    }
  }

  const updated: PlatformDirectoryEntry = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() || current.name : current.name,
    shortCode:
      body.shortCode !== undefined
        ? String(body.shortCode).toUpperCase().slice(0, 3) || current.shortCode
        : current.shortCode,
    brandColor: body.brandColor ?? current.brandColor,
    officialWebsite:
      body.officialWebsite !== undefined
        ? body.officialWebsite?.trim() || null
        : current.officialWebsite,
    allowedDomains: Array.isArray(body.allowedDomains)
      ? body.allowedDomains.map((d) => String(d).trim()).filter(Boolean)
      : current.allowedDomains,
    bclbStatus: body.bclbStatus ?? current.bclbStatus,
    licenseNumber:
      body.licenseNumber !== undefined
        ? String(body.licenseNumber).trim()
        : current.licenseNumber,
    availabilityStatus: body.availabilityStatus ?? current.availabilityStatus,
    minesCompatibility: body.minesCompatibility ?? current.minesCompatibility,
    aviatorCompatibility: body.aviatorCompatibility ?? current.aviatorCompatibility,
    adapterId: body.adapterId ?? current.adapterId,
    adapterType: body.adapterType ?? current.adapterType,
    feedEndpoint:
      body.feedEndpoint !== undefined
        ? body.feedEndpoint?.trim() || null
        : current.feedEndpoint,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    healthStatus:
      body.enabled === false
        ? 'Disabled'
        : body.healthStatus ?? current.healthStatus,
    notes: body.notes !== undefined ? String(body.notes).trim() : current.notes,
    updatedAt: new Date().toISOString(),
  };

  db.platforms[idx] = updated;
  writeDb(db);
  appendLog('info', 'admin_platform_edit', `Updated platform ${updated.name}.`);
  res.json({ platform: updated });
});

app.delete('/api/admin/platforms/:id', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  const target = db.platforms.find((p) => p.id === req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Platform not found.' });
    return;
  }
  db.platforms = db.platforms.filter((p) => p.id !== req.params.id);
  writeDb(db);
  appendLog('info', 'admin_platform_delete', `Removed directory entry ${target.name}.`);
  res.json({ deleted: true });
});

app.post('/api/admin/platforms/:id/health-check', async (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  const idx = db.platforms.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Platform not found.' });
    return;
  }
  const check = await runPlatformHealthCheck(db.platforms[idx]);
  db.platforms[idx] = {
    ...db.platforms[idx],
    healthStatus: check.healthStatus,
    lastHealthCheckAt: new Date().toISOString(),
  };
  writeDb(db);
  appendLog(
    check.healthStatus === 'Degraded' ? 'warn' : 'info',
    'platform_health',
    `${db.platforms[idx].name} health: ${check.healthStatus} (${check.detail})`
  );
  res.json({ platform: db.platforms[idx], detail: check.detail });
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Mines Bot server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
