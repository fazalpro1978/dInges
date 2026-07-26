'use client';

import { useState, useEffect, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const reason       = searchParams.get('reason');

  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading ] = useState(false);
  const [error,    setError   ] = useState('');
  const [showPw,   setShowPw  ] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/');
    });
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authErr) {
      setError(authErr.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : authErr.message);
    } else {
      router.replace('/');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0d1117' }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(61,174,233,0.05) 0%, transparent 60%)' }}
      />
      <div className="w-full max-w-[360px] relative">
        <div className="text-center mb-8">
          <p className="text-[#3daee9] text-[9px] font-bold uppercase tracking-[0.28em] mb-1">AXIOM</p>
          <h1 className="text-white text-xl font-bold">Ingest Service</h1>
          <p className="text-[#7c8694] text-xs mt-1">Superusers &amp; Administrators only</p>
        </div>

        <div className="bg-[#1e2228] border border-[#2e3440] rounded-xl p-7 shadow-[0_24px_64px_rgba(0,0,0,0.7)]">
          {reason === 'no-access' && (
            <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#ef444415', border: '1px solid #ef444430', color: '#ef4444' }}>
              Your account does not have access to AXIOM. Contact your administrator.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>
                Email Address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@privegroupre.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: '#141720', border: '1px solid #2e3440', color: '#eff0f1',
                }}
                onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                onBlur={e => { e.target.style.borderColor = '#2e3440'; }}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm outline-none transition-colors"
                  style={{ background: '#141720', border: '1px solid #2e3440', color: '#eff0f1' }}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#555' }}
                >
                  {showPw
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#ef4444', background: '#ef444415', border: '1px solid #ef444430' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold text-sm py-2.5 rounded-lg transition-colors mt-1"
              style={{
                background: loading ? '#1e2228' : '#3daee9',
                color: loading ? '#555' : '#0d1117',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: '#2e3440' }}>
          AXIOM · Restricted Access
        </p>
      </div>
    </div>
  );
}
