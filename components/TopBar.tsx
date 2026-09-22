'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// KDE Plasma Breeze Dark topbar for AXIOM

const ROLE_LABEL: Record<string, string> = {
  superuser: 'Superuser', administrator: 'Administrator',
  staff: 'Staff', agent: 'Agent', public: 'Public',
};

const ROLE_COLOR: Record<string, string> = {
  superuser:     '#c9a84c',
  administrator: '#3daee9',
  staff:         '#10b981',
  agent:         '#8b5cf6',
  public:        '#64748b',
};

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
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userBtnRef  = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userBtnRef.current?.contains(e.target as Node)) return;
      if (userMenuRef.current?.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [userMenuOpen]);

  const initials = user
    ? user.fullName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';
  const roleColor = ROLE_COLOR[user?.role ?? ''] ?? '#3daee9';

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

        {/* Role badge */}
        {user && (
          <span
            className="hidden md:inline-flex text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded"
            style={{ color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}30` }}
          >
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        )}

        <div className="hidden md:block w-px h-4 mx-1" style={{ background: '#2e3440' }} />

        {/* Admin Console label */}
        <span className="text-[11px] font-medium hidden md:block" style={{ color: '#7c8694' }}>Admin Console</span>
        <div className="hidden md:block w-px h-4 mx-1" style={{ background: '#2e3440' }} />

        {/* Avatar + dropdown */}
        <div className="relative">
          <button
            ref={userBtnRef}
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
            style={{ background: `${roleColor}18`, border: `1px solid ${roleColor}35` }}
            title={user?.fullName ?? 'User'}
          >
            <span className="text-xs font-bold select-none" style={{ color: roleColor }}>{initials}</span>
          </button>

          {userMenuOpen && (
            <div
              ref={userMenuRef}
              className="absolute top-full right-0 mt-2 w-56 rounded-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
              style={{ background: '#1e2228', border: '1px solid #2e3440', zIndex: 200 }}
            >
              {/* User info */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #2e3440' }}>
                <p className="text-sm font-semibold truncate" style={{ color: '#eff0f1' }}>{user?.fullName ?? '—'}</p>
                <p className="text-[11px] truncate mt-0.5" style={{ color: '#7c8694' }}>{user?.email ?? ''}</p>
                <span
                  className="inline-flex mt-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: roleColor, background: `${roleColor}18` }}
                >
                  {ROLE_LABEL[user?.role ?? ''] ?? ''}
                </span>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { setUserMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
                style={{ color: '#7c8694' }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.05)'; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#7c8694'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
