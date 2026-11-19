import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import fs from 'fs';
import path from 'path';
import type express from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, '.mb-session-secret');

let cachedSecret: Buffer | null = null;

function getServerSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    cachedSecret = crypto.createHash('sha256').update(envSecret).digest();
    return cachedSecret;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE)) {
      const hex = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (hex.length === 64) {
        cachedSecret = Buffer.from(hex, 'hex');
        return cachedSecret;
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, generated.toString('hex'), {
      encoding: 'utf8',
      mode: 0o600,
    });
    cachedSecret = generated;
    return cachedSecret;
  } catch {
    cachedSecret = crypto.randomBytes(32);
    return cachedSecret;
  }
}

export function encryptToken(plaintext: string): string {
  const secret = getServerSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(payload: string): string | null {
  try {
    const parts = payload.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, dataB64] = parts;
    const secret = getServerSecret();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      secret,
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const chunk of header.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    const k = chunk.slice(0, eq).trim();
    const v = chunk.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

const SESSION_COOKIE = 'mb_ws_session';

export function getOrCreateWorkspaceSession(
  req: express.Request,
  res: express.Response
): string {
  const secret = getServerSecret();
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE];

  if (rawToken) {
    const dot = rawToken.indexOf('.');
    if (dot > 0) {
      const id = rawToken.slice(0, dot);
      const sig = rawToken.slice(dot + 1);
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(id)
        .digest('base64url');
      if (
        /^[a-f0-9]{32}$/.test(id) &&
        sig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
      ) {
        return id;
      }
    }
  }

  const newId = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(newId)
    .digest('base64url');

  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';

  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(`${newId}.${sig}`)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (isHttps) {
    cookieParts.push('Secure');
  }

  res.append('Set-Cookie', cookieParts.join('; '));
  return newId;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests = 15,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::' || norm === '::1') return true;
  if (norm.startsWith('::ffff:')) {
    const mapped = norm.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) return isPrivateOrReservedIpv4(mapped);
    return true;
  }
  if (norm.startsWith('fe80:') || norm.startsWith('fc') || norm.startsWith('fd')) {
    return true;
  }
  if (norm.startsWith('ff')) return true; // multicast
  return false;
}

export function isPublicIpAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !isPrivateOrReservedIpv4(ip);
  if (family === 6) return !isPrivateOrReservedIpv6(ip);
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata.google.internal',
  '169.254.169.254',
]);

export interface ValidatedUrlResult {
  valid: boolean;
  normalizedUrl?: string;
  hostname?: string;
  reason?: string;
}

export function validateExternalHttpsUrl(rawInput: string): ValidatedUrlResult {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'Website URL is required.' };
  }
  if (trimmed.length > 512) {
    return { valid: false, reason: 'Website URL exceeds maximum length.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      reason: 'Invalid URL format. Provide a full https:// address.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: 'Only secure HTTPS URLs (https://) are permitted.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: 'URLs containing embedded credentials are rejected.',
    };
  }

  if (parsed.port && parsed.port !== '443') {
    return {
      valid: false,
      reason: 'Custom ports are blocked for outbound safety.',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253) {
    return { valid: false, reason: 'Invalid domain name.' };
  }

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.endsWith('.arpa')
  ) {
    return {
      valid: false,
      reason: 'Local, internal, or metadata hostnames are not permitted.',
    };
  }

  if (net.isIP(host) !== 0 || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
    return {
      valid: false,
      reason: 'Direct IP addresses are blocked. Use a valid public domain.',
    };
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
    return { valid: false, reason: 'Domain syntax is invalid.' };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    hostname: host,
  };
}

export function doesHostMatchAllowedDomains(
  hostname: string,
  allowedDomains: string[]
): boolean {
  const normHost = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normDomain = domain.toLowerCase().replace(/^www\./, '');
    return normHost === normDomain || normHost.endsWith(`.${normDomain}`);
  });
}

export async function assertPublicDnsResolution(
  hostname: string
): Promise<{ safe: boolean; resolvedIp?: string; reason?: string }> {
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { safe: false, reason: 'Domain could not be resolved via DNS.' };
    }
    for (const rec of records) {
      if (!isPublicIpAddress(rec.address)) {
        return {
          safe: false,
          reason: 'Domain resolved to a restricted/private IP range (SSRF blocked).',
        };
      }
    }
    return { safe: true, resolvedIp: records[0].address };
  } catch {
    return {
      safe: false,
      reason: 'Domain DNS lookup failed or host is unreachable.',
    };
  }
}
