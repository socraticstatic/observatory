'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Sidebar } from '@/components/layout/Sidebar';
import { CommandHeader } from '@/components/layout/CommandHeader';
import { ServicesRail } from '@/components/pulse/ServicesRail';
import { OverallCostHero } from '@/components/pulse/OverallCostHero';
import { PulseBar } from '@/components/pulse/PulseBar';
import { BurnRateRail } from '@/components/pulse/BurnRateRail';
import { StatStrip } from '@/components/pulse/StatStrip';
import { WhyInsightsCard } from '@/components/why/WhyInsightsCard';
import { ZombieSessionsCard } from '@/components/why/ZombieSessionsCard';
import { EntityExplorer } from '@/components/diagnostics/EntityExplorer';
import { WhatCard } from '@/components/fiveW/WhatCard';
import { WhoCard } from '@/components/fiveW/WhoCard';
import { ContentTypeCard } from '@/components/fiveW/ContentTypeCard';
import { WhereCard } from '@/components/fiveW/WhereCard';
import { AppSurfaceCard } from '@/components/fiveW/AppSurfaceCard';
import { WhenCard } from '@/components/fiveW/WhenCard';
import { EventTimelineCard } from '@/components/fiveW/EventTimelineCard';
import { HowCard } from '@/components/fiveW/HowCard';
import { ContextCompositionCard } from '@/components/why/ContextCompositionCard';
import { QualityCostScatter } from '@/components/why/QualityCostScatter';
import { CounterfactualSimulator } from '@/components/why/CounterfactualSimulator';
import { SecurityTerminal } from '@/components/views/SecurityTerminal';
import { SystemLogOverlay } from '@/components/shared/SystemLogOverlay';
import { TweaksPanel } from '@/components/shared/TweaksPanel';
import { TracesView } from '@/components/views/TracesView';
import { CostDriversView } from '@/components/views/CostDriversView';
import { SessionsView } from '@/components/views/SessionsView';
import { RulesView } from '@/components/views/RulesView';
import { ArchiveView } from '@/components/views/ArchiveView';
import type { Lookback } from '@/lib/lookback';

type Density = 'comfortable' | 'compact' | 'dense';

