import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

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
  bgr8Enabled: boolean;
  onewinEnabled: boolean;
  aiAnalysisEnabled: boolean;
  maxStoredSignals: number;
  maintenanceNotice: string;
  updatedAt: string;
}

interface ServerSignalEntry {
  id: string;
  platform: 'bgr8' | 'onewin';
  timestamp: string;
  trapsCount: number;
  recommendedCount: number;
  recommendedIndices: number[];
  uncertainIndices: number[];
  theoreticalSingleSafePct: number;
  theoreticalJointSurvivalPct: number;
  riskLevel: string;
  status: string;
  revealedSafeIndices: number[];
  revealedMineIndices: number[];
  engineMode: string;
  aiSummary: string;
  riskNote: string;
  sourceMode: string;
}

interface DatabaseSchema {
  signals: ServerSignalEntry[];
  activityLogs: ActivityLogEntry[];
  contactMessages: ContactMessage[];
  systemConfig: SystemSettingsRecord;
}

const DEFAULT_DB: DatabaseSchema = {
  signals: [],
  activityLogs: [],
  contactMessages: [],
  systemConfig: {
    bgr8Enabled: true,
    onewinEnabled: true,
    aiAnalysisEnabled: true,
    maxStoredSignals: 500,
    maintenanceNotice: '',
    updatedAt: new Date().toISOString(),
  },
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
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      activityLogs: Array.isArray(parsed.activityLogs)
        ? parsed.activityLogs
        : [],
      contactMessages: Array.isArray(parsed.contactMessages)
        ? parsed.contactMessages
        : [],
      systemConfig: {
        ...DEFAULT_DB.systemConfig,
        ...(parsed.systemConfig ?? {}),
      },
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
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or use Combinatorial Math mode.'
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

// Built-in lightweight gzip compression for JSON/text responses > 1KB
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
    bgr8Enabled: db.systemConfig.bgr8Enabled,
    onewinEnabled: db.systemConfig.onewinEnabled,
    aiAnalysisEnabled:
      db.systemConfig.aiAnalysisEnabled && Boolean(process.env.GEMINI_API_KEY),
    maintenanceNotice: db.systemConfig.maintenanceNotice,
    adminConfigured: Boolean(process.env.ADMIN_ACCESS_KEY?.trim()),
  });
});

// Signal Persistence Endpoints (Paginated Real File-Backed Node.js Storage)
app.get('/api/signals', (req, res) => {
  const db = readDb();
  const platform =
    req.query.platform === 'bgr8' || req.query.platform === 'onewin'
      ? req.query.platform
      : null;
  const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100) || 100));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

  const filtered = platform
    ? db.signals.filter((s) => s.platform === platform)
    : db.signals;

  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    signals: filtered.slice(offset, offset + limit),
    total: filtered.length,
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
    `Saved signal ${signal.id} (${signal.platform}, ${signal.trapsCount} traps).`
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
    res.status(404).json({ error: 'Signal not found on server.' });
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
  appendLog('info', 'signal_evaluated', `Updated outcome for signal ${id}.`);
  res.json({ signal: db.signals[targetIdx] });
});

app.delete('/api/signals/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.signals = db.signals.filter((s) => s.id !== id);
  writeDb(db);
  appendLog('info', 'signal_deleted', `Deleted signal ${id}.`);
  res.json({ deleted: true });
});

