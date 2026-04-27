'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { ViewStatusBar } from '@/components/shared/ViewStatusBar';

export function DatasetsView() {
  const utils = trpc.useUtils();
  const { data: datasets, isLoading } = trpc.datasets.list.useQuery();
  const createMutation = trpc.datasets.create.useMutation({
    onSuccess: () => {
      setNewName('');
      setShowCreate(false);
      utils.datasets.list.invalidate();
    },
  });
  const removeItemMutation = trpc.datasets.removeItem.useMutation({
    onSuccess: () => {
      if (selectedId) utils.datasets.items.invalidate({ datasetId: selectedId });
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName]       = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: items } = trpc.datasets.items.useQuery(
    { datasetId: selectedId! },
    { enabled: !!selectedId }
  );

  return (
    <>
      <ViewStatusBar />
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, marginTop: 16 }}>

        {/* Dataset list panel */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--line-2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span className="label">DATASETS</span>
            <button
              className="btn-secondary"
              style={{ fontSize: 10, padding: '3px 8px' }}
              onClick={() => setShowCreate(c => !c)}
            >
              + NEW
            </button>
          </div>

          {showCreate && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2)' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Dataset name"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newName.trim()) {
                    createMutation.mutate({ name: newName.trim() });
                  }
                }}
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--bg-1)', border: '1px solid var(--line-2)',
                  borderRadius: 4, padding: '5px 8px',
                  color: 'var(--mist)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                }}
              />
              <div className="mono" style={{ fontSize: 9, color: 'var(--steel)', marginTop: 4 }}>
                Press Enter to create
              </div>
            </div>
          )}

          {isLoading && (
            <div style={{ padding: '12px 14px' }}>
              <span className="label">Loading…</span>
            </div>
          )}

          {(datasets ?? []).map(ds => (
            <button
              key={ds.id}
              onClick={() => setSelectedId(ds.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px',
                background: selectedId === ds.id ? 'rgba(111,168,179,.08)' : 'none',
                border: 'none', borderBottom: '1px solid var(--line-2)', cursor: 'pointer',
                borderLeft: selectedId === ds.id ? '2px solid var(--accent-2)' : '2px solid transparent',
              }}
            >
              <div className="mono" style={{ fontSize: 12, color: 'var(--mist)' }}>{ds.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
                {ds.itemCount} {ds.itemCount === 1 ? 'trace' : 'traces'}
              </div>
            </button>
          ))}

          {!isLoading && (datasets ?? []).length === 0 && (
            <div style={{ padding: '16px 14px' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
                No datasets yet.{' '}
                <span style={{ color: 'var(--graphite)' }}>Pin traces from the Traces view.</span>
              </span>
            </div>
          )}
        </div>

        {/* Dataset items panel */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          {!selectedId ? (
            <div style={{ padding: '24px 20px' }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--steel)' }}>
                Select a dataset to view pinned traces.
              </span>
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
                <span className="label">
                  {datasets?.find(d => d.id === selectedId)?.name ?? 'Dataset'} — PINNED TRACES
                </span>
              </div>

              {(items ?? []).map(item => (
                <div
                  key={item.id}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--line-2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>
                      event:{item.eventId.slice(0, 12)}…
                    </div>
                    {item.note && (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
                        {item.note}
                      </div>
                    )}
                    <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)', marginTop: 2 }}>
                      {new Date(item.addedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 10, padding: '3px 8px', color: 'var(--bad)' }}
                    onClick={() => removeItemMutation.mutate({ id: item.id })}
                  >
                    REMOVE
                  </button>
                </div>
              ))}

              {(items ?? []).length === 0 && (
                <div style={{ padding: '16px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
                    No pinned traces in this dataset.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
