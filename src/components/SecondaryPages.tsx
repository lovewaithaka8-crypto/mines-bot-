import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bomb,
  BookOpen,
  Clock,
  Grid,
  History,
  Lock,
  Plane,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { WorkspacePage } from '../types/mines.ts';

/* ---------------- Aviator Coming Soon Preview ---------------- */

export function AviatorPreviewView({
  onOpenMines,
}: {
  onOpenMines: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="glass-panel rounded-2xl p-6 sm:p-8 purple-highlight border-[#8B5CF6]/35 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="flex flex-col gap-4 max-w-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/45 flex items-center justify-center shrink-0">
              <Plane className="w-6 h-6 text-[#C4B5FD]" aria-hidden="true" />
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-wider text-[#C4B5FD]">
                COMING SOON
              </span>
              <h2 className="text-xl font-bold text-[#F4F7FC]">
                Aviator Analytics
              </h2>
            </div>
          </div>

          <p className="text-sm text-[#91A0B5] leading-relaxed">
            Multiplier distribution histograms and target cashout survival
            tracking. Planned roadmap preview — not yet operational.
          </p>

          <div className="rounded-xl border border-[#8B5CF6]/35 bg-[#050A12]/70 p-3.5 text-xs text-[#C4B5FD] flex items-center gap-2.5">
            <Lock className="w-4 h-4 shrink-0 text-[#8B5CF6]" aria-hidden="true" />
            <span>Aviator prediction generation is disabled.</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/35 text-[#91A0B5] text-xs font-bold cursor-not-allowed opacity-70"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Unavailable</span>
            </button>
            <button
              type="button"
              onClick={onOpenMines}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] text-[#050A12] text-xs font-bold transition-colors emerald-glow"
            >
              <Bomb className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Mines</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Conceptual Flight Curve Preview */}
        <div className="w-full lg:w-96 rounded-2xl border border-[#8B5CF6]/30 bg-[#050A12]/80 p-5 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between text-xs text-[#91A0B5]">
            <span>Multiplier Curve</span>
            <span className="text-[#C4B5FD] font-semibold">Preview</span>
          </div>
          <svg
            viewBox="0 0 320 150"
            className="w-full h-36"
            aria-label="Conceptual Aviator trajectory preview"
          >
            <defs>
              <linearGradient id="aviatorCurveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
              <linearGradient id="aviatorAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="24" y1="130" x2="300" y2="130" stroke="rgba(145,160,181,0.25)" strokeWidth="1" />
            <line x1="24" y1="20" x2="24" y2="130" stroke="rgba(145,160,181,0.25)" strokeWidth="1" />
            <path d="M 24 130 Q 150 122 285 32 L 285 130 Z" fill="url(#aviatorAreaGrad)" />
            <path
              d="M 24 130 Q 150 122 285 32"
              fill="none"
              stroke="url(#aviatorCurveGrad)"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
          </svg>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: TrendingUp,
            title: 'Multiplier Histograms',
            desc: 'Track logged crash clusters across 1.2×, 2.0×, and 5.0× bands.',
          },
          {
            icon: Clock,
            title: '7-Hour Variance',
            desc: 'Rolling 7-hour empirical window without claiming certainty.',
          },
          {
            icon: BarChart3,
            title: 'Cashout Risk Tiers',
            desc: 'Compare theoretical survival rates with verified outcomes.',
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="glass-card rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <Icon className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#F4F7FC]">{item.title}</h3>
              </div>
              <p className="text-xs text-[#91A0B5] leading-relaxed">{item.desc}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ---------------- Help & Guide Page ---------------- */

export function HelpGuideView({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const sections = [
    {
      num: '01.',
      icon: Grid,
      title: 'Using Mines Bot',
      body: 'Open Mines Analyzer directly without login. Choose mine count, select an analysis window (Previous 7 Hours by default), and run a statistical calculation.',
    },
    {
      num: '02.',
      icon: Bomb,
      title: 'Mines Analyzer Controls',
      body: 'Set Mines (1–24) and Safe Picks. Use Generate for a single calculation or enable Auto-Refresh to re-evaluate the 7-hour window periodically.',
    },
    {
      num: '03.',
      icon: Grid,
      title: '5 × 5 Board States',
      body: 'Slate cells are unopened, emerald cells mark recommended estimates with step order, violet cells mark elevated uncertainty, and crimson cells appear only for verified mines.',
    },
    {
      num: '04.',
      icon: BarChart3,
      title: 'Probability Calculation',
      body: 'Single-cell safety is (25 - Mines) / 25. Multi-step survival multiplies conditional odds without replacement and compares historical cell frequencies in your window.',
    },
    {
      num: '05.',
      icon: AlertTriangle,
      title: 'Risk Classifications',
      body: 'LOW RISK: joint survival ≥ 55% (≤ 5 mines, ≤ 5 picks). MEDIUM RISK: 22%–54% survival (≤ 12 mines). HIGH RISK: high cumulative mine exposure.',
    },
    {
      num: '06.',
      icon: History,
      title: 'Round History & Export',
      body: 'Filter saved records by ID, cell, status, risk tier, or Previous 7 Hours. Inspect full explanations or export records as JSON, CSV, or Print.',
    },
    {
      num: '07.',
      icon: ShieldCheck,
      title: 'Performance Verification',
      body: 'Click Record Actual Result on the board to mark verified gems or mines. Accuracy divides verified safe picks by evaluated picks — pending rounds never inflate scores.',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-[#38BDF8] shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-[#F4F7FC]">
              Guide & Methodology
            </h2>
            <p className="text-xs text-[#91A0B5]">
              Board states, probability math, and verification rules
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('analyzer')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00D98B] hover:bg-[#00c47d] text-[#050A12] text-xs font-bold"
        >
          <Grid className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Explore Mines</span>
        </button>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.num} className="glass-card rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-[#00D98B] shrink-0" aria-hidden="true" />
                <span className="text-xs font-bold text-[#00D98B] tabular-nums">
                  {s.num}
                </span>
                <h3 className="text-sm font-bold text-[#F4F7FC]">{s.title}</h3>
              </div>
              <p className="text-xs text-[#91A0B5] leading-relaxed">{s.body}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Responsible Play Page ---------------- */

export function ResponsiblePlayView({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const principles = [
    {
      title: 'Gambling Risks & House Edge',
      text: 'Mines and multiplier games carry a built-in house edge. Expected long-term returns stay below 100%, and variance can produce rapid losses.',
    },
    {
      title: 'Independent Random Outcomes',
      text: 'Every round is independent. Results in the previous 7 hours do not influence future RNG placements.',
    },
    {
      title: 'Probability vs Certainty',
      text: 'High single-tile probabilities still carry immediate mine risk on every pick. Mines Bot never guarantees winning outcomes.',
    },
    {
      title: 'Responsible Decisions',
      text: 'Use statistical tracking solely for analysis. Never chase prior losses or increase stakes impulsively.',
    },
    {
      title: 'Never Use Borrowed Money',
      text: 'Never use credit, loans, rent, or essential funds. Only risk discretionary amounts you can afford to lose completely.',
    },
    {
      title: 'Take Breaks & Set Limits',
      text: 'Set strict time and loss limits before starting, take regular breaks, and stop immediately if decisions feel rushed.',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-panel rounded-2xl p-5 border-amber-400/25 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-[#00D98B] shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-[#F4F7FC]">
            Responsible Play
          </h2>
          <p className="text-xs text-[#91A0B5]">
            Statistical estimates quantify risk — they cannot predict or override random outcomes.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {principles.map((p) => (
          <article key={p.title} className="glass-card rounded-2xl p-5 flex flex-col gap-2">
            <h3 className="text-sm font-bold text-[#F4F7FC]">{p.title}</h3>
            <p className="text-xs text-[#91A0B5] leading-relaxed">{p.text}</p>
          </article>
        ))}
      </div>

      <section className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border-rose-500/25">
        <div className="flex items-center gap-2.5 text-xs text-[#91A0B5] max-w-2xl">
          <AlertTriangle
            className="w-4 h-4 text-amber-400 shrink-0"
            aria-hidden="true"
          />
          <span>
            If play becomes hard to control, stop immediately and contact a local
            responsible gambling support helpline.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className="px-4 py-2 rounded-xl border border-white/10 hover:bg-[#132638] text-xs font-semibold text-[#F4F7FC]"
        >
          Overview
        </button>
      </section>
    </div>
  );
}
