'use client';

import React, { createContext, useContext, useState } from 'react';
import SideNav from './SideNav';

interface NavCtx { openNav: () => void }
const NavContext = createContext<NavCtx>({ openNav: () => {} });
export const useNav = () => useContext(NavContext);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <NavContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      {children}
    </NavContext.Provider>
  );
}
