'use client';

export function TracesView() {
  return (
    <div className="page">
      <div className="card" style={{ padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <div className="label" style={{ marginBottom: 12 }}>Traces</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--mist)', marginBottom: 8 }}>LLM call log table</div>
        <div style={{ fontSize: 13, color: 'var(--steel)' }}>Coming soon</div>
      </div>
    </div>
  );
}
