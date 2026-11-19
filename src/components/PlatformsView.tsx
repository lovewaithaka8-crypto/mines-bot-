import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bomb,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Plane,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import type {
  BettingPlatform,
  ConnectionRealStatus,
  GameCompatibilityStatus,
  PlatformConnection,
  PlatformGameType,
  VerificationPipelineStep,
  WorkspacePage,
} from '../types/mines.ts';
import { PlatformLogo } from './PlatformLogo.tsx';
import {
  connectPlatformWebsite,
  deletePlatformConnection,
  disconnectPlatformConnection,
  reconnectPlatformConnection,
  refreshPlatformConnection,
} from '../services/platformClient.ts';

interface PlatformsViewProps {
  platforms: BettingPlatform[];
  connections: PlatformConnection[];
  loading: boolean;
  onRefreshAll: () => Promise<void>;
  onNavigate: (page: WorkspacePage) => void;
}

type FilterTab =
  | 'all'
  | 'mines'
  | 'aviator'
  | 'verified'
  | 'connected'
  | 'custom';

function compatBadgeStyle(status: GameCompatibilityStatus): string {
  switch (status) {
    case 'Verified':
    case 'Integration available':
      return 'border-[#00D98B]/40 bg-[#00D98B]/12 text-[#00D98B]';
    case 'Available but not integrated':
      return 'border-[#38BDF8]/35 bg-[#38BDF8]/10 text-[#38BDF8]';
    case 'Under verification':
      return 'border-[#8B5CF6]/35 bg-[#8B5CF6]/12 text-[#C4B5FD]';
    case 'Unsupported':
    default:
      return 'border-white/10 bg-[#050A12]/70 text-[#91A0B5]';
  }
}

function connectionStatusStyle(status: ConnectionRealStatus): string {
  switch (status) {
    case 'Connected':
    case 'Authorized':
      return 'border-[#00D98B]/45 bg-[#00D98B]/15 text-[#00D98B]';
    case 'Verification Required':
    case 'Authorization Required':
      return 'border-amber-400/40 bg-amber-400/12 text-amber-300';
    case 'Expired':
    case 'Sync Error':
    case 'Unsupported':
      return 'border-rose-500/45 bg-rose-500/15 text-rose-300';
    case 'Disconnected':
    default:
      return 'border-white/15 bg-[#050A12]/80 text-[#91A0B5]';
  }
}

