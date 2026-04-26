'use client';

interface Props {
  view: string;
  setView: (v: string) => void;
  expanded: boolean;
  setExpanded: (e: boolean) => void;
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  Pulse: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,8 4,8 5.5,3 7.5,13 9.5,6 11,8 15,8" />
    </svg>
  ),
  What: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M6,6 C6,4.9 6.9,4 8,4 C9.1,4 10,4.9 10,6 C10,7.5 8,8.5 8,9.5" />
      <circle cx="8" cy="11.5" r=".5" fill="currentColor" />
    </svg>
  ),
  Who: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3,13.5 C3,11 5.2,9 8,9 C10.8,9 13,11 13,13.5" />
    </svg>
  ),
  Where: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8,14 C8,14 3,9.5 3,6.5 C3,3.7 5.2,2 8,2 C10.8,2 13,3.7 13,6.5 C13,9.5 8,14 8,14 Z" />
      <circle cx="8" cy="6.5" r="1.5" />
    </svg>
  ),
  When: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4.5 8,8 10.5,9.5" />
    </svg>
  ),
  How: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2,13 L5,7 L8,10 L11,4 L14,8" />
      <circle cx="14" cy="8" r="1" fill="currentColor" />
    </svg>
  ),
  Traces: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="2.5" rx="1" />
      <rect x="2" y="6.8" width="8" height="2.5" rx="1" />
      <rect x="2" y="10.5" width="10" height="2.5" rx="1" />
    </svg>
  ),
  Costs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8,4 L8,5" />
      <path d="M8,11 L8,12" />
      <path d="M5.5,6.5 C5.5,5.7 6.2,5 8,5 C9.5,5 10.5,5.7 10.5,6.5 C10.5,8.5 5.5,8 5.5,9.5 C5.5,10.3 6.5,11 8,11 C9.8,11 10.5,10.3 10.5,9.5" />
    </svg>
  ),
  Sessions: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="9" rx="1.5" />
      <path d="M5,14 L11,14" />
      <path d="M8,11 L8,14" />
    </svg>
  ),
  Rules: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3,4 L13,4" />
      <path d="M3,8 L10,8" />
      <path d="M3,12 L8,12" />
    </svg>
  ),
  Archive: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="3" rx="1" />
      <path d="M3,5 L3,13 C3,13.6 3.4,14 4,14 L12,14 C12.6,14 13,13.6 13,13 L13,5" />
      <path d="M6.5,9 L9.5,9" />
    </svg>
  ),
  Intel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <circle cx="2.5" cy="4" r="1" />
      <circle cx="13.5" cy="4" r="1" />
      <circle cx="2.5" cy="12" r="1" />
      <circle cx="13.5" cy="12" r="1" />
      <path d="M8,6 L3.4,4.7 M8,6 L12.6,4.7 M8,10 L3.4,11.3 M8,10 L12.6,11.3" />
    </svg>
  ),
  Collapse: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10,4 L6,8 L10,12" />
    </svg>
  ),
};

const CollapsedIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6,4 L10,8 L6,12" />
  </svg>
);

const PRIMARY_NAV = ['Pulse', 'Traces', 'Costs', 'Intel', 'Sessions'] as const;
const FIVE_W = ['What', 'Who', 'Where', 'When', 'How'] as const;
const SECONDARY_NAV = ['Rules', 'Archive'] as const;

export function Sidebar({ view, setView, expanded, setExpanded }: Props) {
  function handleFiveW(label: string) {
    setView('Pulse');
    setTimeout(() => {
      const el = document.getElementById(`5w-${label.toLowerCase()}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  return (
    <nav className="rail">
      {/* Logo */}
      <div className="rail-logo">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="1" width="20" height="20" rx="2" stroke="#6FA8B3" strokeWidth="1.5" fill="none" />
          <rect x="4" y="4" width="14" height="14" rx="1.5" stroke="#9BC4CC" strokeWidth="1" fill="none" />
          <rect x="7.5" y="7.5" width="7" height="7" rx="1" fill="#6FA8B3" opacity=".8" />
        </svg>
        {expanded && (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Observatory
          </span>
        )}
      </div>

      {/* Primary nav */}
      {PRIMARY_NAV.map((label) => (
        <button
          key={label}
          className={`rail-item${view === label ? ' on' : ''}`}
          onClick={() => setView(label)}
          title={!expanded ? label : undefined}
        >
          {NAV_ICONS[label]}
          {expanded && label}
        </button>
      ))}

      {/* 5W section */}
      <div className="rail-sep" />
      {FIVE_W.map((label) => (
        <button
          key={label}
          className="rail-item"
          onClick={() => handleFiveW(label)}
          title={!expanded ? label : undefined}
        >
          {NAV_ICONS[label]}
          {expanded && label}
        </button>
      ))}

      {/* Secondary nav */}
      <div className="rail-sep" />
      {SECONDARY_NAV.map((label) => (
        <button
          key={label}
          className={`rail-item${view === label ? ' on' : ''}`}
          onClick={() => setView(label)}
          title={!expanded ? label : undefined}
        >
          {NAV_ICONS[label]}
          {expanded && label}
        </button>
      ))}

      {/* Collapse toggle */}
      <div className="rail-toggle">
        <button
          className="rail-item"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? 'Collapse' : 'Expand'}
          style={{ transform: expanded ? 'none' : 'none' }}
        >
          {expanded ? NAV_ICONS['Collapse'] : CollapsedIcon}
          {expanded && 'Collapse'}
        </button>
      </div>
    </nav>
  );
}
