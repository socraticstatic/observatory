'use client';

interface Props {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          style={{
            background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
            padding: '2px 1px', fontSize: 14, lineHeight: 1,
            color: (value ?? 0) >= star ? '#C9966B' : 'var(--line-2)',
            transition: 'color 120ms',
          }}
          aria-label={`Rate ${star} out of 5`}
          aria-pressed={value === star}
          title={`Rate ${star}`}
        >
          ★
        </button>
      ))}
      {value != null && (
        <span className="mono" style={{ fontSize: 9, color: 'var(--steel)', marginLeft: 3 }}>
          {value}/5
        </span>
      )}
    </div>
  );
}
