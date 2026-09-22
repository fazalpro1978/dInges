'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../lib/supabaseClient';

interface Strength { len: boolean; upper: boolean; num: boolean; special: boolean; }

function level(s: Strength) { return [s.len, s.upper, s.num, s.special].filter(Boolean).length; }

const STR_COLORS = ['', '#ef4444', '#f59e0b', '#f59e0b', '#3daee9'];
const STR_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function ResetForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [ready,    setReady   ] = useState(false);
  const [expired,  setExpired ] = useState(false);
  const [newPw,    setNewPw   ] = useState('');
  const [confirm,  setConfirm ] = useState('');
  const [showPw,   setShowPw  ] = useState(false);
  const [strength, setStrength] = useState<Strength>({ len: false, upper: false, num: false, special: false });
  const [busy,     setBusy    ] = useState(false);
  const [error,    setError   ] = useState('');
  const [done,     setDone    ] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) setReady(true);
      if (event === 'SIGNED_IN' && searchParams.get('type') === 'recovery') setReady(true);
    });

    const tokenHash = searchParams.get('token_hash');
    if (tokenHash && searchParams.get('type') === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error: e }) => {
        if (e) setExpired(true); else setReady(true);
      });
    }

    const t = setTimeout(() => setExpired(prev => prev || !ready), 4000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPwChange(v: string) {
    setNewPw(v);
    setStrength({ len: v.length >= 8, upper: /[A-Z]/.test(v), num: /[0-9]/.test(v), special: /[^A-Za-z0-9]/.test(v) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPw !== confirm) { setError('Passwords do not match.'); return; }
    if (level(strength) < 4) { setError('Password does not meet all requirements.'); return; }
    setError('');
    setBusy(true);
    const { error: authErr } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (authErr) { setError(authErr.message); return; }
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.replace('/login'), 2500);
  }

  const lv = level(strength);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0d1117' }}>
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(61,174,233,0.05) 0%, transparent 60%)' }} />

      <div className="w-full max-w-[360px] relative">
        <div className="text-center mb-8">
          <p className="text-[#3daee9] text-[9px] font-bold uppercase tracking-[0.28em] mb-1">AXIOM</p>
          <h1 className="text-white text-xl font-bold">Reset Password</h1>
        </div>

        <div className="bg-[#1e2228] border border-[#2e3440] rounded-xl p-7 shadow-[0_24px_64px_rgba(0,0,0,0.7)]">

          {done && (
            <div className="py-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl"
                style={{ background: '#3daee920', border: '1px solid #3daee940' }}>✓</div>
              <p className="font-semibold text-sm" style={{ color: '#eff0f1' }}>Password updated</p>
              <p className="text-xs" style={{ color: '#7c8694' }}>Redirecting to sign in…</p>
            </div>
          )}

          {!done && expired && !ready && (
            <div className="py-4 text-center space-y-3">
              <p className="font-semibold text-sm" style={{ color: '#ef4444' }}>Link expired or invalid</p>
              <p className="text-xs" style={{ color: '#7c8694' }}>Please request a new reset link from the login page.</p>
              <button onClick={() => router.replace('/login')} className="text-xs" style={{ color: '#3daee9' }}>← Sign In</button>
            </div>
          )}

          {!done && !expired && !ready && (
            <div className="py-6 text-center text-xs" style={{ color: '#7c8694' }}>Verifying reset link…</div>
          )}

          {!done && ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>New Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required value={newPw} onChange={e => onPwChange(e.target.value)}
                    className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm outline-none"
                    style={{ background: '#141720', border: '1px solid #2e3440', color: '#eff0f1' }}
                    onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                    onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPw
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {newPw && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= lv ? STR_COLORS[lv] : '#2e3440', transition: 'background .2s' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                      {([['len','8+ chars'],['upper','Uppercase'],['num','Number'],['special','Special']] as [keyof Strength, string][]).map(([k,l]) => (
                        <span key={k} style={{ fontSize: 10, color: strength[k] ? '#3daee9' : '#44505e', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {strength[k] ? '✓' : '○'} {l}
                        </span>
                      ))}
                    </div>
                    {lv > 0 && <p style={{ fontSize: 10, color: STR_COLORS[lv], marginTop: 4 }}>{STR_LABELS[lv]}</p>}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Confirm Password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={{ background: '#141720', border: '1px solid #2e3440', color: '#eff0f1' }}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                {confirm && confirm !== newPw && <p style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>Passwords do not match</p>}
              </div>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#ef4444', background: '#ef444415', border: '1px solid #ef444430' }}>{error}</p>
              )}

              <button type="submit" disabled={busy} className="w-full font-bold text-sm py-2.5 rounded-lg mt-1"
                style={{ background: busy ? '#1e2228' : '#3daee9', color: busy ? '#555' : '#0d1117', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Updating…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
