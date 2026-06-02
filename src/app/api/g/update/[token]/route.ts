import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Public endpoints for graduate self-update.
 * NO AUTH - identity proven by possession of a valid, unexpired token.
 *
 * GET /api/g/update/[token]
 *   → returns minimal graduate fields the user can see/edit
 *
 * POST /api/g/update/[token]
 *   Body: { updates: {...}, notes_to_admin?: string }
 *   → applies updates to the graduate row, logs before+after snapshot
 */

const ALLOWED_FIELDS = [
  'street', 'building_number', 'apartment', 'entrance',
  'neighborhood', 'city', 'temp_address',
  'mobile', 'phone', 'email',
  'marital_status', 'spouse_name', 'marriage_date_text',
  'spouse_father_name', 'spouse_father_phone',
  'spouse_mother_name', 'spouse_mother_phone',
  'spouse_father_city',
] as const;

const MARITAL_VALUES = ['', 'נשוי', 'מאורס', 'רווק', 'עזב', 'נפטר'];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const sb = adminClient();
  const { data: tokenRow } = await sb
    .from('graduate_update_tokens')
    .select('id, graduate_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ error: 'invalid', message: 'הקישור אינו תקין' }, { status: 404 });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired', message: 'תוקף הקישור פג' }, { status: 410 });
  }

  // Mark opened (first time)
  if (!tokenRow.used_at) {
    await sb
      .from('graduate_update_tokens')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', tokenRow.id)
      .is('opened_at', null);
  }

  // Load graduate (only fields the user is allowed to see/edit + name)
  const { data: g } = await sb
    .from('graduates')
    .select(`
      id, first_name, last_name, machzor_name,
      ${ALLOWED_FIELDS.join(', ')}
    `)
    .eq('id', tokenRow.graduate_id)
    .maybeSingle();

  if (!g) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    alreadySubmitted: !!tokenRow.used_at,
    graduate: g,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates = (body.updates || {}) as Record<string, any>;
  const notesToAdmin = typeof body.notes_to_admin === 'string'
    ? body.notes_to_admin.trim().slice(0, 2000)
    : null;

  // Sanitize - keep only allowed fields, trim strings, validate marital
  const clean: Record<string, any> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in updates) {
      let v = updates[key];
      if (typeof v === 'string') v = v.trim();
      if (key === 'marital_status' && v && !MARITAL_VALUES.includes(v)) continue;
      clean[key] = v === '' ? null : v;
    }
  }

  const sb = adminClient();

  // Re-validate token
  const { data: tokenRow } = await sb
    .from('graduate_update_tokens')
    .select('id, graduate_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: 'invalid' }, { status: 404 });
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  // Load current snapshot
  const { data: before } = await sb
    .from('graduates')
    .select(ALLOWED_FIELDS.join(', '))
    .eq('id', tokenRow.graduate_id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Detect changed fields
  const changedFields: string[] = [];
  for (const k of ALLOWED_FIELDS) {
    const oldVal = (before as any)[k] ?? null;
    const newVal = (clean as any)[k] ?? null;
    if (String(oldVal || '') !== String(newVal || '')) changedFields.push(k);
  }

  // Apply update + bump last_self_update_at
  const { data: afterRow, error: updErr } = await sb
    .from('graduates')
    .update({
      ...clean,
      last_self_update_at: new Date().toISOString(),
    })
    .eq('id', tokenRow.graduate_id)
    .select(ALLOWED_FIELDS.join(', '))
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // IP (best-effort)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  // Log
  await sb.from('graduate_update_log').insert({
    graduate_id: tokenRow.graduate_id,
    token_id: tokenRow.id,
    before_snapshot: before,
    after_snapshot: afterRow,
    changed_fields: changedFields,
    notes_to_admin: notesToAdmin || null,
    ip_address: ip,
  });

  // Mark token used
  await sb
    .from('graduate_update_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  return NextResponse.json({
    success: true,
    changed: changedFields.length,
    changedFields,
  });
}
