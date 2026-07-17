'use client';

import React from 'react';

// KDE Plasma Breeze Dark topbar for dInges

export default function TopBar({
  onMenuClick,
  title,
  subtitle,
  right,
}: {
  onMenuClick?: () => void;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 px-5 py-0"
      style={{
        background: '#1a1d22',
        borderBottom: '1px solid #2e3440',
        minHeight: '52px',
      }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="flex w-8 h-8 rounded-lg items-center justify-center transition-colors shrink-0"
        style={{ background: '#252b33', border: '1px solid #2e3440', color: '#7c8694' }}
        onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#3daee9'; }}
        onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#7c8694'; }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
          <path d="M3 6h18M3 12h16M3 18h12" />
        </svg>
      </button>

      {/* Brand mark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-md" style={{ background: 'rgba(61,174,233,0.12)', border: '1px solid rgba(61,174,233,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#3daee9" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M12 3v12M8 11l4 4 4-4" />
            <path d="M20 21H4a1 1 0 01-1-1v-2a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1z" />
          </svg>
        </div>
        <span className="font-bold text-sm tracking-wide" style={{ color: '#3daee9' }}>Axiom</span>
        <span className="text-[11px] hidden sm:block" style={{ color: '#4e5a6a' }}>·</span>
        {title && (
          <span className="text-[13px] font-semibold hidden sm:block" style={{ color: '#eff0f1' }}>{title}</span>
        )}
        {subtitle && (
          <span className="text-[11px] hidden md:block" style={{ color: '#7c8694' }}>{subtitle}</span>
        )}
      </div>

      {/* Right slot */}
      <div className="ml-auto flex items-center gap-2">
        {right}

        {/* Admin badge */}
        <span className="text-[11px] font-medium hidden md:block" style={{ color: '#7c8694' }}>Admin Console</span>
        <div className="hidden md:block w-px h-4 mx-1" style={{ background: '#2e3440' }} />

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center cursor-default" style={{ background: 'rgba(61,174,233,0.12)', border: '1px solid rgba(61,174,233,0.25)' }}>
          <span className="text-xs font-bold select-none" style={{ color: '#3daee9' }}>A</span>
        </div>
      </div>
    </header>
  );
}
