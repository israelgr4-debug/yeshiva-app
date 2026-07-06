import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 300; // up to 5 min (Vercel Pro). Default 60s on Hobby.

/**
 * POST /api/registration/send-forms
 * Body: { registrationIds: string[] }
 *
 * Sends the registration form PDF(s) to the parents of the selected candidates -
 * ONE personalised email per recipient (no BCC). For each registration it
 * resolves a single recipient address (father → mother → candidate), dedups
 * repeated addresses within the batch, attaches the PDF forms (uploaded once in
 * settings, stored in the 'registration-forms' bucket), sends via Gmail, and
 * records every attempt in `registration_form_emails`.
 *
 * Returns: { queued, sent, failed, skipped, deduped, errors: [...] }
 */
export async function POST(req: NextRequest) {
  // 1) Auth
  const authHeader = req.headers.get('authorization') || '';
  const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!svcKey) {
    return NextResponse.json(
      { error: 'Server misconfig: missing SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    );
  }
  const admin = createClient(supaUrl, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userErr } = await admin.auth.getUser(sessionToken);
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await admin
    .from('app_users')
    .select('role, is_active, email')
    .eq('id', user.id)
    .maybeSingle();
  if (!appUser || !appUser.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Sending is a write action → admin + secretary only (matches canWrite).
  if (!['admin', 'secretary'].includes(appUser.role)) {
    return NextResponse.json({ error: 'רק מנהל או מזכירה יכולים לשלוח' }, { status: 403 });
  }

  // 2) Email settings + reg-forms templates + uploaded file list
  const { data: settings } = await admin
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'email_enabled', 'email_from', 'email_display_name', 'email_app_password',
      'reg_forms_email_subject', 'reg_forms_email_body', 'reg_forms_files',
    ]);
  const cfg: Record<string, any> = {};
  for (const r of settings || []) cfg[r.key] = r.value;

  if (!cfg.email_enabled) {
    return NextResponse.json({ error: 'שליחת מיילים לא מופעלת בהגדרות' }, { status: 400 });
  }
  const fromEmail = String(cfg.email_from || '').trim();
  const fromName = String(cfg.email_display_name || 'ישיבת מיר מודיעין עילית').trim();
  const appPassword = String(cfg.email_app_password || '').replace(/\s/g, '');
  if (!fromEmail || !appPassword) {
    return NextResponse.json({ error: 'הגדרות מייל חסרות (כתובת / סיסמת אפליקציה)' }, { status: 400 });
  }

  const files: { path: string; filename: string }[] = Array.isArray(cfg.reg_forms_files)
    ? cfg.reg_forms_files
    : [];
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'לא הועלו טפסי רישום. העלה קובץ PDF בהגדרות → אימייל → טפסי רישום.' },
      { status: 400 }
    );
  }

  // 3) Download the PDF attachments ONCE (reused for every recipient)
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  for (const f of files) {
    const { data: blob, error: dlErr } = await admin.storage
      .from('registration-forms')
      .download(f.path);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: `שגיאה בטעינת הקובץ "${f.filename}": ${dlErr?.message || 'לא נמצא'}` },
        { status: 500 }
      );
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    attachments.push({ filename: f.filename, content: buf, contentType: 'application/pdf' });
  }

  // 4) Read request body + load selected registrations
  const body = await req.json().catch(() => ({}));
  const registrationIds: string[] = Array.isArray(body.registrationIds) ? body.registrationIds : [];
  if (registrationIds.length === 0) {
    return NextResponse.json({ error: 'לא נבחרו נרשמים' }, { status: 400 });
  }

  const { data: regs, error: regErr } = await admin
    .from('registrations')
    .select('id, first_name, last_name, father_name, father_email, email')
    .in('id', registrationIds);
  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  // 5) Templates
  const subjectTemplate = String(cfg.reg_forms_email_subject || DEFAULT_SUBJECT);
  const bodyTemplate = String(cfg.reg_forms_email_body || DEFAULT_BODY);

  // 6) Transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: fromEmail, pass: appPassword },
  });

  const batchId = crypto.randomUUID();
  const emailRe = /\S+@\S+\.\S+/;
  const seenEmails = new Set<string>(); // dedup within this batch

  let sent = 0;
  let failed = 0;
  let skipped = 0;   // no valid email at all
  let deduped = 0;   // same address already used in this batch (e.g. siblings)
  const errors: { registration_id: string; error: string }[] = [];

  for (const r of regs || []) {
    // Resolve ONE recipient: father → candidate.
    // (The registration form only captures father_email + the candidate's own
    //  email; there is no mother_email column on registrations.)
    let recipientEmail = '';
    let recipientType = '';
    for (const [val, type] of [
      [r.father_email, 'father'],
      [r.email, 'student'],
    ] as [string | null, string][]) {
      const e = String(val || '').trim();
      if (e && emailRe.test(e)) { recipientEmail = e; recipientType = type; break; }
    }

    if (!recipientEmail) {
      skipped++;
      continue;
    }

    const emailKey = recipientEmail.toLowerCase();
    if (seenEmails.has(emailKey)) {
      deduped++;
      continue;
    }
    seenEmails.add(emailKey);

    const vars = {
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      father_name: r.father_name || '',
      from_name: fromName,
    };
    const subject = substitute(subjectTemplate, vars);
    const bodyText = substitute(bodyTemplate, vars);
    const html = buildEmailHtml({ bodyText, fromName, fileNames: files.map((f) => f.filename) });
    const text = bodyText;

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipientEmail,
        subject,
        text,
        html,
        attachments,
        headers: { 'X-Auto-Response-Suppress': 'OOF, AutoReply' },
      });

      await admin.from('registration_form_emails').insert({
        registration_id: r.id,
        recipient_email: recipientEmail,
        recipient_type: recipientType,
        batch_id: batchId,
        sent_at: new Date().toISOString(),
        sent_by: appUser.email,
      });

      sent++;
      // Small delay - avoid Gmail rate-limit (~1 per 2s sustained)
      await sleep(1200);
    } catch (err: any) {
      failed++;
      const msg = err?.message || String(err);
      errors.push({ registration_id: r.id, error: msg });
      await admin.from('registration_form_emails').insert({
        registration_id: r.id,
        recipient_email: recipientEmail,
        recipient_type: recipientType,
        batch_id: batchId,
        send_error: msg,
        sent_by: appUser.email,
      });
    }
  }

  return NextResponse.json({
    batch_id: batchId,
    queued: (regs || []).length,
    sent,
    failed,
    skipped,
    deduped,
    errors: errors.slice(0, 50),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function substitute(template: string, vars: Record<string, string>): string {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return vars[key] != null ? String(vars[key]) : '';
  });
}

