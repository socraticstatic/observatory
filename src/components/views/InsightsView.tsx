'use client';

import { trpc } from '@/lib/trpc-client';
import { fmtMs, fmtUsd } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';

interface Props { lookback: Lookback; provider?: string; onNavigate?: (view: string) => void; }

type Verdict  = 'ok' | 'watch' | 'act';
type Severity = 'act' | 'warn' | 'info';
type Category = 'cost' | 'latency' | 'efficiency' | 'reliability';

const VERDICT_COLOR: Record<Verdict, string> = {
  ok:    'var(--good)',
  watch: '#C9966B',
  act:   'var(--bad)',
};

const SEV_COLOR: Record<Severity, string> = {
  act:  'var(--bad)',
  warn: '#C9966B',
  info: 'var(--steel)',
};

const CAT_COLOR: Record<Category, string> = {
  cost:        '#C9966B',
  latency:     '#9BC4CC',
  efficiency:  '#7CA893',
  reliability: '#B88A8A',
};

const NAV_TARGET: Partial<Record<string, string>> = {
  'opus-mismatch':      'Sessions',
  'tail-latency':       'Sessions',
  'cost-whales':        'Sessions',
  'error-burst':        'Sessions',
  'reasoning-overkill': 'Costs',
  'cache-decay':        'Costs',
  'cache-write-no-read':'Costs',
  'session-sprawl':     'Sessions',
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const c = VERDICT_COLOR[verdict];
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '.14em',
      textTransform: 'uppercase', padding: '2px 6px',
      borderRadius: 'var(--r)',
      background: `${c}18`, color: c, border: `1px solid ${c}40`,
    }}>
      {verdict.toUpperCase()}
    </span>
  );
}

interface StageMetric { label: string; value: string; good?: boolean; warn?: boolean; }

function JourneyStage({ label, verdict, metrics, sub }: {
  label: string; verdict: Verdict; metrics: StageMetric[]; sub: string;
}) {
  const c = VERDICT_COLOR[verdict];
  return (
    <div style={{
      padding: '12px 14px',
      border: `1px solid ${verdict !== 'ok' ? c + '40' : 'var(--line)'}`,
      borderRadius: 'var(--r)',
      background: verdict === 'act' ? 'rgba(184,107,107,.04)' : 'var(--panel-2)',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="label" style={{ fontSize: 9, letterSpacing: '.16em' }}>{label}</span>
        <VerdictBadge verdict={verdict} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 10, color: 'var(--graphite)' }}>{m.label}</span>
            <span className="mono" style={{
              fontSize: 11,
              color: m.good ? 'var(--good)' : m.warn ? '#C9966B' : 'var(--fog)',
            }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: 'var(--graphite)', marginTop: 10, letterSpacing: '.04em' }}>{sub}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', color: 'var(--line-2)' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3,7 L11,7 M8,4.5 L11,7 L8,9.5" />
      </svg>
    </div>
  );
}

