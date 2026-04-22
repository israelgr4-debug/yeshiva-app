import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

// POST /api/email/send
// Body: { to, subject, html, attachments?: [{filename, content, contentType}] }
// Auth: any authenticated user (Supabase session via Authorization header)
export async function POST(req: NextRequest) {
  // 1) Auth check
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Server misconfig: missing SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await admin
    .from('app_users')
    .select('role, is_active, email, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!appUser || !appUser.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only admins + managers + secretaries can send emails (no viewer)
  if (!['admin', 'manager', 'secretary'].includes(appUser.role)) {
    return NextResponse.json({ error: 'Insufficient permission' }, { status: 403 });
  }

  // 2) Load email settings
  const { data: settings } = await admin
    .from('system_settings')
    .select('key, value')
    .in('key', ['email_enabled', 'email_from', 'email_display_name', 'email_app_password']);
  const cfg: Record<string, any> = {};
  for (const row of settings || []) cfg[row.key] = row.value;

  if (!cfg.email_enabled) {
    return NextResponse.json({ error: 'שליחת מיילים לא מופעלת בהגדרות' }, { status: 400 });
  }

  const fromEmail = String(cfg.email_from || '').trim();
  const fromName = String(cfg.email_display_name || 'ישיבת מיר').trim();
  const appPassword = String(cfg.email_app_password || '').trim();

  if (!fromEmail || !appPassword) {
    return NextResponse.json({ error: 'הגדרות חסרות: email_from / email_app_password' }, { status: 400 });
  }

  // 3) Read request body
  const body = await req.json();
  const { to, subject, html, attachments } = body;
  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Missing: to / subject / html' }, { status: 400 });
  }

  // 4) Send via Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: fromEmail,
      pass: appPassword.replace(/\s/g, ''), // strip spaces from app password
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      attachments: attachments || undefined,
    });

    // Log to audit_log (INSERT into system_settings won't trigger so we log manually via RPC)
    // For simplicity just return success
    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      sentBy: appUser.email,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
