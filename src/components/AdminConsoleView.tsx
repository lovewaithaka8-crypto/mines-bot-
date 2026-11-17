import { useState } from 'react';
import {
  Database,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { fetchJsonWithOptimization } from '../services/networkClient.ts';

interface AdminOverviewResponse {
  databaseStats: {
    signalsStored: number;
    activityLogsCount: number;
    errorLogsCount: number;
    contactMessagesCount: number;
    dbFileSizeBytes: number;
  };
  systemConfig: {
    bgr8Enabled: boolean;
    onewinEnabled: boolean;
    aiAnalysisEnabled: boolean;
    maxStoredSignals: number;
    maintenanceNotice: string;
    updatedAt: string;
  };
  activityLogs: Array<{
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    category: string;
    message: string;
  }>;
  errorLogs: Array<{
    id: string;
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    category: string;
    message: string;
  }>;
  contactMessages: Array<{
    id: string;
    timestamp: string;
    name: string;
    email: string;
    subject: string;
    message: string;
  }>;
  securityStatus: {
    geminiKeyConfigured: boolean;
    adminKeyConfigured: boolean;
    directAccessEnabled: boolean;
  };
}

export function AdminConsoleView() {
  const [adminKey, setAdminKey] = useState('');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  async function fetchOverview(keyToUse: string) {
    setLoading(true);
    setError(null);
    setSaveNotice(null);
    try {
      const { ok, status, data: json } = await fetchJsonWithOptimization<
        AdminOverviewResponse & { error?: string }
      >('/api/admin/overview', {
        headers: { 'x-admin-key': keyToUse },
        timeoutMs: 6000,
        retries: 0,
      });
      if (!ok) {
        throw new Error(json.error || `Authorization failed (${status}).`);
      }
      setData(json);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : 'Unable to reach admin endpoint.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSystemConfig() {
    if (!data) return;
    setSaveNotice(null);
    setError(null);
    try {
      const { ok, data: json } = await fetchJsonWithOptimization<{
        systemConfig?: AdminOverviewResponse['systemConfig'];
        error?: string;
      }>('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        timeoutMs: 6000,
        body: JSON.stringify(data.systemConfig),
      });
      if (!ok) {
        throw new Error(json.error || 'Failed to save configuration.');
      }
      if (json.systemConfig) {
        setData({ ...data, systemConfig: json.systemConfig });
      }
      setSaveNotice('Backend system configuration saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  }

  async function handleClearLogs() {
    setError(null);
    try {
      const { ok, data: j } = await fetchJsonWithOptimization<{
        error?: string;
      }>('/api/admin/logs', {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
        timeoutMs: 6000,
      });
      if (!ok) {
        throw new Error(j.error || 'Failed to clear logs.');
      }
      await fetchOverview(adminKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Backend Verification Gate */}
      <section className="surface-panel rounded-2xl border border-[#32C5E8]/25 p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-[#32C5E8] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold text-[#F3F7FF]">
              Backend-Protected Administration Console
            </h2>
            <p className="text-xs sm:text-sm text-[#9BB2D8] mt-1">
              Administrator permissions are verified on the Node.js backend against the server <code className="text-[#32C5E8]">ADMIN_ACCESS_KEY</code> environment variable.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void fetchOverview(adminKey);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Enter server ADMIN_ACCESS_KEY..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-sm text-[#F3F7FF] focus:outline-none focus:border-[#32C5E8]"
          />
          <button
            type="submit"
            disabled={loading || !adminKey.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#087AFF] hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold whitespace-nowrap"
          >
            {loading ? 'Verifying...' : 'Verify & Load Console'}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[#D93646]/50 bg-[#D93646]/15 px-4 py-3 text-xs text-red-200 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-[#D93646] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {data && (
        <>
          {/* Database Statistics */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
              <div className="text-xs text-[#9BB2D8]">Signals in Server DB</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {data.databaseStats.signalsStored}
              </div>
            </div>
            <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
              <div className="text-xs text-[#9BB2D8]">Activity Logs</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {data.databaseStats.activityLogsCount}
              </div>
            </div>
            <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
              <div className="text-xs text-[#9BB2D8]">Error Events</div>
              <div className="text-2xl font-bold text-[#D93646] tabular-nums mt-1">
                {data.databaseStats.errorLogsCount}
              </div>
            </div>
            <div className="surface-card rounded-2xl border border-[#32C5E8]/20 p-4">
              <div className="text-xs text-[#9BB2D8]">DB File Size</div>
              <div className="text-2xl font-bold text-[#32C5E8] tabular-nums mt-1">
                {(data.databaseStats.dbFileSizeBytes / 1024).toFixed(1)} KB
              </div>
            </div>
          </section>

          {/* System & Platform Integration Settings */}
          <section className="surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3F7FF] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#32C5E8]" aria-hidden="true" />
                <span>System & Platform Configuration</span>
              </h3>
              <button
                type="button"
                onClick={() => void fetchOverview(adminKey)}
                className="inline-flex items-center gap-1.5 text-xs text-[#32C5E8] hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#32C5E8]/20 bg-[#171E32] cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.systemConfig.bgr8Enabled}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        bgr8Enabled: e.target.checked,
                      },
                    })
                  }
                  className="accent-[#087AFF]"
                />
                <span>Enable BGR8 Module</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#32C5E8]/20 bg-[#171E32] cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.systemConfig.onewinEnabled}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        onewinEnabled: e.target.checked,
                      },
                    })
                  }
                  className="accent-[#087AFF]"
                />
                <span>Enable 1win Module</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#32C5E8]/20 bg-[#171E32] cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.systemConfig.aiAnalysisEnabled}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        aiAnalysisEnabled: e.target.checked,
                      },
                    })
                  }
                  className="accent-[#087AFF]"
                />
                <span>Enable Server AI Analysis</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="adm-max-sig" className="text-[#9BB2D8]">
                  Max Server Signals Retained
                </label>
                <input
                  id="adm-max-sig"
                  type="number"
                  min={50}
                  max={5000}
                  value={data.systemConfig.maxStoredSignals}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        maxStoredSignals: Number(e.target.value) || 500,
                      },
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="adm-notice" className="text-[#9BB2D8]">
                  Public Maintenance Notice (Optional)
                </label>
                <input
                  id="adm-notice"
                  type="text"
                  value={data.systemConfig.maintenanceNotice}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        maintenanceNotice: e.target.value,
                      },
                    })
                  }
                  placeholder="Leave blank for normal operation"
                  className="px-3 py-2 rounded-xl border border-[#32C5E8]/25 bg-[#080F20] text-[#F3F7FF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleSaveSystemConfig()}
                className="px-4 py-2 rounded-xl bg-[#087AFF] hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Save Backend Configuration
              </button>
              {saveNotice && (
                <span className="text-xs text-[#16A765] font-medium">
                  {saveNotice}
                </span>
              )}
            </div>
          </section>

          {/* Activity & Error Monitoring Logs + Support Inquiries */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#F3F7FF]">
                  Application Activity & Error Logs
                </h3>
                <button
                  type="button"
                  onClick={() => void handleClearLogs()}
                  className="inline-flex items-center gap-1 text-xs text-[#D93646] hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear Logs</span>
                </button>
              </div>
              {data.activityLogs.length === 0 ? (
                <p className="text-xs text-[#9BB2D8] py-4">
                  No backend activity logs recorded yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[#32C5E8]/10 text-xs">
                  {data.activityLogs.map((log) => (
                    <div key={log.id} className="py-2 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[11px] text-[#9BB2D8] tabular-nums">
                        <span
                          className={
                            log.level === 'error'
                              ? 'text-[#D93646] font-bold'
                              : log.level === 'warn'
                                ? 'text-orange-400 font-bold'
                                : 'text-[#32C5E8] font-semibold'
                          }
                        >
                          {log.level.toUpperCase()} · {log.category}
                        </span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[#F3F7FF]">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="lg:col-span-5 surface-panel rounded-2xl border border-[#32C5E8]/20 p-5 flex flex-col gap-3">
              <h3 className="text-base font-bold text-[#F3F7FF]">
                Contact Support Queue
              </h3>
              {data.contactMessages.length === 0 ? (
                <p className="text-xs text-[#9BB2D8] py-4">
                  No support inquiries submitted yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[#32C5E8]/10 text-xs">
                  {data.contactMessages.map((m) => (
                    <div key={m.id} className="py-2.5 flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] text-[#9BB2D8]">
                        <span className="font-semibold text-[#F3F7FF]">
                          {m.name} ({m.email})
                        </span>
                        <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[#32C5E8] font-medium">{m.subject}</div>
                      <p className="text-[#9BB2D8]">{m.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
