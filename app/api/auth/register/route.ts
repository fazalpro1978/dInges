import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function validatePassword(pw: string): string | null {
  if (pw.length < 8)            return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw))        return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(pw))        return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, company, phone } = await req.json();

    if (!email?.trim() || !password || !full_name?.trim()) {
      return NextResponse.json({ error: 'Email, name, and password are required.' }, { status: 400 });
    }

    const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

    const { error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        company:   company?.trim() ?? '',
        phone:     phone?.trim()   ?? '',
        self_registered: true,
      },
    });

    if (error) {
      const msg = error.message.includes('already registered') || error.message.includes('already been registered')
        ? 'An account with this email already exists.'
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
