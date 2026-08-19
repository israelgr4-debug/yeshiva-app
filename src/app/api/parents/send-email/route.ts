import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 300; // up to 5 min (Vercel Pro). Default 60s on Hobby.

/**
 * POST /api/parents/send-email
 * Body: { studentIds: string[], subject: string, body: string, includeMother?: boolean }
 *
 * Sends a free-text email to the PARENTS of the selected students. One email per
 * HOUSEHOLD (deduped by family) — siblings never get a doubled email. Recipient =
 * father's email, falling back to the mother's. When includeMother is set and a
 * distinct mother address exists, she is CC'd. Personalises {{placeholders}} from
 * the household's representative student, sends via Gmail, logs to parent_emails,
 * and remembers the נוסח as the new default (system_settings).
 *
 * Returns: { batch_id, queued, sent, failed, skipped, deduped, errors: [...] }
 */
export async function POST(req: NextRequest) {
  // 1) Auth
  const authHeader = req.headers.get('authorization') || '';
  const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!svcKey) {
    return NextResponse.json({ error: 'Server misconfig: missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: { user }, error: userErr } = await admin.auth.getUser(sessionToken);
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await admin
    .from('app_users').select('role, is_active, email').eq('id', user.id).maybeSingle();
  if (!appUser || !appUser.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Sending is a write action → admin + secretary only (matches canWrite).
  if (!['admin', 'secretary'].includes(appUser.role)) {
    return NextResponse.json({ error: 'רק מנהל או מזכירה יכולים לשלוח' }, { status: 403 });
  }

  // 2) Email settings
  const { data: settings } = await admin
    .from('system_settings').select('key, value')
    .in('key', ['email_enabled', 'email_from', 'email_display_name', 'email_app_password']);
  const cfg: Record<string, any> = {};
  for (const r of settings || []) cfg[r.key] = r.value;

  if (!cfg.email_enabled) return NextResponse.json({ error: 'שליחת מיילים לא מופעלת בהגדרות' }, { status: 400 });
  const fromEmail = String(cfg.email_from || '').trim();
  const fromName = String(cfg.email_display_name || 'ישיבת מיר מודיעין עילית').trim();
  const appPassword = String(cfg.email_app_password || '').replace(/\s/g, '');
  if (!fromEmail || !appPassword) {
    return NextResponse.json({ error: 'הגדרות מייל חסרות (כתובת / סיסמת אפליקציה)' }, { status: 400 });
  }

  // 3) Body
  const body = await req.json().catch(() => ({}));
  const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];
  const subjectTemplate = String(body.subject || '').trim();
  const bodyTemplate = String(body.body || '').trim();
  const includeMother = body.includeMother === true;
  if (studentIds.length === 0) return NextResponse.json({ error: 'לא נבחרו תלמידים' }, { status: 400 });
  if (!subjectTemplate) return NextResponse.json({ error: 'חסר נושא למייל' }, { status: 400 });
  if (!bodyTemplate) return NextResponse.json({ error: 'חסר תוכן למייל' }, { status: 400 });

  // 4) Load students (in chunks to respect the 1000-row cap) + their families
  const students: { id: string; first_name: string; last_name: string; family_id: string | null }[] = [];
  for (let i = 0; i < studentIds.length; i += 500) {
    const { data } = await admin
      .from('students').select('id, first_name, last_name, family_id')
      .in('id', studentIds.slice(i, i + 500));
    if (data) students.push(...(data as any));
  }
  const famIds = Array.from(new Set(students.map((s) => s.family_id).filter(Boolean))) as string[];
  const famById = new Map<string, { id: string; father_name: string | null; father_email: string | null; mother_email: string | null }>();
  for (let i = 0; i < famIds.length; i += 500) {
    const { data } = await admin
      .from('families').select('id, father_name, father_email, mother_email')
      .in('id', famIds.slice(i, i + 500));
    for (const f of (data as any[]) || []) famById.set(f.id, f);
  }

  // 5) Group into one message per household (dedup by family).
  const emailRe = /\S+@\S+\.\S+/;
  const clean = (v: any) => String(v || '').trim();
  const seenFamilies = new Set<string>();
  type Job = { student: typeof students[number]; family: NonNullable<ReturnType<typeof famById.get>>; to: string; toType: 'father' | 'mother'; cc?: string };
  const jobs: Job[] = [];
  let skipped = 0;   // no family / no valid parent email
  let deduped = 0;   // sibling already covered

  for (const s of students) {
    if (!s.family_id) { skipped++; continue; }
    if (seenFamilies.has(s.family_id)) { deduped++; continue; }
    const fam = famById.get(s.family_id);
    if (!fam) { skipped++; continue; }
    const father = clean(fam.father_email);
    const mother = clean(fam.mother_email);
    let to = '', toType: 'father' | 'mother' = 'father';
    if (father && emailRe.test(father)) { to = father; toType = 'father'; }
    else if (mother && emailRe.test(mother)) { to = mother; toType = 'mother'; }
    if (!to) { skipped++; continue; }               // no usable parent address
    seenFamilies.add(s.family_id);
    let cc: string | undefined;
    if (includeMother && mother && emailRe.test(mother) && mother.toLowerCase() !== to.toLowerCase()) cc = mother;
    jobs.push({ student: s, family: fam, to, toType, cc });
  }

  // 6) Send
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: fromEmail, pass: appPassword } });
  const batchId = crypto.randomUUID();
  let sent = 0, failed = 0;
  const errors: { student_id: string; error: string }[] = [];

  for (const job of jobs) {
    const vars = {
      first_name: job.student.first_name || '',
      last_name: job.student.last_name || '',
      father_name: job.family.father_name || '',
      from_name: fromName,
    };
    const subject = substitute(subjectTemplate, vars);
    const text = substitute(bodyTemplate, vars);
    const html = buildEmailHtml({ bodyText: text, fromName });
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: job.to,
        cc: job.cc,
        subject,
        text,
        html,
        headers: { 'X-Auto-Response-Suppress': 'OOF, AutoReply' },
      });
      await admin.from('parent_emails').insert({
        student_id: job.student.id, family_id: job.family.id,
        recipient_email: job.to, recipient_type: job.toType, cc_email: job.cc || null,
        subject, batch_id: batchId, sent_at: new Date().toISOString(), sent_by: appUser.email,
      });
      sent++;
      await sleep(1200); // avoid Gmail rate-limit
    } catch (err: any) {
      failed++;
      const msg = err?.message || String(err);
      errors.push({ student_id: job.student.id, error: msg });
      await admin.from('parent_emails').insert({
        student_id: job.student.id, family_id: job.family.id,
        recipient_email: job.to, recipient_type: job.toType, cc_email: job.cc || null,
        subject, batch_id: batchId, send_error: msg, sent_by: appUser.email,
      });
    }
  }

  // 7) Remember the נוסח as the new default (best-effort).
  try {
    await admin.from('system_settings').upsert(
      [{ key: 'parent_email_subject', value: subjectTemplate }, { key: 'parent_email_body', value: bodyTemplate }],
      { onConflict: 'key' }
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({ batch_id: batchId, queued: jobs.length, sent, failed, skipped, deduped, errors: errors.slice(0, 50) });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function substitute(template: string, vars: Record<string, string>): string {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
}

/** Render the editable body into an RTL email scaffold. Blank lines → paragraphs. */
function buildEmailHtml(p: { bodyText: string; fromName: string }): string {
  const paragraphs = p.bodyText.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n').map((l) => escapeHtml(l)).join('<br>');
    return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.75;text-align:right;">${lines}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>${escapeHtml(p.fromName)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Heebo','Segoe UI',Arial,sans-serif;color:#1e293b;direction:rtl;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa;padding:32px 16px;direction:rtl;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);direction:rtl;">
        <tr><td style="padding:24px 32px 8px 32px;text-align:center;border-bottom:1px solid #eef2f6;">
          <p style="margin:0;color:#1e40af;font-size:16px;font-weight:600;letter-spacing:0.5px;">${escapeHtml(p.fromName)}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;direction:rtl;text-align:right;">
          ${paragraphs}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
