'use client';

// Tuition split: the additional payers of ONE student (second parent / outside payer).
// Shown in the student card (tuition tab) and opened from the monthly collection screen.
// Model + rules: lib/tuition-payers.ts.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { checkBankAccount } from '@/lib/israeli-validators';
import {
  ExtraPayer, ExtraPayMethod, ExtraPayerKind, EXTRA_METHOD_LABELS, EXTRA_KIND_LABELS,
  payerLabel, payerProblem, extraTotal,
} from '@/lib/tuition-payers';
import {
  listStudentPayers, savePayer, setPayerActive, deletePayer, searchCreditSubs, getSubsByIds, SubLite, PayerDraft,
} from '@/hooks/useExtraPayers';

const ils = (n: number) => '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
const METHOD_CLS: Record<ExtraPayMethod, string> = {
  bank_ho: 'bg-blue-100 text-blue-800',
  credit_nedarim: 'bg-purple-100 text-purple-800',
  office: 'bg-green-100 text-green-800',
};
const subLabel = (s: SubLite) =>
  `${s.client_name || 'ללא שם'} · ${ils(s.amount_per_charge)} · כרטיס …${s.last_4_digits || '?'} · יום ${s.scheduled_day || '?'}${s.status !== 'active' ? ' · ' + (s.status === 'frozen' ? 'מושהית' : s.status) : ''}`;

interface Props {
  studentId: string;
  /** the student's main row, for the summary line */
  mainLabel?: string;
  mainAmount?: number;
  onChanged?: () => void;
}

