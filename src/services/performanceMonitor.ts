export interface RuntimePerformanceSnapshot {
  homepageLoadMs: number | null;
  firstContentfulPaintMs: number | null;
  dashboardSwitchMs: number | null;
  lastSignalGenMs: number | null;
  lastSignalMathMs: number | null;
  lastBoardRenderMs: number | null;
  avgApiResponseMs: number | null;
  lastApiResponseMs: number | null;
  lastApiEndpoint: string | null;
  jsErrorCount: number;
  lastJsError: string | null;
  usedJsHeapMb: number | null;
  jsHeapLimitMb: number | null;
}

class PerformanceMonitor {
  private dashboardSwitchMs: number | null = null;
  private lastSignalGenMs: number | null = null;
  private lastSignalMathMs: number | null = null;
  private lastBoardRenderMs: number | null = null;
  private apiDurations: number[] = [];
  private lastApiResponseMs: number | null = null;
  private lastApiEndpoint: string | null = null;
  private jsErrorCount = 0;
  private lastJsError: string | null = null;
  private listenersAttached = false;

  private readonly onWindowError = (event: ErrorEvent) => {
    this.jsErrorCount += 1;
    this.lastJsError = event.message || 'Unhandled runtime error';
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (
      event.reason instanceof DOMException &&
      event.reason.name === 'AbortError'
    ) {
      return;
    }
    this.jsErrorCount += 1;
    this.lastJsError =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? 'Unhandled promise rejection');
  };

  initErrorTracking(): () => void {
    if (typeof window === 'undefined' || this.listenersAttached) {
      return () => {};
    }
    this.listenersAttached = true;
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);

    return () => {
      if (!this.listenersAttached) return;
      window.removeEventListener('error', this.onWindowError);
      window.removeEventListener(
        'unhandledrejection',
        this.onUnhandledRejection
      );
      this.listenersAttached = false;
    };
  }

  recordDashboardSwitch(durationMs: number): void {
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.dashboardSwitchMs = Number(durationMs.toFixed(2));
    }
  }

  recordSignalGeneration(totalMs: number, mathMs: number): void {
    if (Number.isFinite(totalMs) && totalMs >= 0) {
      this.lastSignalGenMs = Number(totalMs.toFixed(2));
    }
    if (Number.isFinite(mathMs) && mathMs >= 0) {
      this.lastSignalMathMs = Number(mathMs.toFixed(2));
    }
  }

  recordBoardRender(durationMs: number): void {
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.lastBoardRenderMs = Number(durationMs.toFixed(2));
    }
  }

  recordApiTiming(endpoint: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const rounded = Number(durationMs.toFixed(1));
    this.lastApiResponseMs = rounded;
    this.lastApiEndpoint = endpoint;
    this.apiDurations.push(rounded);
    if (this.apiDurations.length > 25) {
      this.apiDurations.shift();
    }
  }

  getSnapshot(): RuntimePerformanceSnapshot {
    let homepageLoadMs: number | null = null;
    let firstContentfulPaintMs: number | null = null;
    let usedJsHeapMb: number | null = null;
    let jsHeapLimitMb: number | null = null;

    if (typeof performance !== 'undefined') {
      const navEntries = performance.getEntriesByType(
        'navigation'
      ) as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        const raw =
          nav.domContentLoadedEventEnd > 0
            ? nav.domContentLoadedEventEnd - nav.startTime
            : nav.domInteractive - nav.startTime;
        if (raw > 0) {
          homepageLoadMs = Number(raw.toFixed(1));
        }
      }

      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(
        (entry) => entry.name === 'first-contentful-paint'
      );
      if (fcp && fcp.startTime > 0) {
        firstContentfulPaintMs = Number(fcp.startTime.toFixed(1));
      }

      const perfWithMemory = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };
      if (perfWithMemory.memory) {
        usedJsHeapMb = Number(
          (perfWithMemory.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
        );
        jsHeapLimitMb = Number(
          (perfWithMemory.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0)
        );
      }
    }

    const avgApiResponseMs =
      this.apiDurations.length > 0
        ? Number(
            (
              this.apiDurations.reduce((acc, v) => acc + v, 0) /
              this.apiDurations.length
            ).toFixed(1)
          )
        : null;

    return {
      homepageLoadMs,
      firstContentfulPaintMs,
      dashboardSwitchMs: this.dashboardSwitchMs,
      lastSignalGenMs: this.lastSignalGenMs,
      lastSignalMathMs: this.lastSignalMathMs,
      lastBoardRenderMs: this.lastBoardRenderMs,
      avgApiResponseMs,
      lastApiResponseMs: this.lastApiResponseMs,
      lastApiEndpoint: this.lastApiEndpoint,
      jsErrorCount: this.jsErrorCount,
      lastJsError: this.lastJsError,
      usedJsHeapMb,
      jsHeapLimitMb,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
