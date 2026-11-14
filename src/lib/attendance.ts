// ביקורת נוכחות (mig 061) — shared, pure logic for the app screens, the public team link
// and the server routes: who is on the eligible list (Ministry of Religion DAT file ×
// our students), what should be fixed before an audit, codes for kosher-phone marking,
// and the live numbers (percent, how many are still needed for the target).

import { SHIURIM } from './shiurim';

// ---------------- types ----------------

export type AuditKind = 'real' | 'practice' | 'repeat';
export type AuditGroup = 'yeshiva' | 'kollel' | 'unknown';
export type CallStatus = 'none' | 'coming' | 'no_answer' | 'cant';

export interface AttendanceAudit {
  id: string;
  title: string;
  kind: AuditKind;
  status: 'open' | 'closed';
  target_pct: number;
  parent_audit_id: string | null;
  access_token: string;
  access_code: string;
  code_length: number;
  dat_file_name: string | null;
  dat_uploaded_at: string | null;
  robot_auto: boolean;
  robot_interval_min: number;
  robot_last_run_at: string | null;
  robot_runs: number;
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
}

export interface AuditStudent {
  id: string;
  audit_id: string;
  student_id: string | null;
  code: string;
  id_number: string | null;
  last_name: string | null;
  first_name: string | null;
  grp: AuditGroup;
  shiur: string | null;
  room: string | null;
  phone: string | null;
  present: boolean;
  present_at: string | null;
  marked_by: string | null;
  marked_via: string | null;
  call_status: CallStatus;
  call_note: string | null;
  call_by: string | null;
  call_at: string | null;
  prev_missing: boolean;
}

/** What the team link gets — no ID numbers. */
export type TeamStudent = Omit<AuditStudent, 'id_number' | 'audit_id' | 'student_id' | 'marked_by' | 'call_by'>;

export interface TeamAudit {
  title: string;
  kind: AuditKind;
  status: 'open' | 'closed';
  target_pct: number;
  code_length: number;
  opened_at: string;
  robot_auto: boolean;
  robot_interval_min: number;
  robot_last_run_at: string | null;
  robot_runs: number;
}

export const KIND_LABEL: Record<AuditKind, string> = { real: 'ביקורת', practice: 'תרגול', repeat: 'ביקורת חוזרת' };
export const CALL_LABEL: Record<CallStatus, string> = { none: '', coming: 'בדרך', no_answer: 'לא עונה', cant: 'לא יכול' };
export const GROUP_LABEL: Record<AuditGroup, string> = { yeshiva: 'בחורים', kollel: 'אברכים', unknown: 'לא במערכת' };

// ---------------- DAT file (stored by פעולות → השוואה למשרדים) ----------------

export interface DatRow { firstName: string; lastName: string; idNumber: string; entitlement?: string; idType?: string }
export interface DatStored { rows: DatRow[]; uploadedAt: string; fileName: string }
export const DAT_SETTING = 'ministry_dat_data';
export const DAT_MAX_AGE_DAYS = 30;

export function datAgeDays(d: { uploadedAt?: string } | null | undefined): number | null {
  const t = d?.uploadedAt ? new Date(d.uploadedAt).getTime() : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
}
export const isEligible = (r: DatRow) => (r.entitlement || '').trim() === 'זכאי';

// ---------------- matching DAT rows to students ----------------

export interface StudentForAudit {
  id: string;
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  passport_number: string | null;
  govt_id_number: string | null;
  shiur: string | null;
  institution_name: string | null;
  status: string;
  phone: string | null;
  room_number: number | null;
  id_scan_path: string | null;
}
export const STUDENT_AUDIT_COLS = 'id, first_name, last_name, id_number, passport_number, govt_id_number, shiur, institution_name, status, phone, room_number, id_scan_path';

/** Keys an ID can be found by: digits without leading zeros, and letters+digits (passports). */
export function idKeys(id: string | null | undefined): string[] {
  if (!id) return [];
  const out: string[] = [];
  const digits = String(id).replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length >= 5) out.push('D:' + digits);
  const alnum = String(id).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
  if (alnum.length >= 5 && alnum !== digits) out.push('A:' + alnum);
  return out;
}

const isKollel = (s: StudentForAudit) => !!s.institution_name && s.institution_name.includes('כולל');
/** The inactive כולל (ר' יצחק פינקל) is left out of the audit altogether. */
const isExcludedInstitution = (s: StudentForAudit) => !!s.institution_name && s.institution_name.includes('פינקל');

export interface EligibleRow { dat: DatRow; student: StudentForAudit | null; grp: AuditGroup }

