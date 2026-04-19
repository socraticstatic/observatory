'use client';

import { useState } from 'react';

const PROVIDERS = [
  { id: 'google', label: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'xai',    label: 'xAI Grok',      placeholder: 'xai-...' },
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function AddServiceModal({ onClose, onSaved }: Props) {
  const [provider, setProvider] = useState('xai');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const prov = PROVIDERS.find(p => p.id === provider)!;

  async function save() {
    if (!key.trim()) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'unknown error');
      setStatus('ok');
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus('err');
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card"
        style={{ width: 380, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mist)' }}>
            Add Service
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--graphite)', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Provider select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="label" style={{ fontSize: 9 }}>PROVIDER</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 4,
              color: 'var(--mist)',
              fontSize: 12,
              padding: '7px 10px',
              outline: 'none',
            }}
          >
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* API key input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="label" style={{ fontSize: 9 }}>API KEY</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={prov.placeholder}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              style={{
                flex: 1,
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 4,
                color: 'var(--mist)',
                fontSize: 12,
                padding: '7px 10px',
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => setShow(s => !s)}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 4,
                color: 'var(--steel)',
                fontSize: 10,
                padding: '0 10px',
                cursor: 'pointer',
              }}
            >
              {show ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {status === 'err' && (
          <span style={{ fontSize: 10, color: '#e57373' }}>{errMsg}</span>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--line)',
              borderRadius: 4, color: 'var(--graphite)',
              fontSize: 11, padding: '6px 14px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!key.trim() || status === 'saving' || status === 'ok'}
            style={{
              background: status === 'ok' ? '#4caf50' : 'var(--accent)',
              border: 'none', borderRadius: 4,
              color: '#fff', fontSize: 11,
              padding: '6px 14px', cursor: 'pointer',
              opacity: !key.trim() || status === 'saving' ? 0.5 : 1,
            }}
          >
            {status === 'saving' ? 'Saving...' : status === 'ok' ? 'Saved' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
