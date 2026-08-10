'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from 'react';
import { User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import supabase from '../lib/supabaseClient';

export type UserRole = 'superuser' | 'administrator' | 'staff' | 'agent' | 'public';

export interface AuthProfile {
  id:       string;
  email:    string;
  fullName: string;
  role:     UserRole;
}

interface AuthCtx {
  user:    AuthProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null, loading: true, signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user,    setUser   ] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authUser: User) => {
    const { data } = await supabase
      .from('profiles')
      .select('id,email,full_name,role,is_active,registration_status')
      .eq('id', authUser.id)
      .single();

    if (!data) {
      await supabase.auth.signOut();
      router.replace('/login?reason=no-access');
      return;
    }

    if (data.registration_status === 'rejected') {
      await supabase.auth.signOut();
      router.replace('/login?reason=rejected');
      return;
    }

    if (data.registration_status === 'pending' || !data.is_active) {
      await supabase.auth.signOut();
      router.replace(data.registration_status === 'pending' ? '/login?reason=pending' : '/login?reason=no-access');
      return;
    }

    // AXIOM: only superuser and administrator can access
    if (!['superuser','administrator'].includes(data.role)) {
      await supabase.auth.signOut();
      router.replace('/login?reason=no-access');
      return;
    }

    setUser({
      id:       data.id,
      email:    data.email,
      fullName: data.full_name ?? data.email.split('@')[0],
      role:     data.role as UserRole,
    });
  }, [router]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setLoading(true);
        fetchProfile(session.user).finally(() => setLoading(false));
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Route guard
  useEffect(() => {
    if (loading) return;
    const isPublicRoute = pathname?.startsWith('/login');
    if (!user && !isPublicRoute) router.replace('/login');
  }, [user, loading, pathname, router]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.replace('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