export default function App() {
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState('Pulse');
  const [lookback, setLookback] = useState<Lookback>('24H');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [systemLogOpen, setSystemLogOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [accent, setAccent] = useState('#6FA8B3');
  const [density, setDensity] = useState<Density>('comfortable');
  const [showTicker, setShowTicker] = useState(true);
  const [drill, setDrill] = useState<{ type: string; source: string; stepHint?: number; at?: number; sessionId?: string } | null>(null);
  const howRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 't') setTweaksOpen(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Proactive sync: pull real usage from provider APIs every 15 minutes
  useEffect(() => {
    const run = () => fetch('/api/sync', { method: 'POST' }).catch(() => {});
    run(); // immediate on mount
    const t = setInterval(run, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const { data: health } = trpc.health.status.useQuery(undefined, { refetchInterval: 30_000 });

  // CommandHeader model toggle acts as a provider filter — merge with ServicesRail selection.
  // CommandHeader wins when it's not ALL; ServicesRail wins otherwise.
  const effectiveProvider = useMemo(
    () => (modelFilter !== 'ALL' ? modelFilter : (providerFilter ?? undefined)),
    [modelFilter, providerFilter],
  );

  const drillTo = (type: string, source: string, stepHint?: number, sessionId?: string) => {
    setDrill({ type, source, stepHint, at: Date.now(), sessionId });
    setTimeout(() => howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className={`shell${railExpanded ? ' expanded' : ''}`}>
      <Sidebar view={view} setView={setView} expanded={railExpanded} setExpanded={setRailExpanded} />

      <div className="shell-main">
        <CommandHeader
          now={now}
          lookback={lookback}
          setLookback={setLookback}
          modelFilter={modelFilter}
          setModelFilter={(m) => { setModelFilter(m); if (m !== 'ALL') setProviderFilter(null); }}
          onToggleSystemLog={() => setSystemLogOpen(v => !v)}
          systemLogOpen={systemLogOpen}
        />

        <div className="page" style={{ paddingTop: 20 }}>
          {view === 'Traces'   && <TracesView lookback={lookback} />}
          {view === 'Costs'    && <CostDriversView lookback={lookback} onNavigate={setView} />}
          {view === 'Sessions' && <SessionsView lookback={lookback} />}
          {view === 'Rules'    && <RulesView />}
          {view === 'Archive'  && <ArchiveView />}

          {view === 'Pulse' && (
            <>
              <ServicesRail
                lookback={lookback}
                providerFilter={providerFilter}
                onSelect={(pf) => { setProviderFilter(pf); if (pf !== null) setModelFilter('ALL'); }}
              />
              <OverallCostHero lookback={lookback} provider={effectiveProvider} />
              <PulseBar
                lookback={lookback}
                setLookback={setLookback}
                provider={effectiveProvider}
                onDrillSpike={(s) => drillTo('spike', 'pulse spike', 4)}
              />

              <BurnRateRail lookback={lookback} />
              <StatStrip lookback={lookback} provider={effectiveProvider} />

              {/* DIAGNOSTICS divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, marginBottom: 12 }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--steel)', fontWeight: 600 }}>
                  DIAGNOSTICS — WHY
                </span>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                  what, who, where, when, how → <span style={{ color: 'var(--accent-2)' }}>why ↓</span>
                </span>
              </div>

              <WhyInsightsCard />
              <ZombieSessionsCard onReview={(sid) => drillTo('session', `ZOMBIE · ${sid.slice(0, 8)}…`, undefined, sid)} />
              <EntityExplorer lookback={lookback} />

              <div id="5w-what" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 16, marginTop: 16 }}>
                <WhatCard lookback={lookback} provider={effectiveProvider} onDrill={(b, i) => drillTo('bar', `WHAT · ${b.label}`, 3)} />
                <div id="5w-who">
                  <WhoCard
                    selected={selectedModel}
                    setSelected={setSelectedModel}
                    lookback={lookback}
                    providerFilter={effectiveProvider}
                    onDrill={(m) => drillTo('model', `WHO · ${m.name}`, 1)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <ContentTypeCard lookback={lookback} provider={effectiveProvider} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 16, marginTop: 16 }}>
                <div id="5w-where"><WhereCard lookback={lookback} provider={effectiveProvider} /></div>
                <AppSurfaceCard lookback={lookback} provider={effectiveProvider} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 16, marginTop: 16 }}>
                <div id="5w-when">
                  <WhenCard provider={effectiveProvider} onDrill={(c) => drillTo('heatmap', `WHEN · D-${String(30 - c.d).padStart(2, '0')} ${String(c.h).padStart(2, '0')}:00`, 2)} />
                </div>
                <EventTimelineCard />
              </div>

              <div id="5w-how" style={{ marginTop: 16 }} ref={howRef}>
                <HowCard drill={drill} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16, marginTop: 16 }}>
                <ContextCompositionCard lookback={lookback} />
                <QualityCostScatter lookback={lookback} />
              </div>

              <div style={{ marginTop: 16 }}>
                <CounterfactualSimulator />
              </div>

              <SecurityTerminal />

              {/* Footer */}
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--graphite)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <span>Observatory v0.1.0 · personal build</span>
                <span className="mono" style={{ color: 'var(--steel)' }}>
                  retention: 90d ·{' '}
                  {health?.secondsAgo != null
                    ? `last ingest: ${health.secondsAgo < 60 ? `${health.secondsAgo}s` : `${Math.round(health.secondsAgo / 60)}m`} ago`
                    : 'no ingest data'}
                  {health?.dataRange.oldest && (
                    <> · data from {health.dataRange.oldest.slice(0, 10)}</>
                  )}
                </span>
                <span>keys: <span className="kbd">⌥T</span> tweaks <span className="kbd">F</span> filter</span>
              </div>
            </>
          )}
        </div>
      </div>

      {systemLogOpen && <SystemLogOverlay onClose={() => setSystemLogOpen(false)} />}

      <TweaksPanel
        open={tweaksOpen}
        accent={accent}
        density={density}
        showTicker={showTicker}
        onAccentChange={setAccent}
        onDensityChange={setDensity}
        onTickerChange={setShowTicker}
      />
    </div>
  );
}
