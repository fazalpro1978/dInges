'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import supabase from '../../lib/supabaseClient';

type Mode = 'login' | 'register';
interface PwStrength { len: boolean; upper: boolean; num: boolean; special: boolean; }

function strengthLevel(s: PwStrength): number {
  return [s.len, s.upper, s.num, s.special].filter(Boolean).length;
}

function StrengthBar({ s }: { s: PwStrength }) {
  const level  = strengthLevel(s);
  const colors = ['#ef4444', '#f59e0b', '#f59e0b', '#3daee9', '#3daee9'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= level ? colors[level] : '#2e3440', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {[
          { key: 'len',     label: '8+ chars' },
          { key: 'upper',   label: 'Uppercase' },
          { key: 'num',     label: 'Number' },
          { key: 'special', label: 'Special char' },
        ].map(({ key, label }) => (
          <span key={key} style={{ fontSize: 10, color: s[key as keyof PwStrength] ? '#3daee9' : '#44505e', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>{s[key as keyof PwStrength] ? '✓' : '○'}</span>{label}
          </span>
        ))}
      </div>
      {level > 0 && <p style={{ margin: '6px 0 0', fontSize: 10, color: colors[level] }}>{labels[level]}</p>}
    </div>
  );
}

function EyeOpen() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function EyeOff() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>;
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const reason       = searchParams.get('reason');
  const { user, loading } = useAuth();

  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [email,     setEmail    ] = useState('');
  const [password,  setPassword ] = useState('');
  const [busy,      setBusy     ] = useState(false);
  const [error,     setError    ] = useState('');
  const [showPw,    setShowPw   ] = useState(false);

  // Register state
  const [regEmail,   setRegEmail  ] = useState('');
  const [regName,    setRegName   ] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regPhone,   setRegPhone  ] = useState('');
  const [regPw,      setRegPw     ] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPw,  setShowRegPw ] = useState(false);
  const [regBusy,    setRegBusy   ] = useState(false);
  const [regErr,     setRegErr    ] = useState('');
  const [regOk,      setRegOk     ] = useState(false);
  const [pwStrength, setPwStrength] = useState<PwStrength>({ len: false, upper: false, num: false, special: false });

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  function onPwChange(v: string) {
    setRegPw(v);
    setPwStrength({
      len:     v.length >= 8,
      upper:   /[A-Z]/.test(v),
      num:     /[0-9]/.test(v),
      special: /[^A-Za-z0-9]/.test(v),
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authErr) {
      setError(authErr.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : authErr.message);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (regPw !== regConfirm) { setRegErr('Passwords do not match.'); return; }
    if (strengthLevel(pwStrength) < 4) { setRegErr('Password does not meet all requirements.'); return; }
    setRegErr('');
    setRegBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, full_name: regName, company: regCompany, phone: regPhone, password: regPw }),
      });
      const json = await res.json();
      if (!res.ok) setRegErr(json.error ?? 'Registration failed. Please try again.');
      else         setRegOk(true);
    } catch { setRegErr('Network error. Please try again.'); }
    setRegBusy(false);
  }

  const inputSx: React.CSSProperties = { background: '#141720', border: '1px solid #2e3440', color: '#eff0f1', width: '100%', borderRadius: 8, padding: '10px 14px', fontSize: 14, outline: 'none' };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#0d1117' }}>
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(61,174,233,0.05) 0%, transparent 60%)' }} />

      <div className="w-full max-w-[380px] relative">
        <div className="text-center mb-8">
          <p className="text-[#3daee9] text-[9px] font-bold uppercase tracking-[0.28em] mb-1">AXIOM</p>
          <h1 className="text-white text-xl font-bold">Data Ingestion Pipeline</h1>
          <p className="text-[#7c8694] text-xs mt-1">
            {mode === 'login' ? 'Superusers & Administrators only' : 'Request pipeline access'}
          </p>
        </div>

        {/* Reason banners */}
        {mode === 'login' && reason === 'no-access' && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#ef444415', border: '1px solid #ef444430', color: '#ef4444' }}>
            Your account does not have access to AXIOM. Contact your administrator.
          </div>
        )}
        {mode === 'login' && reason === 'pending' && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#3daee915', border: '1px solid #3daee930', color: '#3daee9' }}>
            Your access request is pending approval. You will be notified once approved.
          </div>
        )}
        {mode === 'login' && reason === 'rejected' && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#ef444415', border: '1px solid #ef444430', color: '#ef4444' }}>
            Your access request was not approved. Contact your administrator for assistance.
          </div>
        )}

        <div className="bg-[#1e2228] border border-[#2e3440] rounded-xl p-7 shadow-[0_24px_64px_rgba(0,0,0,0.7)]">

          {/* ── LOGIN FORM ── */}
          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Email Address</label>
                <input type="email" required autoComplete="email" placeholder="you@privegroupre.com"
                  value={email} onChange={e => setEmail(e.target.value)} style={inputSx}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                    placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                    style={{ ...inputSx, paddingRight: 40 }}
                    onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                    onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#555' }}>
                    {showPw ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#ef4444', background: '#ef444415', border: '1px solid #ef444430' }}>{error}</p>
              )}

              <button type="submit" disabled={busy} className="w-full font-bold text-sm py-2.5 rounded-lg transition-colors mt-1"
                style={{ background: busy ? '#1e2228' : '#3daee9', color: busy ? '#555' : '#0d1117', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>

              <div className="pt-1" style={{ borderTop: '1px solid #2e3440' }}>
                <button type="button" onClick={() => setMode('register')}
                  className="w-full text-xs transition-colors py-1.5 text-center"
                  style={{ color: '#44505e' }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = '#3daee9'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = '#44505e'; }}>
                  Don&apos;t have access? <span style={{ fontWeight: 700 }}>Request Access →</span>
                </button>
              </div>
            </form>
          )}

          {/* ── REGISTER FORM ── */}
          {mode === 'register' && !regOk && (
            <form onSubmit={handleRegister} className="space-y-3">
              <p className="text-[10px] text-[#44505e] leading-relaxed mb-1">
                AXIOM access is restricted to authorised personnel. Your request will be reviewed by an Administrator.
              </p>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" required autoComplete="name" placeholder="Jane Smith"
                  value={regName} onChange={e => setRegName(e.target.value)} style={inputSx}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="email" required autoComplete="email" placeholder="you@example.com"
                  value={regEmail} onChange={e => setRegEmail(e.target.value)} style={inputSx}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Company</label>
                  <input type="text" autoComplete="organization" placeholder="Company"
                    value={regCompany} onChange={e => setRegCompany(e.target.value)} style={inputSx}
                    onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                    onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Phone</label>
                  <input type="tel" autoComplete="tel" placeholder="+974…"
                    value={regPhone} onChange={e => setRegPhone(e.target.value)} style={inputSx}
                    onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                    onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                <div className="relative">
                  <input type={showRegPw ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="••••••••" value={regPw} onChange={e => onPwChange(e.target.value)}
                    style={{ ...inputSx, paddingRight: 40 }}
                    onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                    onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                  <button type="button" onClick={() => setShowRegPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#555' }}>
                    {showRegPw ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
                {regPw && <div style={{ marginTop: 8 }}><StrengthBar s={pwStrength} /></div>}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#7c8694' }}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="password" required autoComplete="new-password" placeholder="••••••••"
                  value={regConfirm} onChange={e => setRegConfirm(e.target.value)} style={inputSx}
                  onFocus={e => { e.target.style.borderColor = '#3daee9'; }}
                  onBlur={e => { e.target.style.borderColor = '#2e3440'; }} />
                {regConfirm && regConfirm !== regPw && (
                  <p style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>Passwords do not match</p>
                )}
              </div>

              {regErr && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: '#ef4444', background: '#ef444415', border: '1px solid #ef444430' }}>{regErr}</p>
              )}

              <button type="submit" disabled={regBusy} className="w-full font-bold text-sm py-2.5 rounded-lg transition-colors mt-1"
                style={{ background: regBusy ? '#1e2228' : '#3daee9', color: regBusy ? '#555' : '#0d1117', opacity: regBusy ? 0.6 : 1 }}>
                {regBusy ? 'Submitting…' : 'Submit Access Request'}
              </button>

              <div className="pt-1" style={{ borderTop: '1px solid #2e3440' }}>
                <button type="button" onClick={() => setMode('login')}
                  className="w-full text-xs py-1.5 text-center transition-colors"
                  style={{ color: '#44505e' }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = '#3daee9'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = '#44505e'; }}>
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ── REGISTER SUCCESS ── */}
          {mode === 'register' && regOk && (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-2xl"
                style={{ background: '#3daee920', border: '1px solid #3daee940' }}>✓</div>
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: '#eff0f1' }}>Request Submitted</p>
                <p className="text-xs leading-relaxed" style={{ color: '#7c8694' }}>
                  Your access request has been received. An Administrator will review it and notify you by email once a decision has been made.
                </p>
              </div>
              <button type="button" onClick={() => { setMode('login'); setRegOk(false); }}
                className="text-xs" style={{ color: '#3daee9' }}>Back to Sign In</button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: '#2e3440' }}>
          AXIOM · Restricted Access
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