export function buildEligible(dat: DatStored | null, students: StudentForAudit[]): { rows: EligibleRow[]; excluded: EligibleRow[] } {
  const byKey = new Map<string, StudentForAudit>();
  // active students win when two students share a key
  const sorted = [...students].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
  for (const s of sorted) {
    for (const k of [...idKeys(s.id_number), ...idKeys(s.passport_number), ...idKeys(s.govt_id_number)]) if (!byKey.has(k)) byKey.set(k, s);
  }
  const rows: EligibleRow[] = [];
  const excluded: EligibleRow[] = [];
  const seen = new Set<string>();
  for (const r of dat?.rows || []) {
    if (!isEligible(r)) continue;
    const keys = idKeys(r.idNumber);
    if (keys.length && keys.some((k) => seen.has(k))) continue;   // the file lists someone twice
    keys.forEach((k) => seen.add(k));
    let student: StudentForAudit | null = null;
    for (const k of keys) { const s = byKey.get(k); if (s) { student = s; break; } }
    const row: EligibleRow = { dat: r, student, grp: !student ? 'unknown' : isKollel(student) ? 'kollel' : 'yeshiva' };
    if (student && isExcludedInstitution(student)) excluded.push(row); else rows.push(row);
  }
  return { rows, excluded };
}

// ---------------- phones ----------------

export function normPhone(p: string | null | undefined): string {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d;
  return d;
}
export const isValidPhone = (p: string | null | undefined) => /^0(5\d{8}|[23489]\d{7}|7\d{8})$/.test(normPhone(p));

// ---------------- sorting / codes ----------------

const SHIUR_RANK = new Map(SHIURIM.map((s, i) => [s.name, i]));
const GROUP_RANK: Record<AuditGroup, number> = { yeshiva: 0, kollel: 1, unknown: 2 };
type Sortable = { grp: AuditGroup; shiur: string | null; last_name: string | null; first_name: string | null };

export function compareAudit(a: Sortable, b: Sortable): number {
  return GROUP_RANK[a.grp] - GROUP_RANK[b.grp]
    || (SHIUR_RANK.get(a.shiur || '') ?? 800) - (SHIUR_RANK.get(b.shiur || '') ?? 800)
    || (a.last_name || '').localeCompare(b.last_name || '', 'he')
    || (a.first_name || '').localeCompare(b.first_name || '', 'he');
}

/** Section a person is listed under on sheets and screens: the shiur, or אברכים / לא במערכת. */
export const sectionOf = (s: { grp: AuditGroup; shiur: string | null }) =>
  (s.grp === 'yeshiva' ? (s.shiur || 'ללא שיעור') : GROUP_LABEL[s.grp]);

export type NewAuditStudent = Pick<AuditStudent, 'student_id' | 'code' | 'id_number' | 'last_name' | 'first_name' | 'grp' | 'shiur' | 'room' | 'phone' | 'prev_missing'>;

/**
 * The frozen list of an audit: sorted like the printed sheet, with a running code
 * (3 digits from 101; 4 digits from 1001 when there are more than 899 people).
 */
export function buildAuditRows(eligible: EligibleRow[], prevMissing: Set<string> = new Set()): { rows: NewAuditStudent[]; codeLength: number } {
  const base = eligible.map((e) => ({
    student_id: e.student?.id || null,
    id_number: e.dat.idNumber || e.student?.id_number || null,
    last_name: (e.student?.last_name || e.dat.lastName || '').trim() || null,
    first_name: (e.student?.first_name || e.dat.firstName || '').trim() || null,
    grp: e.grp,
    shiur: e.grp === 'yeshiva' ? (e.student?.shiur || null) : null,
    room: e.grp === 'yeshiva' && e.student?.room_number ? String(e.student.room_number) : null,
    phone: e.student?.phone ? normPhone(e.student.phone) || null : null,
  })).sort(compareAudit);
  const codeLength = base.length > 899 ? 4 : 3;
  const start = codeLength === 4 ? 1001 : 101;
  return {
    codeLength,
    rows: base.map((r, i) => ({ ...r, code: String(start + i), prev_missing: idKeys(r.id_number).some((k) => prevMissing.has(k)) })),
  };
}

// ---------------- readiness ("מוכנות") ----------------

export interface ReadinessItem { key: string; name: string; idNumber: string; shiur: string; studentId: string | null; extra?: string }
export interface ReadinessSection { key: string; title: string; hint: string; tone: 'red' | 'amber' | 'blue'; items: ReadinessItem[] }

const STATUS_LABEL: Record<string, string> = { active: 'פעיל', inactive: 'לא פעיל', graduated: 'בוגר', chizuk: 'חיזוק' };

