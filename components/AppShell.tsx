'use client';

import React, { createContext, useContext, useState } from 'react';
import { usePathname } from 'next/navigation';
import SideNav from './SideNav';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

interface NavCtx { openNav: () => void }
const NavContext = createContext<NavCtx>({ openNav: () => {} });
export const useNav = () => useContext(NavContext);

function Shell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const { loading, user } = useAuth();

  // Login page — no chrome
  if (pathname?.startsWith('/login')) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#3daee930', borderTopColor: '#3daee9' }} />
          <p className="text-xs" style={{ color: '#7c8694' }}>Loading…</p>
        </div>
      </div>
    );
  }

  // AuthContext redirects unauthorized users — render nothing while redirect fires
  if (!user) return null;

  return (
    <NavContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      {children}
    </NavContext.Provider>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