/** Render the editable body into an RTL email scaffold.
 * Blank lines → paragraphs, single newlines → <br>. Lists the attached files
 * at the bottom so the recipient knows to look for them.
 */
function buildEmailHtml(p: { bodyText: string; fromName: string; fileNames: string[] }): string {
  const paragraphs = p.bodyText.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n').map((l) => escapeHtml(l)).join('<br>');
    return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.75;text-align:right;">${lines}</p>`;
  }).join('\n');

  const filesList = p.fileNames.length > 0
    ? `<div style="margin-top:18px;padding:12px 16px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#475569;text-align:right;">
         📎 מצורפים למייל זה: ${p.fileNames.map((n) => `<strong>${escapeHtml(n)}</strong>`).join('، ')}
       </div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>טפסי רישום</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Heebo','Segoe UI',Arial,sans-serif;color:#1e293b;direction:rtl;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa;padding:32px 16px;direction:rtl;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);direction:rtl;">
        <tr><td style="padding:24px 32px 8px 32px;text-align:center;border-bottom:1px solid #eef2f6;">
          <p style="margin:0;color:#1e40af;font-size:16px;font-weight:600;letter-spacing:0.5px;">${escapeHtml(p.fromName)}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;direction:rtl;text-align:right;">
          ${paragraphs}
          ${filesList}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Defaults - kept in sync with src/components/settings/EmailSettings.tsx
const DEFAULT_SUBJECT = 'טפסי רישום - ישיבת מיר מודיעין עילית';
const DEFAULT_BODY = `שלום רב,

מצורפים בזאת טפסי הרישום לישיבת מיר מודיעין עילית עבור בנכם {{first_name}}.

נא למלא את הטפסים המצורפים ולהחזירם להנהלת הישיבה בהקדם.

לכל שאלה ניתן להשיב למייל זה.

בברכה,
{{from_name}}`;
