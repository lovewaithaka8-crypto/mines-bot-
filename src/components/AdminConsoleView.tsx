import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { BettingPlatform } from '../types/mines.ts';
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
    aiAnalysisEnabled: boolean;
    defaultSevenHourWindow: boolean;
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
    standaloneMode: boolean;
  };
}

export function AdminConsoleView() {
  const [adminKey, setAdminKey] = useState('');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [platforms, setPlatforms] = useState<BettingPlatform[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformUrl, setNewPlatformUrl] = useState('');
  const [newPlatformFeed, setNewPlatformFeed] = useState('');
  const [busyPlatformId, setBusyPlatformId] = useState<string | null>(null);

  async function fetchOverview(keyToUse: string) {
    setLoading(true);
    setError(null);
    setSaveNotice(null);
    try {
      const [overviewRes, platRes] = await Promise.all([
        fetchJsonWithOptimization<AdminOverviewResponse & { error?: string }>(
          '/api/admin/overview',
          {
            headers: { 'x-admin-key': keyToUse },
            timeoutMs: 6000,
            retries: 0,
          }
        ),
        fetchJsonWithOptimization<{
          platforms?: BettingPlatform[];
          error?: string;
        }>('/api/admin/platforms', {
          headers: { 'x-admin-key': keyToUse },
          timeoutMs: 6000,
          retries: 0,
        }),
      ]);

      if (!overviewRes.ok) {
        throw new Error(
          overviewRes.data.error ||
            `Authorization failed (${overviewRes.status}).`
        );
      }
      setData(overviewRes.data);
      if (platRes.ok && platRes.data.platforms) {
        setPlatforms(platRes.data.platforms);
      }
    } catch (err) {
      setData(null);
      setPlatforms([]);
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

  async function handleAddPlatform(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlatformName.trim()) return;
    setError(null);
    setSaveNotice(null);
    try {
      const { ok, data: res } = await fetchJsonWithOptimization<{
        platform?: BettingPlatform;
        error?: string;
      }>('/api/admin/platforms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        timeoutMs: 6000,
        body: JSON.stringify({
          name: newPlatformName.trim(),
          officialWebsite: newPlatformUrl.trim() || null,
          feedEndpoint: newPlatformFeed.trim() || null,
        }),
      });
      if (!ok || !res.platform) {
        throw new Error(res.error || 'Failed to add platform.');
      }
      setPlatforms((prev) => [...prev, res.platform!]);
      setNewPlatformName('');
      setNewPlatformUrl('');
      setNewPlatformFeed('');
      setSaveNotice(`Added platform ${res.platform.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add platform.');
    }
  }

  async function handleTogglePlatform(platform: BettingPlatform) {
    setBusyPlatformId(platform.id);
    setError(null);
    try {
      const { ok, data: res } = await fetchJsonWithOptimization<{
        platform?: BettingPlatform;
        error?: string;
      }>(`/api/admin/platforms/${encodeURIComponent(platform.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        timeoutMs: 6000,
        body: JSON.stringify({ enabled: !platform.enabled }),
      });
      if (!ok || !res.platform) {
        throw new Error(res.error || 'Failed to update platform.');
      }
      setPlatforms((prev) =>
        prev.map((p) => (p.id === platform.id ? res.platform! : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusyPlatformId(null);
    }
  }

  async function handleHealthCheck(platform: BettingPlatform) {
    setBusyPlatformId(platform.id);
    setError(null);
    setSaveNotice(null);
    try {
      const { ok, data: res } = await fetchJsonWithOptimization<{
        platform?: BettingPlatform;
        detail?: string;
        error?: string;
      }>(
        `/api/admin/platforms/${encodeURIComponent(platform.id)}/health-check`,
        {
          method: 'POST',
          headers: { 'x-admin-key': adminKey },
          timeoutMs: 8000,
        }
      );
      if (!ok || !res.platform) {
        throw new Error(res.error || 'Health check failed.');
      }
      setPlatforms((prev) =>
        prev.map((p) => (p.id === platform.id ? res.platform! : p))
      );
      setSaveNotice(
        `${res.platform.name}: ${res.platform.healthStatus}${res.detail ? ` (${res.detail})` : ''}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setBusyPlatformId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Backend Verification Gate */}
      <section className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-[#38BDF8] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold text-[#F4F7FC]">
              Administration Console
            </h2>
            <p className="text-xs sm:text-sm text-[#91A0B5] mt-1">
              Administrator permissions are verified on the Node.js backend against the server{' '}
              <code className="text-[#38BDF8]">ADMIN_ACCESS_KEY</code> environment variable.
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
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-white/10 bg-[#050A12] text-sm text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
          />
          <button
            type="submit"
            disabled={loading || !adminKey.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] disabled:opacity-50 text-[#050A12] text-xs sm:text-sm font-bold whitespace-nowrap"
          >
            {loading ? 'Verifying...' : 'Verify & Load Console'}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-3 text-xs text-red-200 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {saveNotice && (
          <div
            role="status"
            className="rounded-xl border border-[#00D98B]/45 bg-[#00D98B]/12 px-4 py-3 text-xs text-[#00D98B] flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{saveNotice}</span>
          </div>
        )}
      </section>

      {data && (
        <>
          {/* Database Statistics */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-[#91A0B5]">Signals in Server DB</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {data.databaseStats.signalsStored}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-[#91A0B5]">Activity Logs</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {data.databaseStats.activityLogsCount}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-[#91A0B5]">Error Events</div>
              <div className="text-2xl font-bold text-rose-400 tabular-nums mt-1">
                {data.databaseStats.errorLogsCount}
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-[#91A0B5]">DB File Size</div>
              <div className="text-2xl font-bold text-[#38BDF8] tabular-nums mt-1">
                {(data.databaseStats.dbFileSizeBytes / 1024).toFixed(1)} KB
              </div>
            </div>
          </section>

          {/* System Configuration */}
          <section className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#F4F7FC]">
                System Configuration
              </h3>
              <button
                type="button"
                onClick={() => void handleSaveSystemConfig()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] text-[#050A12] text-xs font-bold"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Config</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <label className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 cursor-pointer">
                <span>AI Analysis Enabled</span>
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
                  className="accent-[#00D98B]"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 cursor-pointer">
                <span>Default 7-Hour Window</span>
                <input
                  type="checkbox"
                  checked={data.systemConfig.defaultSevenHourWindow}
                  onChange={(e) =>
                    setData({
                      ...data,
                      systemConfig: {
                        ...data.systemConfig,
                        defaultSevenHourWindow: e.target.checked,
                      },
                    })
                  }
                  className="accent-[#00D98B]"
                />
              </label>

              <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 flex flex-col gap-1">
                <span className="text-[#91A0B5]">Max Stored Signals</span>
                <input
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
                  className="bg-transparent text-sm font-bold text-[#F4F7FC] outline-none"
                />
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/75 p-3 flex flex-col gap-1">
                <span className="text-[#91A0B5]">Security Status</span>
                <span className="font-semibold text-[#00D98B]">
                  {data.securityStatus.geminiKeyConfigured
                    ? 'Gemini Configured'
                    : 'Gemini Unset'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <label htmlFor="admin-notice" className="text-[#91A0B5]">
                Workspace Maintenance Banner
              </label>
              <input
                id="admin-notice"
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
                placeholder="Optional notice displayed at top of workspace..."
                className="px-3.5 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC]"
              />
            </div>
          </section>

          {/* Kenyan Platform Directory Administration */}
          <section className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#F4F7FC] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#00D98B]" aria-hidden="true" />
                <span>Platform Directory Management ({platforms.length})</span>
              </h3>
            </div>

            <form
              onSubmit={handleAddPlatform}
              className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs"
            >
              <input
                type="text"
                required
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                placeholder="Platform name..."
                className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-[#F4F7FC]"
              />
              <input
                type="url"
                value={newPlatformUrl}
                onChange={(e) => setNewPlatformUrl(e.target.value)}
                placeholder="Official HTTPS URL..."
                className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-[#F4F7FC]"
              />
              <input
                type="url"
                value={newPlatformFeed}
                onChange={(e) => setNewPlatformFeed(e.target.value)}
                placeholder="Authorized feed URL (optional)..."
                className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-[#F4F7FC]"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#00D98B] text-[#050A12] font-bold"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Platform</span>
              </button>
            </form>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#91A0B5]">
                    <th className="py-2 pr-3">Platform</th>
                    <th className="py-2 px-3">BCLB</th>
                    <th className="py-2 px-3">Health</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {platforms.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 font-semibold text-[#F4F7FC]">
                        {p.name}
                      </td>
                      <td className="py-2 px-3 text-[#91A0B5]">
                        {p.bclbStatus}
                      </td>
                      <td className="py-2 px-3 text-[#38BDF8]">
                        {p.healthStatus}
                      </td>
                      <td className="py-2 px-3">
                        {p.enabled ? (
                          <span className="text-[#00D98B] font-semibold">
                            Enabled
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          disabled={busyPlatformId === p.id}
                          onClick={() => void handleHealthCheck(p)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[11px] text-[#38BDF8]"
                        >
                          <Activity className="w-3 h-3" aria-hidden="true" />
                          <span>Check</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyPlatformId === p.id}
                          onClick={() => void handleTogglePlatform(p)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[11px] text-[#F4F7FC]"
                        >
                          <RefreshCw className="w-3 h-3" aria-hidden="true" />
                          <span>{p.enabled ? 'Disable' : 'Enable'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Activity & Error Monitoring Logs + Support Inquiries */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#F4F7FC]">
                  Application Activity & Error Logs
                </h3>
                <button
                  type="button"
                  onClick={() => void handleClearLogs()}
                  className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear Logs</span>
                </button>
              </div>
              {data.activityLogs.length === 0 ? (
                <p className="text-xs text-[#91A0B5] py-4">
                  No backend activity logs recorded yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.08] text-xs">
                  {data.activityLogs.map((log) => (
                    <div key={log.id} className="py-2 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[11px] text-[#91A0B5] tabular-nums">
                        <span
                          className={
                            log.level === 'error'
                              ? 'text-rose-400 font-bold'
                              : log.level === 'warn'
                                ? 'text-amber-400 font-bold'
                                : 'text-[#00D98B] font-semibold'
                          }
                        >
                          {log.level.toUpperCase()} · {log.category}
                        </span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[#F4F7FC]">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="lg:col-span-5 glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-base font-bold text-[#F4F7FC]">
                Contact Support Queue
              </h3>
              {data.contactMessages.length === 0 ? (
                <p className="text-xs text-[#91A0B5] py-4">
                  No support inquiries submitted yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.08] text-xs">
                  {data.contactMessages.map((m) => (
                    <div key={m.id} className="py-2.5 flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] text-[#91A0B5]">
                        <span className="font-semibold text-[#F4F7FC]">
                          {m.name} ({m.email})
                        </span>
                        <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[#38BDF8] font-medium">{m.subject}</div>
                      <p className="text-[#91A0B5]">{m.message}</p>
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
