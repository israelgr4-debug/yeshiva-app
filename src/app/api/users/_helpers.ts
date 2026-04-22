import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Server-side admin client (uses service_role key - NEVER expose to browser)
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verify the caller is an admin. Expects the request to have a valid Supabase session cookie
// (Bearer token). Returns the admin user's id if authorized, else returns a NextResponse error.
export async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized - no token' }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized - invalid token' }, { status: 401 });
  }

  const { data: appUser, error: appErr } = await admin
    .from('app_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (appErr || !appUser || !appUser.is_active || appUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
  }

  return { userId: user.id };
}
