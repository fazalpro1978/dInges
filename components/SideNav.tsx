'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// ── KDE Plasma Breeze Dark palette ────────────────────────────────────────────
// Panel bg:   #1e2228   Border: #2e3440   Accent: #3daee9
// Text:       #eff0f1   Muted:  #7c8694   Active bg: rgba(61,174,233,0.12)

interface SideNavProps {
  open: boolean;
  onClose: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IcPipeline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M20 21H4a1 1 0 01-1-1v-2a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1z" />
    </svg>
  );
}

function IcHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
      <path d="M3 12a9 9 0 105.02-8.04L3 3v4h4" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IcExternal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px] shrink-0">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

function IcClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ── Nav data ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'pipeline',     label: 'Ingest Pipeline',   href: '/',           icon: 'pipeline', external: false },
  { id: 'batch-logs',   label: 'Batch History',     href: '/batch-logs', icon: 'history',  external: false },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SideNav({ open, onClose }: SideNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function iconFor(id: string) {
    if (id === 'pipeline') return <IcPipeline />;
    if (id === 'history')  return <IcHistory />;
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Slide panel */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col shadow-[6px_0_48px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: '#1e2228', borderRight: '1px solid #2e3440' }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #2e3440' }}>
          <div className="flex items-center gap-2.5">
            {/* dInges wordmark */}
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'rgba(61,174,233,0.15)', border: '1px solid rgba(61,174,233,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#3daee9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 3v12M8 11l4 4 4-4" />
                <path d="M20 21H4a1 1 0 01-1-1v-2a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-sm tracking-wide" style={{ color: '#eff0f1' }}>dInges</p>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: '#7c8694' }}>Ingest Service · v1.0</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: '#252b33', border: '1px solid #2e3440', color: '#7c8694' }}
            aria-label="Close navigation"
            onMouseOver={e => (e.currentTarget.style.color = '#3daee9')}
            onMouseOut={e => (e.currentTarget.style.color = '#7c8694')}
          >
            <IcClose />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-5 px-3">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#4e5a6a' }}>
            Workspace
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group"
                  style={{
                    color:      active ? '#3daee9' : '#eff0f1',
                    background: active ? 'rgba(61,174,233,0.12)' : 'transparent',
                    borderLeft: active ? '2px solid #3daee9' : '2px solid transparent',
                    borderRadius: active ? '0 8px 8px 0' : '8px',
                  }}
                  onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ color: active ? '#3daee9' : '#7c8694' }}>
                    {iconFor(item.icon)}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#3daee9' }} />}
                </a>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-3 my-4" style={{ borderTop: '1px solid #2e3440' }} />

          {/* External: open REIMS */}
          <a
            href="https://reims-sigma.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: '#7c8694' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#eff0f1'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#7c8694'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ color: '#7c8694' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            <span className="flex-1 truncate">Open REIMS</span>
            <IcExternal />
          </a>
        </nav>

        {/* Bottom */}
        <div className="shrink-0 px-3 pt-3 pb-5" style={{ borderTop: '1px solid #2e3440' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(61,174,233,0.12)', border: '1px solid rgba(61,174,233,0.25)' }}>
              <span className="text-xs font-bold" style={{ color: '#3daee9' }}>A</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: '#eff0f1' }}>Administrator</p>
              <p className="text-[11px] truncate" style={{ color: '#7c8694' }}>Privé Group · Admin</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
