// The robot's campaign webhook (ימות: `campaign_send_data_to_api=<url>` in `<templateId>.ini`,
// per the document ימות wrote for the developer, 2026-11 — it is NOT in their public docs).
// After every call of a campaign ימות POSTs the call's data (form-data) to our URL; the field
// KeystrokesPhones is the key the person pressed. So a missing student answers INSIDE the
// robot's call — 1 = on my way, 2 = can't come — without calling the extension back.
//
// The person is found by his phone among the people still missing in the open audit. (The
// code came from mosdot-app, where several audits can be open; here there is one.)
//
// Nothing here was seen on a real call yet. Every request is therefore kept (the last 40) in
// system_settings so the settings tab can show exactly what ימות sent.

import { createHmac } from 'crypto';
import { AuditStudent, normPhone } from './attendance';
import { adminDb, getAuditStudents, setCallStatus } from './attendance-server';

export const CAMPAIGN_LOG_SETTING = 'attendance_campaign_webhook_log';
/** The template whose ini was written with our link (the last successful "connect"). */
export const CAMPAIGN_TEMPLATE_SETTING = 'attendance_campaign_webhook_template';
export const CAMPAIGN_LOG_MAX = 40;

/** Secret path segment of the webhook URL — derived from the ימות token, stored nowhere. */
export function campaignWebhookSecret(): string | null {
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return null;
  return createHmac('sha256', token).update('attendance-campaign-webhook').digest('hex').slice(0, 28);
}

export const campaignIniLine = (url: string) => `campaign_send_data_to_api=${url}`;

export type CampaignAnswer = 'coming' | 'cant';
export const CAMPAIGN_KEYS: Record<string, CampaignAnswer> = { '1': 'coming', '2': 'cant' };
export const CAMPAIGN_NOTE: Record<CampaignAnswer, string> = { coming: 'הקיש 1 בשיחת הרובוט', cant: 'הקיש 2 בשיחת הרובוט' };

export interface CampaignCall { phone: string; key: string; hangup: boolean; campaignId: string; fields: Record<string, string> }

/** Field names are matched without regard to case (the document's table is not consistent). */
export function parseCampaignCall(params: URLSearchParams): CampaignCall {
  const fields: Record<string, string> = {};
  params.forEach((v, k) => { if (!(k in fields)) fields[k] = String(v).slice(0, 200); });
  const get = (name: string) => { const k = Object.keys(fields).find((x) => x.toLowerCase() === name.toLowerCase()); return k ? fields[k] : ''; };
  // the key pressed: one or two characters. Anything longer is not a menu key (not understood → only logged)
  const raw = get('KeystrokesPhones').replace(/[^\d*#]/g, '');
  return {
    phone: normPhone(get('Phone')),
    key: raw.length >= 1 && raw.length <= 2 ? raw[0] : '',
    hangup: get('hangup').toLowerCase() === 'yes',
    campaignId: get('CampaignID'),
    fields,
  };
}

export interface CampaignLogEntry { at: string; phone: string; key: string; result: string; fields: Record<string, string> }

async function keepLog(entry: CampaignLogEntry) {
  const db = adminDb();
  const { data } = await db.from('system_settings').select('value').eq('key', CAMPAIGN_LOG_SETTING).maybeSingle();
  const list = Array.isArray(data?.value) ? (data!.value as CampaignLogEntry[]) : [];
  list.unshift(entry);
  await db.from('system_settings').upsert({ key: CAMPAIGN_LOG_SETTING, value: list.slice(0, CAMPAIGN_LOG_MAX), description: 'בקשות אחרונות מקמפיין הרובוט בימות', updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/** What one webhook request does. Returns the Hebrew line that is logged. */
export async function applyCampaignCall(call: CampaignCall): Promise<string> {
  if (call.hangup) return 'הודעת ניתוק — לא טופלה';
  if (!call.phone) return 'בלי מספר טלפון';
  const answer = CAMPAIGN_KEYS[call.key];
  const db = adminDb();
  const { data: audits } = await db.from('attendance_audits').select('id, title').eq('status', 'open');
  if (!audits?.length) return 'אין ביקורת פתוחה';
  const hits: { row: AuditStudent; title: string }[] = [];
  for (const a of audits as { id: string; title: string }[]) {
    for (const r of await getAuditStudents(db, a.id)) if (normPhone(r.phone) === call.phone) hits.push({ row: r, title: a.title });
  }
  if (!hits.length) return 'הטלפון לא נמצא ברשימת ביקורת פתוחה';
  const missing = hits.filter((h) => !h.row.present);
  if (!missing.length) return 'כבר סומן נוכח';
  if (!answer) return call.key ? `מקש ${call.key} — אין לו משמעות` : 'לא הוקש מקש';
  // one phone for several missing people (brothers): the answer cannot be given to one of them
  if (missing.length > 1) return `אותו טלפון אצל ${missing.length} חסרים — לא נרשם`;
  const { row, title } = missing[0];
  await setCallStatus(db, row.audit_id, row.id, answer, CAMPAIGN_NOTE[answer], call.phone, 'robot-key');
  return `${answer === 'coming' ? 'בדרך' : 'לא יכול'} — ${`${row.last_name || ''} ${row.first_name || ''}`.trim()} (${title})`;
}

/** The route: always answers 200 quickly (ימות does not need our errors). */
export async function handleCampaignWebhook(secret: string, params: URLSearchParams): Promise<Response> {
  const expected = campaignWebhookSecret();
  if (!expected || secret !== expected) return new Response('not found', { status: 404 });
  const call = parseCampaignCall(params);
  let result: string;
  try { result = await applyCampaignCall(call); } catch (e: any) { result = 'שגיאה: ' + (e?.message || 'לא ידועה'); }
  try { await keepLog({ at: new Date().toISOString(), phone: call.phone, key: call.key, result, fields: call.fields }); } catch { /* the log is best effort */ }
  return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
