import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 300; // up to 5 min (Vercel Pro). Default 60s on Hobby.

/**
 * POST /api/graduates/send-update-requests
 * Body: { graduateIds?: string[]  // null = all eligible, also can pass 'reminder:true' }
 *
 * Creates a unique update token for each graduate with an email,
 * sends a personalized email, and saves the token row. Pauses between
 * sends so Gmail doesn't rate-limit.
 *
 * Returns: { queued, sent, failed, errors: [...] }
 */
export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization') || '';
  const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
  if (!['admin', 'manager'].includes(appUser.role)) {
    return NextResponse.json({ error: 'Only admin/manager can send' }, { status: 403 });
  }

  // Email settings (incl. editable templates)
  const { data: settings } = await admin
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'email_enabled', 'email_from', 'email_display_name', 'email_app_password',
      'grad_update_email_subject', 'grad_update_email_body',
      'grad_update_reminder_subject', 'grad_update_reminder_body',
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
    return NextResponse.json({ error: 'הגדרות מייל חסרות' }, { status: 400 });
  }

  // Body params
  const body = await req.json().catch(() => ({}));
  const graduateIds: string[] | null = Array.isArray(body.graduateIds) ? body.graduateIds : null;
  const isReminder: boolean = !!body.reminder;
  const limit: number = Number(body.limit) || 500;

  // Find eligible graduates
  let query = admin
    .from('graduates')
    .select('id, first_name, last_name, email, email_unsubscribed, last_self_update_at')
    .not('email', 'is', null)
    .neq('email', '');
  if (graduateIds && graduateIds.length > 0) {
    query = query.in('id', graduateIds);
  }
  const { data: graduates, error: gradErr } = await query;
  if (gradErr) return NextResponse.json({ error: gradErr.message }, { status: 500 });

  const eligible = (graduates || []).filter((g: any) =>
    !g.email_unsubscribed && /@/.test(g.email || '')
  );

  // For reminders - skip those that already submitted
  let toSend = eligible;
  if (isReminder) {
    // Find existing live tokens that haven't been used yet
    const ids = eligible.map((g: any) => g.id);
    const { data: liveTokens } = await admin
      .from('graduate_update_tokens')
      .select('graduate_id, used_at, expires_at, reminder_count')
      .in('graduate_id', ids)
      .is('used_at', null)
      .gte('expires_at', new Date().toISOString());
    const tokenByGrad: Record<string, any> = {};
    for (const t of liveTokens || []) tokenByGrad[t.graduate_id] = t;
    toSend = eligible.filter((g: any) => {
      const t = tokenByGrad[g.id];
      // Reminder if has live token + reminder count < 2
      return t && (t.reminder_count || 0) < 2;
    });
  }

  toSend = toSend.slice(0, limit);

  // Set up nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: fromEmail, pass: appPassword },
  });

  // App URL for the link
  const origin = req.headers.get('origin') || `https://${req.headers.get('host')}` || 'https://yeshiva-app.vercel.app';

  let sent = 0;
  let failed = 0;
  const errors: { graduate_id: string; error: string }[] = [];

  for (const g of toSend) {
    try {
      // Find or create token
      let token = '';
      let tokenId = '';
      if (isReminder) {
        const { data: existing } = await admin
          .from('graduate_update_tokens')
          .select('id, token')
          .eq('graduate_id', g.id)
          .is('used_at', null)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          token = existing.token;
          tokenId = existing.id;
        }
      }
      if (!token) {
        token = crypto.randomBytes(24).toString('base64url');
        const expires = new Date();
        expires.setDate(expires.getDate() + 60); // 60 days
        const { data: ins, error: insErr } = await admin
          .from('graduate_update_tokens')
          .insert({
            token,
            graduate_id: g.id,
            email: g.email,
            expires_at: expires.toISOString(),
          })
          .select('id')
          .single();
        if (insErr) throw new Error(insErr.message);
        tokenId = ins.id;
      }

      const link = `${origin}/g/update/${token}`;

      // Subject + body from settings (with placeholder substitution)
      const subjectTemplate = isReminder
        ? (cfg.grad_update_reminder_subject || DEFAULT_REMINDER_SUBJECT)
        : (cfg.grad_update_email_subject || DEFAULT_SUBJECT);
      const bodyTemplate = isReminder
        ? (cfg.grad_update_reminder_body || DEFAULT_REMINDER_BODY)
        : (cfg.grad_update_email_body || DEFAULT_BODY);

      const vars = {
        first_name: g.first_name || '',
        last_name: g.last_name || '',
        link,
        from_name: fromName,
      };
      const subject = substitute(subjectTemplate, vars);
      const bodyText = substitute(bodyTemplate, vars);

      const html = buildEmailHtml({ bodyText, link, fromName });
      const text = buildEmailPlainText({ bodyText, link });

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: g.email,
        subject,
        text,
        html,
        // Help with deliverability
        headers: {
          'List-Unsubscribe': `<mailto:${fromEmail}?subject=הסר>`,
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
        },
      });

      // Update token row
      const updates: any = isReminder
        ? {
            reminder_count: 1, // increment handled below if needed
            last_reminder_at: new Date().toISOString(),
          }
        : {
            sent_at: new Date().toISOString(),
          };
      if (isReminder) {
        // Atomically increment count
        const { data: cur } = await admin
          .from('graduate_update_tokens')
          .select('reminder_count')
          .eq('id', tokenId)
          .single();
        updates.reminder_count = (cur?.reminder_count || 0) + 1;
      }
      await admin.from('graduate_update_tokens').update(updates).eq('id', tokenId);

      sent++;
      // Small delay - avoid rate-limit (Gmail allows ~1 per 2s sustained)
      await sleep(1200);

      void info;
    } catch (err: any) {
      failed++;
      const msg = err?.message || String(err);
      errors.push({ graduate_id: g.id, error: msg });
      // Save error to token if we have one
      try {
        await admin
          .from('graduate_update_tokens')
          .update({ send_error: msg })
          .eq('graduate_id', g.id)
          .is('sent_at', null);
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({
    queued: toSend.length,
    sent,
    failed,
    errors: errors.slice(0, 50),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Render the editable body into the email HTML scaffold.
 * - Splits on double-newline → paragraphs (single \n becomes <br>).
 * - {{link}} token in the body is replaced by a styled CTA button.
 * - If {{link}} is absent, a button is appended at the end as a fallback.
 * - Whole body is wrapped dir="rtl" + text-align:right.
 */
function buildEmailHtml(p: { bodyText: string; link: string; fromName: string }): string {
  const buttonHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px auto;"><tr><td style="border-radius:12px;background:#1e40af;"><a href="${p.link}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;border-radius:12px;">לעדכון הפרטים</a></td></tr></table>`;

  // Split body into paragraphs by blank line
  const hasLinkToken = /\{\{\s*link\s*\}\}/.test(p.bodyText);
  // Already substituted earlier? Then look for the literal link URL as marker.
  // The substitute() call above replaces {{link}} with the URL. So we look for the URL on its own line.
  const linkRe = new RegExp(`(^|\\n)\\s*${escapeRegex(p.link)}\\s*(\\n|$)`);

  let processed = p.bodyText;
  let injectedButton = false;
  if (linkRe.test(processed)) {
    processed = processed.replace(linkRe, '\n\n___LINK_BUTTON___\n\n');
    injectedButton = true;
  }

  const paragraphs = processed.split(/\n{2,}/).map((para) => {
    if (para.trim() === '___LINK_BUTTON___') return buttonHtml;
    const lines = para.split('\n').map((l) => escapeHtml(l)).join('<br>');
    return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.75;text-align:right;">${lines}</p>`;
  }).join('\n');

  const trailingButton = injectedButton ? '' : buttonHtml;

  void hasLinkToken; // (silence unused)

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>עדכון פרטים</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Heebo','Segoe UI',Arial,sans-serif;color:#1e293b;direction:rtl;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa;padding:32px 16px;direction:rtl;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);direction:rtl;">
        <tr><td style="padding:24px 32px 8px 32px;text-align:center;border-bottom:1px solid #eef2f6;">
          <p style="margin:0;color:#1e40af;font-size:16px;font-weight:600;letter-spacing:0.5px;">${escapeHtml(p.fromName)}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;direction:rtl;text-align:right;">
          ${paragraphs}
          ${trailingButton}
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;direction:ltr;word-break:break-all;">
            <a href="${p.link}" style="color:#94a3b8;text-decoration:underline;">${p.link}</a>
          </p>
        </td></tr>
        <tr><td style="padding:12px 32px;text-align:center;font-size:11px;color:#94a3b8;background:#f8fafc;border-top:1px solid #eef2f6;">
          אם אינך מעוניין לקבל מיילים נוספים מהישיבה, השב למייל זה עם המילה <strong>"הסר"</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailPlainText(p: { bodyText: string; link: string }): string {
  // bodyText already has {{link}} replaced with the actual URL.
  void p.link;
  return p.bodyText + '\n\n---\nאם אינך מעוניין לקבל מיילים נוספים מהישיבה, השב למייל זה עם המילה "הסר"';
}

function substitute(template: string, vars: Record<string, string>): string {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return vars[key] != null ? String(vars[key]) : '';
  });
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Defaults - kept in sync with src/components/settings/EmailSettings.tsx
const DEFAULT_SUBJECT = 'עדכון פרטים - ישיבת מיר מודיעין עילית';
const DEFAULT_REMINDER_SUBJECT = 'תזכורת - עדכון פרטים, ישיבת מיר מודיעין עילית';
const DEFAULT_BODY = `שלום ר' {{first_name}},

שלום מהנהלת ישיבת מיר מודיעין עילית.

אנו מעדכנים את רשימת הבוגרים שלנו ונשמח אם תוכל להקדיש דקה לעדכן את הפרטים שלך אצלנו (כתובת, טלפון, סטטוס משפחתי).

בלחיצה על הקישור תגיע לטופס פשוט עם הפרטים הקיימים שלך - עדכן רק את מה שהשתנה. ייקח דקה.

{{link}}

הקישור אישי ומיועד עבורך בלבד. תוקפו לחודשיים.

בברכה,
{{from_name}}`;

const DEFAULT_REMINDER_BODY = `שלום ר' {{first_name}},

זוהי תזכורת על בקשה ששלחנו לעדכון פרטי הקשר שלך אצלנו. אם עדכנת כבר - תודה רבה, אפשר להתעלם.

{{link}}

בברכה,
{{from_name}}`;
