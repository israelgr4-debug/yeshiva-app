// The phone conversation of ביקורת נוכחות — what ימות should say / ask next, given everything
// the caller keyed so far. Pure (data access is injected), so it can be tested without ימות.
//
// One extension serves two kinds of callers:
//   * a MISSING student calling from his own phone (after the robot's message) → personal
//     menu: 1 = on my way (+ in how many minutes), 2 = can't come (1 out of town / 2 other).
//     9 = go to marking (a marker who is himself still on the missing list).
//   * anyone else → marking: code# present, *code# undo, 0# last five, full ת"ז.
// A student can never mark himself present — only "בדרך" / "לא יכול".
//
// ימות command syntax — from the official doc of the API module (f2.freeivr.co.il/topic/56,
// "read" + "קבלת נתונים מהמשתמש"). The 15 comma-separated values of a keyed answer:
//   1 value name · 2 use an earlier answer (empty = ask again) · 3 max digits · 4 min digits ·
//   5 seconds to wait · 6 playback of what was keyed (`NO` = none) · 7 block * (empty = allowed,
//   we need it for undo) · 8 block 0 · 9 replace a key · 10 allowed keys (single digit: the
//   digits in a row, e.g. `129`) · 11 times the question is played · 12 `Ok` = accept empty ·
//   13 text sent for empty · 14 keyboard lock · 15 `no` = do NOT ask "לאישור הקישו 1" after
//   every answer (the default asks — it would double every marking).
// Message part: items joined by `.`; `t-` = text to speech (no `.` or `-` inside — see tts()),
// `d-` = digits. A read cannot be chained with another action.
// Every question uses a NEW value name <kind><n> with a running n, so the latest answer is
// the highest n and its kind says which question it answered — no server-side call state.
//   m = marking entry · a = personal menu · b = minutes · r = reason

import { AuditStudent, CallStatus, MarkResult, OUT_OF_TOWN, fullName, tts } from './attendance';

export interface DialogDeps {
  /** the missing student this phone belongs to (null when none / ambiguous / already present) */
  caller: () => Promise<AuditStudent | null>;
  mark: (input: string) => Promise<MarkResult>;
  last: () => Promise<AuditStudent[]>;
  setCall: (row: AuditStudent, status: CallStatus, note: string) => Promise<void>;
}

const read = (name: string, say: string[], max = 10, min = 1, sec = 30, keys = '') =>
  `read=${say.join('.')}=${name},,${max},${min},${sec},NO,,,,${keys},,,,,no`;
const say = (...parts: string[]) => `id_list_message=${parts.join('.')}`;
const nameOf = (s: AuditStudent) => fullName(s) || 'תלמיד';

const MARK_PROMPT = [tts('הקישו קוד תלמיד וסולמית')];
const menu = (n: number, s: AuditStudent) => read(`a${n}`, [tts(`שלום ${nameOf(s)}`), tts('אם אתה בדרך לביקורת הקש 1'), tts('אם אינך יכול להגיע הקש 2')], 1, 1, 15, '129');
const askMinutes = (n: number) => read(`b${n}`, [tts('בעוד כמה דקות תגיע'), tts('הקש מספר דקות וסולמית')], 3, 1, 15);
const askReason = (n: number) => read(`r${n}`, [tts('אם אתה מחוץ לעיר הקש 1'), tts('מסיבה אחרת הקש 2')], 1, 1, 15, '12');

export async function attendanceDialog(params: URLSearchParams, deps: DialogDeps): Promise<string> {
  let step = 0, kind = '', value = '';
  params.forEach((v, k) => {
    const m = k.match(/^([mabr])(\d+)$/);
    if (m && Number(m[2]) >= step) { step = Number(m[2]); kind = m[1]; value = v; }
  });
  const next = step + 1;
  const input = value.trim();

  if (!step) {
    const me = await deps.caller();
    return me ? menu(next, me) : read(`m${next}`, [tts('ביקורת נוכחות'), ...MARK_PROMPT]);
  }

  if (kind === 'a') {
    if (input === '9') return read(`m${next}`, MARK_PROMPT);
    const me = await deps.caller();
    if (!me) return say(tts('כבר סומנת כנוכח תודה'));
    if (input === '1') return askMinutes(next);
    if (input === '2') return askReason(next);
    return menu(next, me);
  }

  if (kind === 'b' || kind === 'r') {
    const me = await deps.caller();
    if (!me) return say(tts('כבר סומנת כנוכח תודה'));
    if (kind === 'b') {
      const min = Number(input.replace(/\D/g, ''));
      if (!input || !Number.isFinite(min) || min > 300) return askMinutes(next);
      await deps.setCall(me, 'coming', min ? `בעוד ${min} דקות` : 'מגיע מיד');
      return say(tts(min ? `תודה נרשם שתגיע בעוד ${min} דקות` : 'תודה נרשם שאתה מגיע מיד'));
    }
    if (input !== '1' && input !== '2') return askReason(next);
    await deps.setCall(me, 'cant', input === '1' ? OUT_OF_TOWN : 'אחר');
    return say(tts(input === '1' ? 'תודה נרשם שאתה מחוץ לעיר' : 'תודה נרשם שאינך יכול להגיע'));
  }

  // ---- marking ----
  const ask = (...parts: string[]) => read(`m${next}`, parts);
  if (input === '0') {
    const last = await deps.last();
    if (!last.length) return ask(tts('עדיין לא סומן אף אחד'));
    return ask(tts('האחרונים שסומנו'), ...last.map((s) => tts(nameOf(s))));
  }
  try {
    const r = await deps.mark(input);
    if (!r.ok) return ask(tts('לא נמצא'), `d-${input.replace(/\D/g, '')}`, tts('הקישו שוב'));
    const name = nameOf(r.student);
    if (r.kind === 'present') return ask(tts(name), tts('נוכח'));
    if (r.kind === 'already') return ask(tts(name), tts('כבר סומן'));
    if (r.kind === 'undone') return ask(tts('בוטל'), tts(name));
    return ask(tts(name), tts('לא היה מסומן'));
  } catch {
    return ask(tts('תקלה בשמירה נסו שוב'));
  }
}
