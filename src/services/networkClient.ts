import { performanceMonitor } from './performanceMonitor.ts';

export interface NetworkRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}

interface CacheEntry {
  expiresAt: number;
  payload: unknown;
}

const getResponseCache = new Map<string, CacheEntry>();

export function invalidateNetworkCache(prefix?: string): void {
  if (!prefix) {
    getResponseCache.clear();
    return;
  }
  for (const key of getResponseCache.keys()) {
    if (key.startsWith(prefix)) {
      getResponseCache.delete(key);
    }
  }
}

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function fetchJsonWithOptimization<T>(
  url: string,
  options: NetworkRequestOptions = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const {
    timeoutMs = 8000,
    retries = (options.method ?? 'GET').toUpperCase() === 'GET' ? 2 : 0,
    retryDelayMs = 250,
    cacheTtlMs = 0,
    signal: externalSignal,
    ...fetchInit
  } = options;

  const method = (fetchInit.method ?? 'GET').toUpperCase();
  const cacheKey = `${method}:${url}`;

  if (method === 'GET' && cacheTtlMs > 0) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, status: 200, data: cached.payload as T };
    }
    if (cached) {
      getResponseCache.delete(cacheKey);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Network offline. Check your connection and try again.');
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const controller = new AbortController();
    let timedOut = false;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const startedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });

      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        startedAt;
      performanceMonitor.recordApiTiming(url.split('?')[0], elapsed);

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? ((await response.json()) as T)
        : ({} as T);

      if (!response.ok && isTransientStatus(response.status) && attempt < retries) {
        const backoff = retryDelayMs * Math.pow(2, attempt);
        await waitWithAbort(backoff, externalSignal ?? undefined);
        continue;
      }

      if (response.ok && method === 'GET' && cacheTtlMs > 0) {
        getResponseCache.set(cacheKey, {
          expiresAt: Date.now() + cacheTtlMs,
          payload: data,
        });
      }

      return { ok: response.ok, status: response.status, data };
    } catch (err) {
      lastError = err;
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (attempt < retries) {
        const backoff = retryDelayMs * Math.pow(2, attempt);
        await waitWithAbort(backoff, externalSignal ?? undefined);
        continue;
      }
      if (timedOut) {
        throw new Error(
          `Request to ${url.split('?')[0]} timed out after ${timeoutMs}ms.`
        );
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Network request failed.');
}
