'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtUsd, fmtMs } from '@/lib/fmt';
import { type Lookback } from '@/lib/lookback';

type Period = '1H' | '24H' | '30D' | '90D' | '1Y';

interface Budget {
  id: string;
  project:   string | null;
  provider:  string | null;
  limitUsd:  number;
  period:    string;
  alertPct:  number;
  enabled:   boolean;
  createdAt: string;
}

interface BudgetStatus {
  id: string;
  project:  string | null;
  provider: string | null;
  period:   string;
  limitUsd: number;
  alertPct: number;
  spendUsd: number;
  pct:      number;
  status:   'ok' | 'alert' | 'exceeded';
}

interface BudgetFormState {
  project:  string;
  provider: string;
  limitUsd: string;
  period:   Period;
  alertPct: string;
}

const BLANK_BUDGET_FORM: BudgetFormState = {
  project: '', provider: '', limitUsd: '', period: '30D', alertPct: '80',
};

type Metric   = 'cost' | 'latency' | 'error_rate' | 'calls';
type Operator = 'gt' | 'lt';

interface AlertRule {
  id:        string;
  name:      string;
  metric:    Metric;
  lookback:  Lookback;
  operator:  Operator;
  threshold: number;
  enabled:   boolean;
  createdAt: string;
}

interface FormState {
  name:      string;
  metric:    Metric;
  lookback:  Lookback;
  operator:  Operator;
  threshold: string;
}

const BLANK_FORM: FormState = {
  name: '', metric: 'cost', lookback: '24H', operator: 'gt', threshold: '',
};

const METRIC_LABELS: Record<Metric, string> = {
  cost:       'Total cost',
  latency:    'Avg latency',
  error_rate: 'Error rate',
  calls:      'Call count',
};

const METRIC_UNITS: Record<Metric, string> = {
  cost:       'USD',
  latency:    'ms',
  error_rate: '%',
  calls:      'calls',
};

function fmtVal(metric: Metric, v: number): string {
  switch (metric) {
    case 'cost':       return fmtUsd(v);
    case 'latency':    return fmtMs(v);
    case 'error_rate': return v.toFixed(1) + '%';
    case 'calls':      return v.toLocaleString();
  }
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r)',
  padding: '6px 10px',
  fontSize: 11,
  color: 'var(--fog)',
  outline: 'none',
  fontFamily: 'inherit',
};

