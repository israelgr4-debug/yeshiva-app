import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '../_helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/users/[id] - update role / full_name / is_active / password
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const authCheck = await requireAdmin(req);
  if (authCheck instanceof NextResponse) return authCheck;

  const { id } = await ctx.params;
  const body = await req.json();
  const admin = getAdminClient();

  // 1) Update app_users
  const appPatch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.role !== undefined) {
    if (!['admin', 'manager', 'secretary', 'viewer'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    appPatch.role = body.role;
  }
  if (body.full_name !== undefined) appPatch.full_name = body.full_name || null;
  if (body.is_active !== undefined) appPatch.is_active = Boolean(body.is_active);

  if (Object.keys(appPatch).length > 1) {
    const { error } = await admin.from('app_users').update(appPatch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2) Update auth password if provided
  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return updated row
  const { data } = await admin
    .from('app_users')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .eq('id', id)
    .single();

  return NextResponse.json(data);
}

// DELETE /api/users/[id] - delete a user entirely (admin only, with confirmation upstream)
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const authCheck = await requireAdmin(req);
  if (authCheck instanceof NextResponse) return authCheck;

  const { id } = await ctx.params;

  if (authCheck.userId === id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Delete auth user (cascades to app_users via FK)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
