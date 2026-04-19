'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '280px',
          padding: '24px',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '4px',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--steel)',
            marginBottom: '8px',
          }}
        >
          Observatory
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
          style={{
            background: 'var(--ink)',
            border: '1px solid var(--line-2)',
            borderRadius: '4px',
            color: 'var(--mist)',
            padding: '8px 10px',
            fontSize: '13px',
            outline: 'none',
          }}
        />

        {error && (
          <div style={{ color: 'var(--bad)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? 'var(--steel)' : 'var(--accent)',
            color: 'var(--ink-2)',
            border: 'none',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