export function RulesView({ provider }: { provider?: string }) {
  const [showForm,       setShowForm]       = useState(false);
  const [form,           setForm]           = useState<FormState>(BLANK_FORM);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm,     setBudgetForm]     = useState<BudgetFormState>(BLANK_BUDGET_FORM);

  const utils = trpc.useUtils();

  const { data: rawRules = [], refetch } = trpc.alertRules.list.useQuery();
  const { data: budgets  = [] }          = trpc.budgets.list.useQuery() as { data: Budget[] };
  const { data: budgetStatuses = [] }    = trpc.budgets.status.useQuery() as { data: BudgetStatus[] };
  const upsertBudget = trpc.budgets.upsert.useMutation({ onSuccess: () => { utils.budgets.list.invalidate(); utils.budgets.status.invalidate(); setShowBudgetForm(false); setBudgetForm(BLANK_BUDGET_FORM); } });
  const removeBudget = trpc.budgets.remove.useMutation({ onSuccess: () => { utils.budgets.list.invalidate(); utils.budgets.status.invalidate(); } });
  // Cast DB response to local type — metric/lookback/operator are constrained by insert, safe to narrow
  const rules: AlertRule[] = rawRules.map((r: typeof rawRules[number]) => ({
    ...r,
    metric:   r.metric   as Metric,
    lookback: r.lookback as Lookback,
    operator: r.operator as Operator,
  }));

  const createRule = trpc.alertRules.create.useMutation({ onSuccess: () => { void refetch(); setShowForm(false); setForm(BLANK_FORM); } });
  const toggleRule = trpc.alertRules.toggleEnabled.useMutation({ onSuccess: () => refetch() });
  const deleteRule = trpc.alertRules.delete.useMutation({ onSuccess: () => refetch() });


  // Always fetch all lookbacks — queries are tiny and rules can span windows
  const { data: stats1H  } = trpc.pulse.statStrip.useQuery({ lookback: '1H',  provider });
  const { data: stats24H } = trpc.pulse.statStrip.useQuery({ lookback: '24H', provider });
  const { data: stats30D } = trpc.pulse.statStrip.useQuery({ lookback: '30D', provider });
  const { data: cost1H   } = trpc.pulse.overallCost.useQuery({ lookback: '1H',  provider });
  const { data: cost24H  } = trpc.pulse.overallCost.useQuery({ lookback: '24H', provider });
  const { data: cost30D  } = trpc.pulse.overallCost.useQuery({ lookback: '30D', provider });

  function snapshot(lb: Lookback): Record<Metric, number> | null {
    const s = lb === '1H' ? stats1H  : lb === '24H' ? stats24H : stats30D;
    const c = lb === '1H' ? cost1H   : lb === '24H' ? cost24H  : cost30D;
    if (!s || !c) return null;
    return {
      cost:       c.totalCostUsd,
      latency:    s.avgLatencyMs,
      error_rate: s.errorRatePct,
      calls:      s.totalCalls,
    };
  }

  function evaluate(rule: AlertRule): { value: number | null; firing: boolean } {
    if (!rule.enabled) return { value: null, firing: false };
    const snap = snapshot(rule.lookback);
    if (!snap) return { value: null, firing: false };
    const value  = snap[rule.metric];
    const firing = rule.operator === 'gt' ? value > rule.threshold : value < rule.threshold;
    return { value, firing };
  }

  function saveRule() {
    const threshold = parseFloat(form.threshold);
    if (!form.name.trim() || isNaN(threshold)) return;
    createRule.mutate({
      name:      form.name.trim(),
      metric:    form.metric,
      lookback:  form.lookback,
      operator:  form.operator,
      threshold,
      enabled:   true,
    });
  }

  function saveBudget() {
    const limitUsd = parseFloat(budgetForm.limitUsd);
    const alertPct = parseInt(budgetForm.alertPct, 10);
    if (isNaN(limitUsd) || limitUsd <= 0) return;
    upsertBudget.mutate({
      project:  budgetForm.project  || undefined,
      provider: budgetForm.provider || undefined,
      limitUsd,
      period:   budgetForm.period,
      alertPct: isNaN(alertPct) ? 80 : alertPct,
      enabled:  true,
    });
  }

  const firingCount   = rules.filter(r => evaluate(r).firing).length;
  const budgetAlerts  = budgetStatuses.filter(b => b.status !== 'ok').length;
  const COL = '36px 1fr 200px 110px 72px 32px';

  return (
    <div className="page">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mist)', letterSpacing: '.01em' }}>
            Alert Rules
          </span>
          <span style={{ fontSize: 11, color: 'var(--graphite)' }}>
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </span>
          {firingCount > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 'var(--r)',
              background: 'rgba(184,107,107,.15)', color: 'var(--bad)',
            }}>
              {firingCount} firing
            </span>
          )}
        </div>
        <button
          className="mbtn primary"
          onClick={() => { setShowForm(v => !v); setForm(BLANK_FORM); }}
        >
          {showForm ? '✕ Cancel' : '+ New Rule'}
        </button>
      </div>

      {/* Add-rule form */}
      {showForm && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 12 }}>
          <div className="label" style={{ marginBottom: 14 }}>New Alert Rule</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 76px 110px 120px auto', gap: 10, alignItems: 'end' }}>

            <div>
              <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Rule name</div>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveRule()}
                placeholder="e.g. Daily budget"
                style={{ ...INPUT_STYLE, fontSize: 12, color: 'var(--mist)' }}
              />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Metric</div>
              <select
                value={form.metric}
                onChange={e => setForm(f => ({ ...f, metric: e.target.value as Metric }))}
                style={INPUT_STYLE}
              >
                <option value="cost">Cost</option>
                <option value="latency">Latency</option>
                <option value="error_rate">Error rate</option>
                <option value="calls">Call count</option>
              </select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Window</div>
              <select
                value={form.lookback}
                onChange={e => setForm(f => ({ ...f, lookback: e.target.value as Lookback }))}
                style={INPUT_STYLE}
              >
                <option value="1H">1 Hour</option>
                <option value="24H">24 Hours</option>
                <option value="30D">30 Days</option>
              </select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Condition</div>
              <select
                value={form.operator}
                onChange={e => setForm(f => ({ ...f, operator: e.target.value as Operator }))}
                style={INPUT_STYLE}
              >
                <option value="gt">Exceeds</option>
                <option value="lt">Falls below</option>
              </select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>
                Threshold ({METRIC_UNITS[form.metric]})
              </div>
              <input
                type="number"
                value={form.threshold}
                onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveRule()}
                placeholder="0"
                style={{ ...INPUT_STYLE, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--mist)' }}
              />
            </div>

            <button
              className="mbtn primary"
              onClick={saveRule}
              disabled={!form.name.trim() || !form.threshold}
              style={{ alignSelf: 'flex-end', opacity: (!form.name.trim() || !form.threshold) ? 0.45 : 1 }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Empty state / loading / table */}
      {false ? (
        <div className="card" style={{ padding: '52px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--graphite)' }}>Loading…</div>
        </div>
      ) : rules.length === 0 ? (
        <div className="card" style={{ padding: '52px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 6 }}>No alert rules yet</div>
          <div style={{ fontSize: 11, color: 'var(--graphite)' }}>
            Create rules to surface threshold crossings across cost, latency, and error rate
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: COL,
            padding: '7px 16px', gap: 8,
            borderBottom: '1px solid var(--line)',
          }}>
            {['', 'Rule', 'Condition', 'Current', 'Status', ''].map((h, i) => (
              <span key={i} className="label" style={{ fontSize: 9 }}>{h}</span>
            ))}
          </div>

          {/* Rule rows */}
          {rules.map(rule => {
            const { value, firing } = evaluate(rule);
            const loading = rule.enabled && snapshot(rule.lookback) === null;

            return (
              <div
                key={rule.id}
                style={{
                  display: 'grid', gridTemplateColumns: COL,
                  padding: '10px 16px', gap: 8, alignItems: 'center',
                  borderBottom: '1px solid var(--line)',
                  background: firing ? 'rgba(184,107,107,.035)' : 'transparent',
                  transition: 'background 200ms',
                }}
              >
                {/* Toggle switch */}
                <button
                  onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                  title={rule.enabled ? 'Disable' : 'Enable'}
                  style={{
                    width: 28, height: 16, borderRadius: 8, padding: 0,
                    background: rule.enabled
                      ? (firing ? 'var(--bad)' : 'var(--accent)')
                      : 'var(--slate)',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    flexShrink: 0, transition: 'background 220ms',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: rule.enabled ? 14 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: 'var(--mist)',
                    transition: 'left 180ms ease-out',
                    display: 'block',
                  }} />
                </button>

                {/* Name */}
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  color: rule.enabled ? 'var(--mist)' : 'var(--graphite)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {rule.name}
                </span>

                {/* Condition */}
                <span style={{ fontSize: 11, color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {METRIC_LABELS[rule.metric]}
                  <span className="label" style={{ fontSize: 8, color: 'var(--graphite)' }}>{rule.lookback}</span>
                  <span style={{ color: 'var(--graphite)' }}>
                    {rule.operator === 'gt' ? '›' : '‹'}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                    {fmtVal(rule.metric, rule.threshold)}
                  </span>
                </span>

                {/* Current value */}
                <span className="mono" style={{
                  fontSize: 11,
                  color: value !== null
                    ? (firing ? 'var(--bad)' : 'var(--fog)')
                    : 'var(--graphite)',
                }}>
                  {loading ? '…' : value !== null ? fmtVal(rule.metric, value) : '—'}
                </span>

                {/* Status */}
                {!rule.enabled ? (
                  <span className="label" style={{ fontSize: 8, color: 'var(--graphite)' }}>Paused</span>
                ) : loading ? (
                  <span className="label" style={{ fontSize: 8, color: 'var(--graphite)' }}>Loading</span>
                ) : firing ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: 'var(--bad)',
                  }}>Firing</span>
                ) : (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: 'var(--good)',
                  }}>OK</span>
                )}

                {/* Delete */}
                <button
                  onClick={() => deleteRule.mutate({ id: rule.id })}
                  title="Remove rule"
                  style={{
                    fontSize: 12, color: 'var(--graphite)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 4px', borderRadius: 'var(--r)',
                    transition: 'color 140ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--bad)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--graphite)')}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Budget section */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mist)', letterSpacing: '.01em' }}>
              Budgets
            </span>
            <span style={{ fontSize: 11, color: 'var(--graphite)' }}>
              {budgets.length} budget{budgets.length !== 1 ? 's' : ''}
            </span>
            {budgetAlerts > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 'var(--r)',
                background: 'rgba(184,107,107,.15)', color: 'var(--bad)',
              }}>
                {budgetAlerts} alert{budgetAlerts !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            className="mbtn primary"
            onClick={() => { setShowBudgetForm(v => !v); setBudgetForm(BLANK_BUDGET_FORM); }}
          >
            {showBudgetForm ? '✕ Cancel' : '+ New Budget'}
          </button>
        </div>

        {/* Budget form */}
        {showBudgetForm && (
          <div className="card" style={{ padding: '16px 18px', marginBottom: 12 }}>
            <div className="label" style={{ marginBottom: 14 }}>New Spend Budget</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 100px 80px auto', gap: 10, alignItems: 'end' }}>
              <div>
                <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Project (blank = all)</div>
                <input
                  value={budgetForm.project}
                  onChange={e => setBudgetForm(f => ({ ...f, project: e.target.value }))}
                  placeholder="e.g. observatory"
                  style={{ ...INPUT_STYLE, fontSize: 12, color: 'var(--mist)' }}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Provider (blank = all)</div>
                <input
                  value={budgetForm.provider}
                  onChange={e => setBudgetForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder="e.g. anthropic"
                  style={{ ...INPUT_STYLE, fontSize: 12, color: 'var(--mist)' }}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Limit (USD)</div>
                <input
                  type="number"
                  value={budgetForm.limitUsd}
                  onChange={e => setBudgetForm(f => ({ ...f, limitUsd: e.target.value }))}
                  placeholder="100"
                  style={{ ...INPUT_STYLE, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--mist)' }}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Period</div>
                <select
                  value={budgetForm.period}
                  onChange={e => setBudgetForm(f => ({ ...f, period: e.target.value as Period }))}
                  style={INPUT_STYLE}
                >
                  <option value="24H">24 Hours</option>
                  <option value="30D">30 Days</option>
                  <option value="90D">90 Days</option>
                  <option value="1Y">1 Year</option>
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Alert at %</div>
                <input
                  type="number"
                  value={budgetForm.alertPct}
                  onChange={e => setBudgetForm(f => ({ ...f, alertPct: e.target.value }))}
                  placeholder="80"
                  min={1} max={100}
                  style={{ ...INPUT_STYLE, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--mist)' }}
                />
              </div>
              <button
                className="mbtn primary"
                onClick={saveBudget}
                disabled={!budgetForm.limitUsd}
                style={{ alignSelf: 'flex-end', opacity: !budgetForm.limitUsd ? 0.45 : 1 }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Budget cards */}
        {budgets.length === 0 ? (
          <div className="card" style={{ padding: '36px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--steel)', marginBottom: 6 }}>No budgets configured</div>
            <div style={{ fontSize: 11, color: 'var(--graphite)' }}>
              Set spend limits per project or provider to track budget utilisation
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {budgetStatuses.map(b => (
              <div
                key={b.id}
                className="card"
                style={{
                  padding: '14px 16px',
                  border: b.status === 'exceeded'
                    ? '1px solid rgba(184,107,107,.5)'
                    : b.status === 'alert'
                    ? '1px solid rgba(201,150,107,.4)'
                    : '1px solid var(--line-2)',
                  background: b.status === 'exceeded'
                    ? 'rgba(184,107,107,.04)'
                    : b.status === 'alert'
                    ? 'rgba(201,150,107,.04)'
                    : 'rgba(0,0,0,.15)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fog)', marginBottom: 2 }}>
                      {b.project ?? 'All projects'}{b.provider ? ` · ${b.provider}` : ''}
                    </div>
                    <div className="label" style={{ fontSize: 8 }}>{b.period} window</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
                      color: b.status === 'exceeded' ? 'var(--bad)'
                           : b.status === 'alert'    ? '#C9966B'
                           : 'var(--good)',
                    }}>
                      {b.status === 'exceeded' ? 'Over' : b.status === 'alert' ? 'Alert' : 'OK'}
                    </span>
                    <button
                      onClick={() => removeBudget.mutate({ id: b.id })}
                      style={{
                        fontSize: 11, color: 'var(--graphite)', background: 'none',
                        border: 'none', cursor: 'pointer', padding: '0 2px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--bad)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--graphite)')}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--mist)' }}>
                    {fmtUsd(b.spendUsd)}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--graphite)' }}>
                    / {fmtUsd(b.limitUsd)}
                  </span>
                </div>

                <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(b.pct, 100)}%`,
                    borderRadius: 2,
                    background: b.status === 'exceeded' ? 'var(--bad)'
                               : b.status === 'alert'    ? '#C9966B'
                               : 'var(--accent)',
                    transition: 'width 400ms ease-out',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--graphite)' }}>
                    {b.pct.toFixed(1)}%
                  </span>
                  <span className="label" style={{ fontSize: 8 }}>
                    alert at {b.alertPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