export function buildReadiness(eligible: EligibleRow[]): ReadinessSection[] {
  const item = (e: EligibleRow, extra?: string): ReadinessItem => ({
    key: e.student?.id || e.dat.idNumber,
    name: `${e.student?.last_name || e.dat.lastName || ''} ${e.student?.first_name || e.dat.firstName || ''}`.trim(),
    idNumber: e.dat.idNumber || '',
    shiur: e.grp === 'yeshiva' ? (e.student?.shiur || '') : GROUP_LABEL[e.grp],
    studentId: e.student?.id || null,
    extra,
  });
  const byPhone = new Map<string, EligibleRow[]>();
  for (const e of eligible) {
    const p = e.student && isValidPhone(e.student.phone) ? normPhone(e.student.phone) : '';
    if (p) { if (!byPhone.has(p)) byPhone.set(p, []); byPhone.get(p)!.push(e); }
  }
  const sections: ReadinessSection[] = [
    { key: 'notfound', tone: 'red', title: 'זכאים בדתות שלא נמצאו במערכת', hint: 'רשומים כזכאים בקובץ הדתות, אבל אין תלמיד עם הת״ז הזו. בביקורת הם ייספרו כחסרים בלי טלפון ובלי חדר.',
      items: eligible.filter((e) => !e.student).map((e) => item(e)) },
    { key: 'notactive', tone: 'red', title: 'זכאים שאינם פעילים אצלנו', hint: 'רשומים כזכאים בדתות, אבל אצלנו הם לא פעילים (עזבו / חיזוק / בוגר). צריך לעדכן בדתות, או לוודא שיגיעו לביקורת.',
      items: eligible.filter((e) => e.student && e.student.status !== 'active').map((e) => item(e, STATUS_LABEL[e.student!.status] || e.student!.status)) },
    { key: 'nophone', tone: 'amber', title: 'בלי נייד, או נייד לא תקין', hint: 'אי אפשר יהיה להתקשר אליהם בזמן ביקורת.',
      items: eligible.filter((e) => e.student && !isValidPhone(e.student.phone)).map((e) => item(e, e.student!.phone || 'אין מספר')) },
    { key: 'dupphone', tone: 'amber', title: 'אותו נייד אצל כמה זכאים', hint: 'שיחה אחת תגיע רק לאחד מהם.',
      items: Array.from(byPhone.entries()).filter(([, l]) => l.length > 1).flatMap(([p, l]) => l.map((e) => item(e, p))) },
    { key: 'noroom', tone: 'amber', title: 'בחורים בלי חדר בפנימייה', hint: 'הסיירים לא ידעו איפה לחפש אותם.',
      items: eligible.filter((e) => e.grp === 'yeshiva' && e.student && e.student.status === 'active' && !e.student.room_number).map((e) => item(e)) },
    { key: 'noscan', tone: 'blue', title: 'בלי סריקת תעודת זהות', hint: 'כדאי להשלים סריקה בכרטיס התלמיד.',
      items: eligible.filter((e) => e.student && !e.student.id_scan_path).map((e) => item(e)) },
  ];
  for (const s of sections) s.items.sort((a, b) => a.shiur.localeCompare(b.shiur, 'he') || a.name.localeCompare(b.name, 'he'));
  return sections;
}

// ---------------- live numbers ----------------

export interface AuditStats { total: number; present: number; missing: number; pct: number; needed: number; reached: boolean }

export function auditStats(list: { present: boolean }[], targetPct: number): AuditStats {
  const total = list.length;
  const present = list.filter((s) => s.present).length;
  const goal = Math.ceil((Number(targetPct) / 100) * total - 1e-9);
  return {
    total, present, missing: total - present,
    pct: total ? Math.floor((present / total) * 1000) / 10 : 0,
    needed: Math.max(0, goal - present),
    reached: total > 0 && present >= goal,
  };
}

// ---------------- "can't come" reasons / "on my way" ----------------

/** call_note of a "לא יכול" whose reason is being out of town (set by the caller screen or by the student on the phone). */
export const OUT_OF_TOWN = 'מחוץ לעיר';
export const isOutOfTown = (s: { call_status: CallStatus; call_note: string | null }) =>
  s.call_status === 'cant' && (s.call_note || '').startsWith(OUT_OF_TOWN);

/** Until when a "בדרך" holds off the robot: the minutes he gave + 5, at least 10. */
export function comingUntil(s: { call_status: CallStatus; call_note: string | null; call_at: string | null }): number {
  if (s.call_status !== 'coming' || !s.call_at) return 0;
  const m = (s.call_note || '').match(/(\d+)\s*דק/);
  return new Date(s.call_at).getTime() + Math.max(10, (m ? Number(m[1]) : 0) + 5) * 60000;
}

export type MarkResult =
  | { ok: true; kind: 'present' | 'already' | 'undone' | 'not_marked'; student: AuditStudent }
  | { ok: false; kind: 'not_found' };

/** ימות reads `t-` text; these characters separate commands, so they must not appear inside it. */
export const tts = (s: string) => 't-' + s.replace(/[.\-=&,"'()\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

export const fullName = (s: { last_name: string | null; first_name: string | null }) => `${s.last_name || ''} ${s.first_name || ''}`.trim();
export const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');