export function InsightsView({ lookback, provider, onNavigate }: Props) {
  const { data: journey }      = trpc.insights.journeySnapshot.useQuery({ lookback, provider });
  const { data: findings = [] } = trpc.insights.findings.useQuery({ lookback, provider });

  const actCount  = findings.filter(f => f.severity === 'act').length;
  const warnCount = findings.filter(f => f.severity === 'warn').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Token Journey */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label">TOKEN JOURNEY</span>
            <span style={{ width: 14, height: 1, background: 'var(--line-2)' }} />
            <span style={{ fontSize: 11, color: 'var(--graphite)' }}>trace a token from origin to outcome</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {actCount  > 0 && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: 'var(--bad)'  }}>{actCount} ACT</span>}
            {warnCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: '#C9966B'     }}>{warnCount} WARN</span>}
            {infoCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: 'var(--steel)' }}>{infoCount} INFO</span>}
          </div>
        </div>

        {!journey ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 11, color: 'var(--steel)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr', alignItems: 'stretch' }}>
            <JourneyStage
              label="COMPOSITION"
              verdict={journey.composition.verdict as Verdict}
              metrics={[
                { label: 'Cached',  value: `${journey.composition.cachedPct}%`,  good: journey.composition.cachedPct > 40 },
                { label: 'Fresh',   value: `${journey.composition.freshPct}%` },
                { label: 'Writes',  value: `${journey.composition.writePct}%` },
              ]}
              sub={`${(journey.composition.totalTokens / 1_000_000).toFixed(1)}M tokens total`}
            />
            <Arrow />
            <JourneyStage
              label="ROUTING"
              verdict={journey.routing.verdict as Verdict}
              metrics={journey.routing.tiers.slice(0, 3).map(t => ({
                label: t.name,
                value: `${t.pct}%`,
                warn:  t.name === 'Opus' && t.pct > 60,
                good:  t.name !== 'Opus' && t.pct > 50,
              }))}
              sub={`${journey.routing.tiers.length} model tier${journey.routing.tiers.length !== 1 ? 's' : ''} active`}
            />
            <Arrow />
            <JourneyStage
              label="PROCESSING"
              verdict={journey.processing.verdict as Verdict}
              metrics={[
                { label: 'p50',   value: fmtMs(journey.processing.p50Ms) },
                { label: 'p95',   value: fmtMs(journey.processing.p95Ms), warn: journey.processing.p95Ms > 3000 },
                { label: 'ratio', value: `${journey.processing.latRatio}×`,  warn: journey.processing.latRatio > 3 },
              ]}
              sub="latency distribution"
            />
            <Arrow />
            <JourneyStage
              label="OUTCOME"
              verdict={journey.outcome.verdict as Verdict}
              metrics={[
                { label: 'OK',    value: `${journey.outcome.okPct}%`,    good: journey.outcome.okPct > 95 },
                { label: 'Error', value: `${journey.outcome.errorPct}%`, warn: journey.outcome.errorPct > 3 },
                { label: 'Calls', value: journey.outcome.totalCalls.toLocaleString() },
              ]}
              sub={`${fmtUsd(journey.outcome.totalCostUsd)} total`}
            />
          </div>
        )}
      </div>

      {/* Findings */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span className="label">FINDINGS</span>
          <span style={{ fontSize: 11, color: 'var(--graphite)' }}>
            {findings.length} active · deterministic rules engine
          </span>
        </div>

        {findings.length === 0 ? (
          <div className="card" style={{ padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--good)', marginBottom: 4 }}>All clear</div>
            <div style={{ fontSize: 11, color: 'var(--graphite)' }}>
              All rules passed for the selected window
            </div>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {findings.map((f, idx) => {
              const navTarget = NAV_TARGET[f.id];
              return (
                <div
                  key={f.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: idx < findings.length - 1 ? '1px solid var(--line)' : 'none',
                    background: f.severity === 'act' ? 'rgba(184,107,107,.03)' : 'transparent',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: '.14em',
                        textTransform: 'uppercase', padding: '2px 6px',
                        borderRadius: 'var(--r)',
                        background: `${SEV_COLOR[f.severity as Severity]}15`,
                        color: SEV_COLOR[f.severity as Severity],
                        border: `1px solid ${SEV_COLOR[f.severity as Severity]}35`,
                      }}>
                        {f.severity.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, letterSpacing: '.1em',
                        textTransform: 'uppercase', padding: '2px 6px',
                        borderRadius: 'var(--r)',
                        background: `${CAT_COLOR[f.category as Category]}12`,
                        color: CAT_COLOR[f.category as Category],
                      }}>
                        {f.category}
                      </span>
                      <span style={{ fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--graphite)' }}>
                        {f.confidence} confidence
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mist)', marginBottom: 4 }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--steel)', lineHeight: 1.6, marginBottom: 5 }}>
                      {f.detail}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--accent-2)' }}>
                      {f.impact}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--graphite)', marginTop: 4 }}>
                      → {f.action}
                    </div>
                  </div>

                  {navTarget && (
                    <button
                      className="mbtn"
                      onClick={() => onNavigate?.(navTarget)}
                      style={{ whiteSpace: 'nowrap', fontSize: 10, marginTop: 2 }}
                    >
                      {navTarget} ▸
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
