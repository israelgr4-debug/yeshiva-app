import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from './_helpers';

// GET /api/users - list all users (admin only)
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if (authCheck instanceof NextResponse) return authCheck;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('app_users')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/users - create a new user (admin only)
// Body: { email, password, full_name, role }
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if (authCheck instanceof NextResponse) return authCheck;

  const body = await req.json();
  const { email, password, full_name, role } = body;

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Missing fields: email, password, role' }, { status: 400 });
  }

  if (!['admin', 'manager', 'secretary', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const admin = getAdminClient();

  // 1) Create auth user
  const { data: authResult, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr || !authResult.user) {
    return NextResponse.json({ error: authErr?.message || 'Failed to create auth user' }, { status: 400 });
  }

  const userId = authResult.user.id;

  // 2) Add to app_users
  const { data: appUser, error: appErr } = await admin
    .from('app_users')
    .insert({
      id: userId,
      email,
      full_name: full_name || null,
      role,
      is_active: true,
    })
    .select()
    .single();

  if (appErr) {
    // Rollback - delete the auth user
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: appErr.message }, { status: 500 });
  }

  return NextResponse.json(appUser, { status: 201 });
}
