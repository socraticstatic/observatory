'use client';

import { useState } from 'react';

type Category = 'llm' | 'creative';

interface ProviderDef {
  id: string;
  label: string;
  placeholder: string;
  category: Category;
}

const PROVIDERS: ProviderDef[] = [
  { id: 'anthropic',  label: 'Anthropic Claude', placeholder: 'sk-ant-...',   category: 'llm' },
  { id: 'google',     label: 'Google Gemini',     placeholder: 'AIza...',      category: 'llm' },
  { id: 'xai',        label: 'xAI Grok',          placeholder: 'xai-...',      category: 'llm' },
  { id: 'openai',     label: 'OpenAI',             placeholder: 'sk-...',       category: 'llm' },
  { id: 'mistral',    label: 'Mistral',            placeholder: 'mist-...',     category: 'llm' },
  { id: 'leonardo',   label: 'Leonardo.ai',        placeholder: 'xxxxxxxx-...', category: 'creative' },
  { id: 'heygen',     label: 'HeyGen',             placeholder: 'NjY...',       category: 'creative' },
  { id: 'elevenlabs', label: 'ElevenLabs',         placeholder: 'sk_...',       category: 'creative' },
  { id: 'stability',  label: 'Stability AI',       placeholder: 'sk-...',       category: 'creative' },
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function AddServiceModal({ onClose, onSaved }: Props) {
  const [category, setCategory] = useState<Category>('llm');
  const [provider, setProvider] = useState('anthropic');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const visibleProviders = PROVIDERS.filter(p => p.category === category);
  const prov = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  function switchCategory(c: Category) {
    setCategory(c);
    const first = PROVIDERS.find(p => p.category === c);
    if (first) setProvider(first.id);
    setKey('');
    setStatus('idle');
  }

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
        style={{
          width: 420,
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          background: 'linear-gradient(180deg, #252523 0%, #1E1E1C 100%)',
          border: '1px solid var(--line-2)',
          boxShadow: '0 24px 64px rgba(0,0,0,.72)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--steel)' }}>
            Add Service
          </span>
          <button
            onClick={onClose}
            className="mbtn"
            style={{ padding: '2px 7px', fontSize: 14, lineHeight: 1, color: 'var(--graphite)', borderColor: 'transparent', background: 'none' }}
          >
            ×
          </button>
        </div>

        {/* Category tabs */}
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={category === 'llm' ? 'on' : ''} onClick={() => switchCategory('llm')}>LLM</button>
          <button className={category === 'creative' ? 'on' : ''} onClick={() => switchCategory('creative')}>Creative APIs</button>
        </div>

        {category === 'creative' && (
          <div style={{
            fontSize: 10, color: 'var(--steel)', lineHeight: 1.6,
            borderLeft: '2px solid var(--accent)', paddingLeft: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Creative APIs are registered and key-stored only. Cost tracking requires manual entry or future ingest integration.
          </div>
        )}

        {/* Provider select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="label" style={{ fontSize: 9 }}>Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            style={{
              background: 'var(--ink-2)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--r)',
              color: 'var(--mist)',
              fontSize: 11,
              padding: '7px 10px',
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
            }}
          >
            {visibleProviders.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* API key input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="label" style={{ fontSize: 9 }}>API Key</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={prov.placeholder}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              style={{
                flex: 1,
                background: 'var(--ink-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r)',
                color: 'var(--mist)',
                fontSize: 11,
                padding: '7px 10px',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: show ? undefined : '.08em',
              }}
            />
            <button
              onClick={() => setShow(s => !s)}
              className="mbtn"
              style={{ padding: '0 12px', fontSize: 10 }}
            >
              {show ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {status === 'err' && (
          <span style={{ fontSize: 10, color: 'var(--bad)', fontFamily: "'JetBrains Mono', monospace" }}>{errMsg}</span>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <button
            onClick={onClose}
            className="mbtn"
            style={{ fontSize: 11, padding: '6px 16px' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!key.trim() || status === 'saving' || status === 'ok'}
            className="mbtn"
            style={{
              fontSize: 11,
              padding: '6px 16px',
              borderColor: status === 'ok'
                ? 'rgba(124,168,147,.4)'
                : 'rgba(111,168,179,.35)',
              color: status === 'ok'
                ? 'var(--good)'
                : 'var(--accent-2)',
              background: status === 'ok'
                ? 'linear-gradient(180deg, #1A2420, #131A17)'
                : 'linear-gradient(180deg, #251E18, #1A1410)',
              opacity: !key.trim() || status === 'saving' ? 0.45 : 1,
            }}
          >
            {status === 'saving' ? 'Saving...' : status === 'ok' ? 'Saved' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