export function ExtraPayersPanel({ studentId, mainLabel, mainAmount, onChanged }: Props) {
  const [payers, setPayers] = useState<ExtraPayer[]>([]);
  const [subs, setSubs] = useState<Map<string, SubLite>>(new Map());
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<ExtraPayer | 'new' | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listStudentPayers(studentId);
    setPayers(r.payers);
    setMissing(r.missing);
    setSubs(await getSubsByIds(r.payers.map((p) => p.nedarim_subscription_id || '')));
    setLoading(false);
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const changed = async () => { await load(); onChanged?.(); };
  const active = payers.filter((p) => p.active);
  const extra = extraTotal(active);

  const stop = async (p: ExtraPayer) => {
    const credit = p.payment_method === 'credit_nedarim';
    if (!confirm(
      `להפסיק את החיוב של ${payerLabel(p)} (${ils(p.monthly_amount)} לחודש)?\n\n` +
      (credit
        ? 'הו"ק האשראי שלו תושהה גם בנדרים (אם היא לא משמשת תלמיד פעיל אחר).'
        : p.payment_method === 'bank_ho' ? 'הוא לא ייכלל יותר בקובץ המס"ב.' : 'הוא לא ייספר יותר בצפי.'),
    )) return;
    setBusyId(p.id);
    const ok = await setPayerActive(p.id, false);
    if (!ok) { alert('השמירה נכשלה'); setBusyId(''); return; }
    if (credit && p.nedarim_subscription_id) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/nedarim/suspend-hk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ payer_id: p.id }),
        });
        const j = await res.json();
        if (j.suspended) alert('✓ החיוב הופסק וההו"ק הושהתה בנדרים.');
        else if (j.shared) alert(`⚠️ החיוב הופסק אצלנו, אך ההו"ק משמשת גם תלמיד פעיל אחר (${(j.names || []).join(', ')}) ולכן לא הושהתה.\nיש לטפל בה ידנית בנדרים.`);
        else alert('⚠️ החיוב הופסק אצלנו, אך השהיית ההו"ק בנדרים נכשלה:\n' + (j.error || 'שגיאה') + '\nיש להשהות אותה ידנית בנדרים.');
      } catch {
        alert('⚠️ החיוב הופסק אצלנו, אך לא הייתה תקשורת עם נדרים. יש להשהות את ההו"ק ידנית בנדרים.');
      }
    }
    setBusyId('');
    changed();
  };

  const resume = async (p: ExtraPayer) => {
    setBusyId(p.id);
    const ok = await setPayerActive(p.id, true);
    setBusyId('');
    if (!ok) { alert('השמירה נכשלה'); return; }
    if (p.payment_method === 'credit_nedarim') alert('המשלם חזר לפעיל אצלנו.\nאם ההו"ק שלו הושהתה בנדרים — צריך לחדש אותה שם (לא מתחדשת לבד).');
    changed();
  };

  const remove = async (p: ExtraPayer) => {
    if (!confirm(`למחוק את ${payerLabel(p)} מרשימת המשלמים של התלמיד?`)) return;
    setBusyId(p.id);
    const r = await deletePayer(p.id);
    setBusyId('');
    if (r.hasHistory) { alert('למשלם הזה כבר נרשמו גביות, ולכן אי אפשר למחוק אותו.\nאפשר להפסיק אותו בכפתור "הפסק".'); return; }
    if (!r.ok) { alert('המחיקה נכשלה: ' + (r.error || '')); return; }
    changed();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h4 className="text-sm font-semibold text-gray-700">👥 פיצול תשלום — משלמים נוספים</h4>
        {!missing && (
          <Button size="sm" variant="secondary" type="button" onClick={() => setEdit('new')}>＋ הוסף משלם</Button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        הורה שני או משלם חיצוני (סבא וכד׳) שמשלם חלק משכר הלימוד — בסכום, באופן תשלום ובחשבון או כרטיס משלו.
        ה״אופן תשלום״ שלמעלה נשאר החלק של המשפחה.
      </p>

      {missing ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-sm">
          כדי להשתמש בפיצול תשלום צריך להריץ פעם אחת את מיגרציה 064 ב-Supabase.
        </div>
      ) : loading ? (
        <div className="text-sm text-gray-400 py-2">טוען…</div>
      ) : (
        <>
          {payers.length === 0 ? (
            <div className="text-sm text-gray-400 py-1">אין משלמים נוספים — כל שכר הלימוד על המשפחה.</div>
          ) : (
            <div className="space-y-2">
              {payers.map((p) => {
                const sub = p.nedarim_subscription_id ? subs.get(p.nedarim_subscription_id) : undefined;
                const problem = p.active ? payerProblem(p) : '';
                const bank = p.payment_method === 'bank_ho' && p.bank_number && p.bank_branch && p.bank_account
                  ? checkBankAccount(p.bank_number, p.bank_branch, p.bank_account) : null;
                const badAccount = bank && (bank.result === 'invalid' || bank.result === 'bad-check');
                return (
                  <div key={p.id} className={`rounded-lg border px-3 py-2 ${p.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{payerLabel(p)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${METHOD_CLS[p.payment_method]}`}>{EXTRA_METHOD_LABELS[p.payment_method]}</span>
                      <span className="font-bold text-green-700">{ils(p.monthly_amount)}</span>
                      {!p.active && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">הופסק</span>}
                      <span className="flex-1" />
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setEdit(p)}>ערוך</button>
                      {p.active
                        ? <button type="button" disabled={busyId === p.id} className="text-xs text-red-700 hover:underline disabled:opacity-50" onClick={() => stop(p)}>הפסק</button>
                        : <button type="button" disabled={busyId === p.id} className="text-xs text-emerald-700 hover:underline disabled:opacity-50" onClick={() => resume(p)}>הפעל</button>}
                      <button type="button" disabled={busyId === p.id} className="text-xs text-gray-500 hover:underline disabled:opacity-50" onClick={() => remove(p)}>מחק</button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {p.payment_method === 'bank_ho' && <>חשבון {p.bank_number || '?'}-{p.bank_branch || '?'}-{p.bank_account || '?'}{p.payer_id_number ? ` · ת"ז ${p.payer_id_number}` : ''}</>}
                      {p.payment_method === 'credit_nedarim' && (sub ? <>הו״ק: {subLabel(sub)}</> : <>—</>)}
                      {p.payment_method === 'office' && <>משלם במשרד (נרשם ב״תשלום במשרד״ של התלמיד)</>}
                      {p.payer_phone ? ` · ${p.payer_phone}` : ''}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </div>
                    {problem && <div className="text-xs text-red-700 font-medium mt-1">❌ {problem} — עדיין לא נגבה</div>}
                    {!problem && badAccount && <div className="text-xs text-red-700 font-medium mt-1">❌ {bank!.reason} — לבדוק את הסניף והחשבון</div>}
                    {p.active && sub && sub.status !== 'active' && <div className="text-xs text-amber-700 font-medium mt-1">⚠ ההו״ק לא פעילה בנדרים</div>}
                    {p.active && sub && Math.abs(Number(sub.amount_per_charge) - p.monthly_amount) >= 1 && (
                      <div className="text-xs text-amber-700 mt-1">⚠ ההו״ק בנדרים על {ils(sub.amount_per_charge)}, כאן רשום {ils(p.monthly_amount)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(active.length > 0 || mainAmount != null) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm bg-slate-50 rounded-lg px-3 py-2">
              {mainAmount != null && <span>המשפחה{mainLabel ? ` (${mainLabel})` : ''}: <b>{ils(mainAmount)}</b></span>}
              <span>משלמים נוספים: <b>{ils(extra)}</b></span>
              {mainAmount != null && <span className="text-green-800">סה״כ לחודש: <b>{ils(mainAmount + extra)}</b></span>}
            </div>
          )}
        </>
      )}

      {edit && (
        <PayerDialog
          studentId={studentId}
          payer={edit === 'new' ? null : edit}
          sub={edit !== 'new' && edit.nedarim_subscription_id ? subs.get(edit.nedarim_subscription_id) || null : null}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); changed(); }}
        />
      )}
    </div>
  );
}

function PayerDialog({ studentId, payer, sub, onClose, onSaved }: {
  studentId: string; payer: ExtraPayer | null; sub: SubLite | null; onClose: () => void; onSaved: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ExtraPayerKind>(payer?.payer_kind || 'external');
  const [name, setName] = useState(payer?.payer_name || '');
  const [relation, setRelation] = useState(payer?.payer_relation || '');
  const [idNumber, setIdNumber] = useState(payer?.payer_id_number || '');
  const [phone, setPhone] = useState(payer?.payer_phone || '');
  const [method, setMethod] = useState<ExtraPayMethod>(payer?.payment_method || 'bank_ho');
  const [amount, setAmount] = useState(payer ? String(payer.monthly_amount) : '');
  const [bank, setBank] = useState({
    bank_number: payer?.bank_number != null ? String(payer.bank_number) : '',
    bank_branch: payer?.bank_branch || '',
    bank_account: payer?.bank_account || '',
  });
  const [linked, setLinked] = useState<SubLite | null>(sub);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SubLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notes, setNotes] = useState(payer?.notes || '');
  const [busy, setBusy] = useState(false);

  const draft = (): PayerDraft => ({
    id: payer?.id,
    student_id: studentId,
    payer_kind: kind,
    payer_name: name,
    payer_relation: relation || null,
    payer_id_number: idNumber || null,
    payer_phone: phone || null,
    payment_method: method,
    monthly_amount: Number(amount) || 0,
    bank_number: Number(bank.bank_number) || null,
    bank_branch: bank.bank_branch || null,
    bank_account: bank.bank_account || null,
    nedarim_subscription_id: linked?.id || null,
    notes: notes || null,
  });

  const validate = (): string => {
    if (!name.trim()) return 'חסר שם המשלם';
    if (!(Number(amount) > 0)) return 'חסר סכום חודשי';
    return '';
  };

  const save = async (thenNewHk = false) => {
    const err = validate();
    if (err) { alert(err); return; }
    setBusy(true);
    const r = await savePayer(draft());
    setBusy(false);
    if (!r.ok) { alert('השמירה נכשלה: ' + (r.error || '')); return; }
    if (thenNewHk && r.id) {
      router.push(`/finances/nedarim/new-hk?student=${studentId}&payer=${r.id}&amount=${Number(amount) || ''}`);
      return;
    }
    onSaved();
  };

  const search = async () => {
    setSearching(true);
    setResults(await searchCreditSubs(term));
    setSearching(false);
  };

  const bankCheck = bank.bank_number && bank.bank_branch && bank.bank_account
    ? checkBankAccount(bank.bank_number, bank.bank_branch, bank.bank_account) : null;

  return (
    <Modal isOpen onClose={onClose} title={payer ? 'עריכת משלם נוסף' : 'משלם נוסף לשכר הלימוד'} className="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="מי המשלם" value={kind} onChange={(e) => setKind(e.target.value as ExtraPayerKind)}
            options={(Object.keys(EXTRA_KIND_LABELS) as ExtraPayerKind[]).map((k) => ({ value: k, label: EXTRA_KIND_LABELS[k] }))} />
          <Input label="קרבה (לא חובה)" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder={kind === 'parent' ? 'אם' : 'סבא'} />
        </div>
        <Input label="שם המשלם" value={name} onChange={(e) => setName(e.target.value)} placeholder="שם משפחה ושם פרטי" />
        <div className="grid grid-cols-2 gap-3">
          <Input label='ת"ז' value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="9 ספרות" />
          <Input label="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="אופן תשלום" value={method} onChange={(e) => setMethod(e.target.value as ExtraPayMethod)}
            options={(Object.keys(EXTRA_METHOD_LABELS) as ExtraPayMethod[]).map((m) => ({ value: m, label: EXTRA_METHOD_LABELS[m] }))} />
          <Input label="סכום חודשי" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>

        {method === 'bank_ho' && (
          <div className="space-y-3 bg-blue-50/50 rounded-xl p-3">
            <div className="text-sm font-semibold text-slate-700">חשבון הבנק של המשלם</div>
            <div className="grid grid-cols-3 gap-2">
              <Input label="בנק" value={bank.bank_number} onChange={(e) => setBank((b) => ({ ...b, bank_number: e.target.value }))} />
              <Input label="סניף" value={bank.bank_branch} onChange={(e) => setBank((b) => ({ ...b, bank_branch: e.target.value }))} />
              <Input label="חשבון" value={bank.bank_account} onChange={(e) => setBank((b) => ({ ...b, bank_account: e.target.value }))} />
            </div>
            {bankCheck && (
              bankCheck.result === 'valid'
                ? <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-1.5 font-medium">✓ חשבון תקין (בדיקת מס״ב)</div>
                : bankCheck.result === 'invalid' || bankCheck.result === 'bad-check'
                  ? <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-1.5 font-medium">❌ {bankCheck.reason} — כנראה טעות בסניף/חשבון</div>
                  : <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">○ {bankCheck.reason}</div>
            )}
            <div className="text-xs text-slate-500">
              המשלם ייכנס לקובץ המס״ב החודשי כשורה נפרדת, על שמו ועל החשבון הזה. צריך ממנו הרשאה לחיוב חשבון, כמו מכל הורה.
            </div>
          </div>
        )}

        {method === 'credit_nedarim' && (
          <div className="space-y-2 bg-purple-50/50 rounded-xl p-3">
            <div className="text-sm font-semibold text-slate-700">הוראת הקבע של המשלם בנדרים</div>
            {linked ? (
              <div className="flex items-center justify-between gap-2 bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm">
                <span>✓ {subLabel(linked)}</span>
                <button type="button" className="text-xs text-red-700 hover:underline shrink-0" onClick={() => setLinked(null)}>נתק</button>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-500">יש כבר הו״ק בנדרים על שם המשלם? חפש אותה וקשר:</div>
                <div className="flex gap-2">
                  <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                    placeholder='שם / ת"ז / 4 ספרות אחרונות' className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                  <Button size="sm" variant="secondary" type="button" disabled={searching || term.trim().length < 2} onClick={search}>{searching ? 'מחפש…' : 'חפש'}</Button>
                </div>
                {results && (results.length === 0
                  ? <div className="text-xs text-slate-500">לא נמצאה הו״ק מתאימה. אם היא הוקמה היום — היא תופיע אחרי הסנכרון הלילי מנדרים.</div>
                  : (
                    <div className="max-h-40 overflow-y-auto bg-white border border-purple-200 rounded-lg divide-y divide-slate-100">
                      {results.map((s) => (
                        <button key={s.id} type="button" className="w-full text-start px-3 py-1.5 text-sm hover:bg-purple-50"
                          onClick={() => { setLinked(s); setResults(null); if (!amount) setAmount(String(s.amount_per_charge)); }}>
                          {subLabel(s)}{s.client_zeout ? ` · ת"ז ${s.client_zeout}` : ''}
                        </button>
                      ))}
                    </div>
                  ))}
                <div className="text-xs text-slate-500 pt-1">אין עדיין? הקם אחת עכשיו עם הכרטיס של המשלם:</div>
                <Button size="sm" variant="primary" type="button" disabled={busy} onClick={() => save(true)}>💳 שמור והקם הו״ק — הזן כרטיס</Button>
              </>
            )}
          </div>
        )}

        {method === 'office' && (
          <div className="text-xs text-slate-500 bg-green-50/60 rounded-xl p-3">
            המשלם משלם במשרד (מזומן / צ׳ק / העברה). התשלומים נרשמים כרגיל ב״תשלום במשרד״ של התלמיד.
          </div>
        )}

        <Input label="הערה (לא חובה)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>ביטול</Button>
          <Button variant="primary" type="button" disabled={busy} onClick={() => save(false)}>{busy ? 'שומר…' : 'שמור'}</Button>
        </div>
      </div>
    </Modal>
  );
}