app.delete('/api/signals', (_req, res) => {
  const db = readDb();
  const count = db.signals.length;
  db.signals = [];
  writeDb(db);
  appendLog('info', 'signals_cleared', `Cleared ${count} stored signals.`);
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

// AI Analysis Endpoint
interface AnalyzeRequestBody {
  platform: 'bgr8' | 'onewin';
  trapsCount: number;
  recommendedCount: number;
  roundsAnalysedCount: number;
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
  sourceMode: string;
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
    const platformName = body.platform === 'onewin' ? '1win Mines' : 'BGR8 Mines';
    const trapsCount = Math.max(1, Math.min(24, Number(body.trapsCount || 3)));
    const recommendedCount = Math.max(
      1,
      Math.min(25 - trapsCount, Number(body.recommendedCount || 4))
    );

    const ai = getGeminiClient();

    const prompt = [
      `You are the probability and signal analysis engine for ${platformName} (5x5 grid, 25 tiles indexed 0..24).`,
      'Strict rules:',
      '1. Never claim to know hidden server-side mine locations or RNG seeds.',
      '2. Never label any unknown tile as a confirmed mine.',
      '3. Never fabricate a 90% accuracy rating or guarantee wins.',
      '4. recommendedIndices (GREEN) and uncertainIndices (ORANGE) must be mutually disjoint integers in 0..24.',
      '5. recommendedIndices must be ordered as the suggested selection path.',
      '',
      `Platform: ${platformName}`,
      `Trap Configuration: ${trapsCount} traps on 25 tiles, ${recommendedCount} recommended steps.`,
      `Theoretical Single-Tile Safety: ${body.theoreticalSingleSafePct}%`,
      `Theoretical Joint Survival (${recommendedCount} steps): ${body.theoreticalJointSurvivalPct}%`,
      `Risk Tier: ${body.riskLevel}`,
      `Rounds Window Analysed: ${body.roundsAnalysedCount} (${body.evaluatedRoundsCount} evaluated)`,
      `Measured Safe-Selection Rate: ${
        body.measuredSafeRatePct === null
          ? 'No evaluated rounds yet'
          : `${body.measuredSafeRatePct}%`
      }`,
      `Baseline Recommended Path Candidates (ordered): ${JSON.stringify(
        body.candidateSafeIndices
      )}`,
      `Baseline Uncertain Variance Candidates (ORANGE): ${JSON.stringify(
        body.candidateUncertainIndices
      )}`,
      `Observed Empirical Tile History: ${JSON.stringify(
        body.empiricalHighlights ?? []
      )}`,
      `Integration Mode: ${body.sourceMode}`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Respond strictly in JSON matching the requested schema. Keep summaries concise (2-3 crisp sentences), mathematically honest, and transparent about independent RNG.',
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
      `Generated AI analysis for ${platformName} (${trapsCount} traps).`
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

// Platform Endpoint Probe
app.post('/api/bgr8/probe', async (req, res) => {
  const payload = req.body as Record<string, unknown>;
  if ('password' in payload || 'pass' in payload) {
    res.status(400).json({
      error:
        'Security policy: platform passwords are never accepted, transmitted, or stored.',
    });
    return;
  }

  const platform = payload.platform === 'onewin' ? '1win Mines' : 'BGR8 Mines';
  const gameUrl = typeof payload.gameUrl === 'string' ? payload.gameUrl.trim() : '';
  const apiEndpoint =
    typeof payload.apiEndpoint === 'string' ? payload.apiEndpoint.trim() : '';
  const targetToProbe = apiEndpoint || gameUrl;

  if (!targetToProbe) {
    res.json({
      validUrl: false,
      reachable: false,
      statusCode: null,
      latencyMs: null,
      normalizedDomain: null,
      message: `${platform} integration requires a valid endpoint or game URL. Missing authorization/configuration.`,
      checkedAt: new Date().toISOString(),
      capabilities: ['manual_input'],
    });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetToProbe);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('Invalid protocol');
    }
  } catch {
    res.json({
      validUrl: false,
      reachable: false,
      statusCode: null,
      latencyMs: null,
      normalizedDomain: null,
      message: 'Invalid URL format. Include https:// or http://.',
      checkedAt: new Date().toISOString(),
      capabilities: ['manual_input'],
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const probeRes = await fetch(parsedUrl.toString(), {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startedAt;
    appendLog(
      'info',
      'platform_probe',
      `${platform} endpoint ${parsedUrl.hostname} returned HTTP ${probeRes.status} (${latencyMs}ms).`
    );

    res.json({
      validUrl: true,
      reachable: probeRes.status < 500,
      statusCode: probeRes.status,
      latencyMs,
      normalizedDomain: parsedUrl.hostname,
      message: `${platform} endpoint responded with HTTP ${probeRes.status} in ${latencyMs}ms.`,
      checkedAt: new Date().toISOString(),
      capabilities: ['read_only_metadata', 'round_sync', 'manual_input'],
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      err instanceof Error ? err.message : 'Network request could not reach host.';
    appendLog(
      'warn',
      'platform_probe',
      `${platform} endpoint ${parsedUrl.hostname} unreachable: ${reason}`
    );

    res.json({
      validUrl: true,
      reachable: false,
      statusCode: null,
      latencyMs,
      normalizedDomain: parsedUrl.hostname,
      message: `URL is valid (${parsedUrl.hostname}), but remote host was unreachable (${reason}). Integration status remains unverified.`,
      checkedAt: new Date().toISOString(),
      capabilities: ['manual_input'],
    });
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
      directAccessEnabled: true,
    },
  });
});

app.put('/api/admin/config', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const body = req.body as Partial<SystemSettingsRecord>;
  const db = readDb();
  db.systemConfig = {
    bgr8Enabled:
      typeof body.bgr8Enabled === 'boolean'
        ? body.bgr8Enabled
        : db.systemConfig.bgr8Enabled,
    onewinEnabled:
      typeof body.onewinEnabled === 'boolean'
        ? body.onewinEnabled
        : db.systemConfig.onewinEnabled,
    aiAnalysisEnabled:
      typeof body.aiAnalysisEnabled === 'boolean'
        ? body.aiAnalysisEnabled
        : db.systemConfig.aiAnalysisEnabled,
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
  appendLog('info', 'admin_config', 'Administrator updated system configuration.');
  res.json({ systemConfig: db.systemConfig });
});

app.delete('/api/admin/logs', (req, res) => {
  if (!verifyAdminKey(req, res)) return;
  const db = readDb();
  db.activityLogs = [];
  writeDb(db);
  res.json({ cleared: true });
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
    console.log(`Universal Mines AI server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