export function PlatformsView({
  platforms,
  connections,
  loading,
  onRefreshAll,
  onNavigate,
}: PlatformsViewProps) {
  const [sectionTab, setSectionTab] = useState<'directory' | 'connections'>(
    'directory'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const [selectedPlatform, setSelectedPlatform] =
    useState<BettingPlatform | null>(null);
  const [selectedGame, setSelectedGame] = useState<PlatformGameType>('mines');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [authorizedFeedUrl, setAuthorizedFeedUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [showAdvancedFeed, setShowAdvancedFeed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<
    VerificationPipelineStep[]
  >([]);
  const [connectFeedback, setConnectFeedback] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);
  const [busyConnId, setBusyConnId] = useState<string | null>(null);
  const [connActionMessage, setConnActionMessage] = useState<string | null>(
    null
  );

  const connectedPlatformIds = useMemo(
    () =>
      new Set(
        connections
          .filter((c) => c.connectionStatus === 'Connected')
          .map((c) => c.platformId)
      ),
    [connections]
  );

  const filteredPlatforms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return platforms.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.shortCode.toLowerCase().includes(q)) {
        return false;
      }
      if (filterTab === 'mines') {
        return p.minesCompatibility !== 'Unsupported';
      }
      if (filterTab === 'aviator') {
        return p.aviatorCompatibility !== 'Unsupported';
      }
      if (filterTab === 'verified') {
        return (
          p.minesCompatibility === 'Verified' ||
          p.minesCompatibility === 'Integration available' ||
          p.aviatorCompatibility === 'Verified' ||
          p.aviatorCompatibility === 'Integration available'
        );
      }
      if (filterTab === 'connected') {
        return connectedPlatformIds.has(p.id);
      }
      if (filterTab === 'custom') {
        return Boolean(p.isCustomSlot);
      }
      return true;
    });
  }, [platforms, searchQuery, filterTab, connectedPlatformIds]);

  function openPlatformWorkspace(platform: BettingPlatform) {
    setSelectedPlatform(platform);
    setWebsiteUrl(platform.officialWebsite || '');
    setCustomPlatformName('');
    setAuthorizedFeedUrl('');
    setAuthToken('');
    setShowAdvancedFeed(Boolean(platform.isCustomSlot));
    setPipelineSteps([]);
    setConnectFeedback(null);
    if (
      platform.minesCompatibility === 'Unsupported' &&
      platform.aviatorCompatibility !== 'Unsupported'
    ) {
      setSelectedGame('aviator');
    } else {
      setSelectedGame('mines');
    }
  }

  async function handleConnectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlatform) return;
    setSubmitting(true);
    setConnectFeedback(null);
    try {
      const res = await connectPlatformWebsite({
        platformId: selectedPlatform.id,
        customPlatformName: selectedPlatform.isCustomSlot
          ? customPlatformName
          : undefined,
        websiteUrl,
        selectedGame,
        authorizedFeedUrl: authorizedFeedUrl.trim() || undefined,
        authToken: authToken.trim() || undefined,
      });
      setPipelineSteps(res.steps);
      setConnectFeedback({
        connected: res.connected,
        message: res.statusMessage,
      });
      await onRefreshAll();
    } catch (err) {
      setConnectFeedback({
        connected: false,
        message:
          err instanceof Error
            ? err.message
            : 'Connection verification failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefreshConnection(id: string) {
    setBusyConnId(id);
    setConnActionMessage(null);
    try {
      const res = await refreshPlatformConnection(id);
      setConnActionMessage(res.statusMessage);
      await onRefreshAll();
    } catch (err) {
      setConnActionMessage(
        err instanceof Error ? err.message : 'Refresh failed.'
      );
    } finally {
      setBusyConnId(null);
    }
  }

  async function handleReconnect(id: string) {
    setBusyConnId(id);
    setConnActionMessage(null);
    try {
      const res = await reconnectPlatformConnection(id);
      setConnActionMessage(res.statusMessage);
      await onRefreshAll();
    } catch (err) {
      setConnActionMessage(
        err instanceof Error ? err.message : 'Reconnect failed.'
      );
    } finally {
      setBusyConnId(null);
    }
  }

  async function handleDisconnect(id: string) {
    setBusyConnId(id);
    setConnActionMessage(null);
    try {
      await disconnectPlatformConnection(id);
      setConnActionMessage('Connection disconnected.');
      await onRefreshAll();
    } catch (err) {
      setConnActionMessage(
        err instanceof Error ? err.message : 'Disconnect failed.'
      );
    } finally {
      setBusyConnId(null);
    }
  }

  async function handleDeleteConnection(id: string) {
    setBusyConnId(id);
    setConnActionMessage(null);
    try {
      await deletePlatformConnection(id);
      setConnActionMessage('Stored connection and synced history deleted.');
      await onRefreshAll();
    } catch (err) {
      setConnActionMessage(
        err instanceof Error ? err.message : 'Delete failed.'
      );
    } finally {
      setBusyConnId(null);
    }
  }

  const activeConnectedCount = connections.filter(
    (c) => c.connectionStatus === 'Connected'
  ).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Compact Header & Mode Switch */}
      <section className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00D98B]/15 border border-[#00D98B]/35 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-[#00D98B]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F4F7FC]">
              Kenyan Betting Platforms
            </h2>
            <p className="text-xs text-[#91A0B5]">
              {platforms.length} candidates · {activeConnectedCount} connected
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSectionTab('directory')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              sectionTab === 'directory'
                ? 'bg-[#00D98B] text-[#050A12]'
                : 'border border-white/10 bg-[#050A12]/70 text-[#91A0B5] hover:text-[#F4F7FC]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Directory ({platforms.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSectionTab('connections')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              sectionTab === 'connections'
                ? 'bg-[#00D98B] text-[#050A12]'
                : 'border border-white/10 bg-[#050A12]/70 text-[#91A0B5] hover:text-[#F4F7FC]'
            }`}
          >
            <Plug className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Connected ({connections.length})</span>
          </button>

          <button
            type="button"
            onClick={() => void onRefreshAll()}
            disabled={loading}
            title="Refresh directory"
            aria-label="Refresh directory"
            className="p-2 rounded-xl border border-white/10 bg-[#050A12]/70 text-[#91A0B5] hover:text-[#F4F7FC] disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      {/* Honest Verification Disclaimer */}
      <div className="rounded-xl border border-[#38BDF8]/25 bg-[#080F1B]/90 px-4 py-2.5 text-xs text-[#91A0B5] flex items-center gap-2.5">
        <ShieldCheck
          className="w-4 h-4 text-[#38BDF8] shrink-0"
          aria-hidden="true"
        />
        <span>
          Directory entries are candidates only. Official API availability,
          Kenyan BCLB licensing, and game feeds are verified server-side before
          establishing any connection.
        </span>
      </div>

      {sectionTab === 'directory' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left / Main Directory Grid */}
          <div
            className={`${
              selectedPlatform ? 'xl:col-span-7' : 'xl:col-span-12'
            } flex flex-col gap-4`}
          >
            {/* Search & Filters */}
            <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    className="w-4 h-4 text-[#91A0B5] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Kenyan platform..."
                    aria-label="Search platforms"
                    className="w-full pl-10 pr-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC] placeholder:text-[#91A0B5]/70 focus:outline-none focus:border-[#00D98B]"
                  />
                </div>
                {platforms.find((p) => p.isCustomSlot) && (
                  <button
                    type="button"
                    onClick={() => {
                      const custom = platforms.find((p) => p.isCustomSlot);
                      if (custom) openPlatformWorkspace(custom);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#38BDF8]/35 bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 text-xs font-semibold text-[#38BDF8]"
                  >
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Custom Website</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'mines', label: 'Mines' },
                    { id: 'aviator', label: 'Aviator' },
                    { id: 'verified', label: 'Verified' },
                    { id: 'connected', label: 'Connected' },
                    { id: 'custom', label: 'Other Website' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterTab(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      filterTab === f.id
                        ? 'bg-[#00D98B]/20 text-[#00D98B] border border-[#00D98B]/45'
                        : 'border border-white/10 text-[#91A0B5] hover:text-[#F4F7FC]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Cards Grid */}
            {filteredPlatforms.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center text-xs text-[#91A0B5]">
                No platforms match this filter.
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 ${
                  selectedPlatform
                    ? 'sm:grid-cols-2'
                    : 'sm:grid-cols-2 lg:grid-cols-3'
                } gap-3.5`}
              >
                {filteredPlatforms.map((platform) => {
                  const isSelected = selectedPlatform?.id === platform.id;
                  const isConnected = connectedPlatformIds.has(platform.id);
                  return (
                    <article
                      key={platform.id}
                      className={`glass-card rounded-2xl p-4 flex flex-col justify-between gap-3.5 ${
                        isSelected
                          ? 'border-[#00D98B]/60 bg-[#132638]/75 emerald-glow'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlatformLogo
                            shortCode={platform.shortCode}
                            brandColor={platform.brandColor}
                            isCustomSlot={platform.isCustomSlot}
                          />
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-[#F4F7FC] truncate">
                              {platform.name}
                            </h3>
                            <p className="text-[11px] text-[#91A0B5] truncate">
                              {platform.officialWebsite
                                ? platform.officialWebsite.replace(
                                    /^https?:\/\//,
                                    ''
                                  )
                                : 'User-submitted URL'}
                            </p>
                          </div>
                        </div>

                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#00D98B]/45 bg-[#00D98B]/15 text-[10px] font-bold text-[#00D98B] shrink-0">
                            <CheckCircle2
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                            <span>Connected</span>
                          </span>
                        ) : !platform.enabled ? (
                          <span className="px-2 py-0.5 rounded-md border border-rose-500/40 bg-rose-500/15 text-[10px] font-bold text-rose-300 shrink-0">
                            Disabled
                          </span>
                        ) : null}
                      </div>

                      {/* Game Compatibility Statuses */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl border border-white/[0.06] bg-[#050A12]/65 p-2 flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-[#91A0B5] font-medium">
                            <Bomb
                              className="w-3 h-3 text-[#00D98B]"
                              aria-hidden="true"
                            />
                            <span>Mines</span>
                          </span>
                          <span
                            className={`inline-block truncate px-1.5 py-0.5 rounded border text-[10px] font-semibold ${compatBadgeStyle(
                              platform.minesCompatibility
                            )}`}
                            title={platform.minesCompatibility}
                          >
                            {platform.minesCompatibility}
                          </span>
                        </div>

                        <div className="rounded-xl border border-white/[0.06] bg-[#050A12]/65 p-2 flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-[#91A0B5] font-medium">
                            <Plane
                              className="w-3 h-3 text-[#C4B5FD]"
                              aria-hidden="true"
                            />
                            <span>Aviator</span>
                          </span>
                          <span
                            className={`inline-block truncate px-1.5 py-0.5 rounded border text-[10px] font-semibold ${compatBadgeStyle(
                              platform.aviatorCompatibility
                            )}`}
                            title={platform.aviatorCompatibility}
                          >
                            {platform.aviatorCompatibility}
                          </span>
                        </div>
                      </div>

                      {/* Licensing & Action Row */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                        <span
                          className={`text-[10px] font-semibold truncate ${
                            platform.bclbStatus === 'Verified Kenyan License'
                              ? 'text-[#00D98B]'
                              : 'text-[#91A0B5]'
                          }`}
                        >
                          {platform.bclbStatus}
                        </span>

                        <button
                          type="button"
                          onClick={() => openPlatformWorkspace(platform)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#132638] hover:bg-[#00D98B] text-[#F4F7FC] hover:text-[#050A12] border border-white/10 text-xs font-bold transition-colors shrink-0"
                        >
                          <Plug className="w-3 h-3" aria-hidden="true" />
                          <span>Connect</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Selected Platform Connection Workspace */}
          {selectedPlatform && (
            <aside className="xl:col-span-5 glass-panel rounded-2xl p-5 flex flex-col gap-4 sticky top-20">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3 min-w-0">
                  <PlatformLogo
                    shortCode={selectedPlatform.shortCode}
                    brandColor={selectedPlatform.brandColor}
                    isCustomSlot={selectedPlatform.isCustomSlot}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#F4F7FC] truncate">
                      {selectedPlatform.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-[#91A0B5]">
                      <span className="truncate">
                        {selectedPlatform.officialWebsite ||
                          'Custom HTTPS Endpoint'}
                      </span>
                      {selectedPlatform.officialWebsite && (
                        <ExternalLink
                          className="w-3 h-3 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlatform(null)}
                  aria-label="Close workspace"
                  className="p-1.5 rounded-lg text-[#91A0B5] hover:text-[#F4F7FC] hover:bg-white/10"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Licensing & Adapter Metadata */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/70 p-2.5">
                  <div className="text-[10px] text-[#91A0B5]">
                    Kenyan Licensing
                  </div>
                  <div className="font-semibold text-[#F4F7FC] mt-0.5 truncate">
                    {selectedPlatform.bclbStatus}
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[#050A12]/70 p-2.5">
                  <div className="text-[10px] text-[#91A0B5]">
                    Adapter Health
                  </div>
                  <div className="font-semibold text-[#38BDF8] mt-0.5 truncate">
                    {selectedPlatform.healthStatus}
                  </div>
                </div>
              </div>

              {/* Website URL Connection Form */}
              <form
                onSubmit={handleConnectSubmit}
                className="flex flex-col gap-3"
              >
                {/* Preferred Game Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-[#91A0B5] font-medium">
                    Game
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          id: 'mines' as PlatformGameType,
                          label: 'Mines',
                          icon: Bomb,
                          compat: selectedPlatform.minesCompatibility,
                        },
                        {
                          id: 'aviator' as PlatformGameType,
                          label: 'Aviator',
                          icon: Plane,
                          compat: selectedPlatform.aviatorCompatibility,
                        },
                      ] as const
                    ).map((g) => {
                      const Icon = g.icon;
                      const active = selectedGame === g.id;
                      const unsupported = g.compat === 'Unsupported';
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={unsupported}
                          onClick={() => setSelectedGame(g.id)}
                          className={`p-2.5 rounded-xl border text-left transition-colors disabled:opacity-45 ${
                            active
                              ? 'border-[#00D98B] bg-[#00D98B]/15 text-[#F4F7FC]'
                              : 'border-white/10 bg-[#050A12]/70 text-[#91A0B5] hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{g.label}</span>
                          </div>
                          <div className="text-[10px] text-[#91A0B5] truncate mt-0.5">
                            {g.compat}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedPlatform.isCustomSlot && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="plat-custom-name"
                      className="text-xs text-[#91A0B5]"
                    >
                      Platform Name
                    </label>
                    <input
                      id="plat-custom-name"
                      type="text"
                      required
                      value={customPlatformName}
                      onChange={(e) => setCustomPlatformName(e.target.value)}
                      placeholder="e.g. Authorized Kenyan Feed"
                      className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="plat-url-input"
                    className="text-xs text-[#91A0B5]"
                  >
                    Website URL (HTTPS)
                  </label>
                  <input
                    id="plat-url-input"
                    type="url"
                    required
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.co.ke"
                    className="px-3 py-2 rounded-xl border border-white/10 bg-[#050A12] text-xs text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFeed((v) => !v)}
                  className="self-start text-[11px] font-semibold text-[#38BDF8] hover:underline flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                  <span>
                    {showAdvancedFeed
                      ? 'Hide Authorized Feed Options'
                      : 'Authorized Feed URL / Read-Only Token (Optional)'}
                  </span>
                </button>

                {showAdvancedFeed && (
                  <div className="rounded-xl border border-white/10 bg-[#050A12]/75 p-3 flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="plat-feed-url"
                        className="text-[11px] text-[#91A0B5]"
                      >
                        Authorized Read-Only JSON Feed URL
                      </label>
                      <input
                        id="plat-feed-url"
                        type="url"
                        value={authorizedFeedUrl}
                        onChange={(e) => setAuthorizedFeedUrl(e.target.value)}
                        placeholder="https://api.example.co.ke/v1/rounds.json"
                        className="px-3 py-2 rounded-lg border border-white/10 bg-[#080F1B] text-xs text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="plat-api-token"
                        className="text-[11px] text-[#91A0B5]"
                      >
                        Read-Only API Token (Encrypted on Server)
                      </label>
                      <input
                        id="plat-api-token"
                        type="password"
                        autoComplete="off"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        placeholder="Bearer token (if feed requires auth)"
                        className="px-3 py-2 rounded-lg border border-white/10 bg-[#080F1B] text-xs text-[#F4F7FC] focus:outline-none focus:border-[#00D98B]"
                      />
                    </div>

                    <div className="text-[11px] text-amber-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        Never enter your betting account password. Only read-only
                        API tokens are encrypted & stored.
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !selectedPlatform.enabled}
                  className="w-full py-2.5 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] disabled:opacity-50 text-[#050A12] text-xs font-bold inline-flex items-center justify-center gap-2 emerald-glow transition-colors"
                >
                  {submitting ? (
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plug className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>
                    {submitting ? 'Verifying & Connecting...' : 'Connect Website'}
                  </span>
                </button>
              </form>

              {/* Verification Pipeline Feedback */}
              {pipelineSteps.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-[#050A12]/80 p-3.5 flex flex-col gap-2">
                  <div className="text-xs font-bold text-[#F4F7FC]">
                    Verification Pipeline
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {pipelineSteps.map((st) => (
                      <div
                        key={st.key}
                        className="flex items-start gap-2 text-[11px]"
                      >
                        {st.status === 'passed' ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[#00D98B] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : st.status === 'failed' ? (
                          <ShieldAlert
                            className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-[#F4F7FC]">
                            {st.step}. {st.label}:{' '}
                          </span>
                          <span className="text-[#91A0B5]">{st.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connectFeedback && (
                <div
                  role="status"
                  className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-col gap-2 ${
                    connectFeedback.connected
                      ? 'border-[#00D98B]/45 bg-[#00D98B]/12 text-[#00D98B]'
                      : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                  }`}
                >
                  <span>{connectFeedback.message}</span>
                  {connectFeedback.connected && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(
                          selectedGame === 'mines' ? 'analyzer' : 'aviator'
                        )
                      }
                      className="self-start inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#00D98B] text-[#050A12] text-[11px] font-bold"
                    >
                      <span>
                        Open {selectedGame === 'mines' ? 'Mines' : 'Aviator'}
                      </span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      ) : (
        /* Connected Platforms Management Section */
        <section className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#F4F7FC]">
                Connected Websites
              </h3>
              <p className="text-xs text-[#91A0B5]">
                Isolated to your private workspace session under Kenyan data
                protection controls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSectionTab('directory')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00D98B] text-[#050A12] text-xs font-bold"
            >
              <Plug className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Connection</span>
            </button>
          </div>

          {connActionMessage && (
            <div className="rounded-xl border border-[#38BDF8]/35 bg-[#38BDF8]/10 px-3.5 py-2 text-xs text-[#F4F7FC]">
              {connActionMessage}
            </div>
          )}

          {connections.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center gap-3">
              <Plug className="w-8 h-8 text-[#91A0B5]/60" aria-hidden="true" />
              <p className="text-xs text-[#91A0B5]">
                No websites connected in this session yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => {
                const isBusy = busyConnId === conn.id;
                return (
                  <article
                    key={conn.id}
                    className="glass-card rounded-2xl p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <PlatformLogo
                          shortCode={conn.shortCode}
                          brandColor={conn.brandColor}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[#F4F7FC] truncate">
                            {conn.platformName}
                          </h4>
                          <p className="text-[11px] text-[#91A0B5] truncate">
                            {conn.websiteUrl}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${connectionStatusStyle(
                          conn.connectionStatus
                        )}`}
                      >
                        {conn.connectionStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] rounded-xl border border-white/[0.06] bg-[#050A12]/65 p-2.5">
                      <div>
                        <div className="text-[10px] text-[#91A0B5]">Game</div>
                        <div className="font-bold text-[#F4F7FC] uppercase">
                          {conn.selectedGame}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#91A0B5]">Synced</div>
                        <div className="font-bold text-[#00D98B] tabular-nums">
                          {conn.syncedRoundsCount}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#91A0B5] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          <span>Last Sync</span>
                        </div>
                        <div className="font-semibold text-[#F4F7FC] truncate">
                          {conn.lastSyncAt
                            ? new Date(conn.lastSyncAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Never'}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#91A0B5]">
                      {conn.statusMessage}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRefreshConnection(conn.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#132638] hover:bg-[#1a334a] text-[11px] font-semibold text-[#F4F7FC] disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>Refresh</span>
                      </button>

                      {(conn.connectionStatus === 'Expired' ||
                        conn.connectionStatus === 'Disconnected' ||
                        conn.connectionStatus === 'Sync Error') && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleReconnect(conn.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#00D98B]/40 text-[11px] font-semibold text-[#00D98B] hover:bg-[#00D98B]/15 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>Reconnect</span>
                        </button>
                      )}

                      {conn.connectionStatus === 'Connected' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDisconnect(conn.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-semibold text-[#91A0B5] hover:text-[#F4F7FC] disabled:opacity-50"
                        >
                          <Unplug className="w-3 h-3" aria-hidden="true" />
                          <span>Disconnect</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDeleteConnection(conn.id)}
                        title="Delete connection and stored history"
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/35 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
