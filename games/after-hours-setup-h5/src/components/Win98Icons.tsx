import type { CSSProperties } from 'react';

export function OuthookBannerIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 32" className={className}>
      <rect x="2" y="6" width="34" height="22" rx="4" fill="#ffffff" stroke="#93c5fd" strokeWidth="1.6" />
      <path d="M3 8l16 11L35 8" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M27 22V6a4.5 4.5 0 0 1 9 0v11a2.5 2.5 0 0 1-5 0V8"
        fill="none"
        stroke="#facc15"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MiniEnvelopeIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={className}>
      <rect x="1" y="1" width="18" height="12" rx="2" fill="#eff6ff" stroke="#64748b" strokeWidth="1.3" />
      <path d="M2 2l8 6 8-6" fill="none" stroke="#2563eb" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ToolbarIcon({ name }: { name: 'delete' | 'recover' | 'deleteRead' | 'settings' | 'pause' | 'help' | 'music' | 'musicOff' }) {
  const cls = 'w-4 h-4 shrink-0';
  if (name === 'music') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M8 14.5V5.5l8-1.5v9" />
        <circle cx="5.75" cy="14.75" r="2.25" />
        <circle cx="13.75" cy="13.25" r="2.25" />
      </svg>
    );
  }
  if (name === 'musicOff') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M8 14.5V5.5l8-1.5v5.5" />
        <circle cx="5.75" cy="14.75" r="2.25" />
        <path d="M3.5 3.5l13 13" />
      </svg>
    );
  }
  if (name === 'delete') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M3 5h14M8 5V3h4v2M6 5l1 12h6l1-12M8.5 8.5v5M11.5 8.5v5" />
      </svg>
    );
  }
  if (name === 'recover') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M4 8a6 6 0 1 1 1.8 4.3M4 4v4h4" />
      </svg>
    );
  }
  if (name === 'deleteRead') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M3 6h14v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM3 6l7 5 7-5" />
        <path d="M13 3l3 3" />
      </svg>
    );
  }
  if (name === 'settings') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <circle cx="10" cy="10" r="2.8" />
        <path d="M10 2.5v2M10 15.5v2M3.5 6.2l1.7 1M14.8 12.8l1.7 1M3.5 13.8l1.7-1M14.8 7.2l1.7-1" />
      </svg>
    );
  }
  if (name === 'pause') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <rect x="5" y="4" width="3.5" height="12" rx="1" />
        <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.8a2.3 2.3 0 1 1 3.4 2c-.7.4-1.2 1-1.2 1.8" />
      <circle cx="10" cy="14.2" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function TreeIcon({ name }: { name: 'root' | 'user' | 'inbox' | 'trash' }) {
  const cls = 'w-4 h-4 shrink-0';
  if (name === 'root') return <MiniEnvelopeIcon className="w-4 h-3 shrink-0" />;
  if (name === 'user') {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" className={cls}>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
      </svg>
    );
  }
  if (name === 'inbox') {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" className={cls}>
        <path d="M2.5 9l1.8-5.5h7.4L13.5 9v4.5h-11z" fill="#eff6ff" />
        <path d="M2.5 9h3.5l1 1.5h2L10 9h3.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.8 8.5h4.4l.8-8.5" />
    </svg>
  );
}

export function InstallerExeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#eff6ff" stroke="#2563eb" strokeWidth="1.6" />
      <path d="M3 9h18" stroke="#2563eb" strokeWidth="1.5" />
      <path d="M12 12v5m-2.5-2.2L12 17.3l2.5-2.5" stroke="#1d4ed8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoneyIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.7" />
      <path d="M12 7v10M14.5 9.5c0-1-1.1-1.5-2.5-1.5s-2.5.6-2.5 1.6c0 2.4 5 1.4 5 4 0 1-1.1 1.7-2.5 1.7s-2.5-.6-2.5-1.6" stroke="#15803d" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SetupArtwork({
  variant = 'classic',
  className = '',
  style,
}: {
  variant?: 'classic' | 'alt';
  className?: string;
  style?: CSSProperties;
}) {
  const bg =
    variant === 'alt'
      ? 'linear-gradient(165deg, #2b6777 0%, #1d4654 100%)'
      : 'linear-gradient(165deg, #3a838b 0%, #245760 100%)';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 360"
      className={className}
      style={{ background: bg, ...style }}
      preserveAspectRatio="xMidYMin meet"
    >
      {/* Subtle blueprint grid lines */}
      <path d="M0 70h200M0 140h200M0 210h200M0 280h200" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Desktop chassis */}
      <polygon points="48,108 106,82 154,104 96,132" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points="48,108 96,132 96,148 48,124" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points="96,132 154,104 154,120 96,148" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="68" y1="121" x2="88" y2="131" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      {/* Monitor */}
      <polygon points="58,44 114,26 150,42 94,64" fill="#f1f5f9" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points="58,44 94,64 94,104 58,84" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points="94,64 150,42 150,76 94,104" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
      <polygon points="63,51 89,65 89,94 63,80" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Window panes */}
      <polygon points="69,62 79,67 79,79 69,74" fill="#ffffff" stroke="#0f172a" strokeWidth="1.1" />
      <polygon points="75,65 85,70 85,82 75,77" fill="#fde047" stroke="#0f172a" strokeWidth="1.1" />
      {/* Software box */}
      <polygon points="18,148 56,130 92,148 54,168" fill="#ffffff" stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points="18,148 54,168 54,182 18,162" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points="54,168 92,148 92,164 54,182" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points="40,138 56,130 82,143 66,151" fill="#ec4899" />
      {/* Disc */}
      <ellipse cx="64" cy="216" rx="22" ry="15" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.6" />
      <path d="M64 216 L47 207 A22 15 0 0 1 64 201 Z" fill="#34d399" opacity="0.85" />
      <path d="M64 216 L81 225 A22 15 0 0 1 64 231 Z" fill="#34d399" opacity="0.85" />
      <path d="M64 216 L78 205 A22 15 0 0 1 86 216 Z" fill="#60a5fa" opacity="0.75" />
      <ellipse cx="64" cy="216" rx="5.5" ry="3.8" fill="#2b6b76" stroke="#0f172a" strokeWidth="1.3" />
      {/* Floppies */}
      {[
        { x: 108, y: 164 },
        { x: 104, y: 184 },
        { x: 118, y: 214 },
        { x: 64, y: 248 },
        { x: 102, y: 256 },
      ].map((d, i) => (
        <g key={i} transform={`translate(${d.x},${d.y})`}>
          <polygon points="0,8 18,0 32,8 14,16" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="0,8 14,16 14,20 0,12" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="14,16 32,8 32,12 14,20" fill="#64748b" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="12,3 20,0 26,3 18,6" fill="#f43f5e" />
        </g>
      ))}
      {/* Note pad */}
      <polygon points="58,284 82,276 102,290 78,300" fill="#ffffff" stroke="#0f172a" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="68" y1="285" x2="86" y2="291" stroke="#3b82f6" strokeWidth="1.6" />
      <line x1="65" y1="289" x2="82" y2="295" stroke="#3b82f6" strokeWidth="1.6" />
      <line x1="62" y1="274" x2="86" y2="287" stroke="#facc15" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="60" y1="273" x2="64" y2="275" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
