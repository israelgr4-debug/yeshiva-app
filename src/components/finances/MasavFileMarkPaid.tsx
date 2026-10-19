'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

// Mark an ALREADY-EXPORTED מס"ב file as paid, using exactly what the file contains
// (date, serial, and every account+amount) — not today's recalculation, which may
// have changed since the file was sent.

interface FileTx { bank: string; branch: string; account: string; amount: number; nameInFile: string }
interface ParsedFile { chargeDate: string; serial: number; txs: FileTx[]; totalOk: boolean; fileTotal: number; fileCount: number }
interface StudentPart { id: string; name: string; amount: number }
interface Row extends FileTx {
  familyName: string | null;
  students: StudentPart[];
  note: 'exact' | 'single' | 'proportional' | 'unmatched' | 'nostudents';
}

const ils = (n: number) => '₪' + n.toLocaleString('he-IL', { maximumFractionDigits: 2 });
const digits = (v: any) => String(v ?? '').replace(/\D/g, '');
const stripZeros = (v: any) => digits(v).replace(/^0+/, '') || '0';
const NOTE_LABEL: Record<Row['note'], string> = {
  exact: '✅ תואם',
  single: '✅ תלמיד יחיד',
  proportional: '⚠️ פוצל יחסית',
  unmatched: '❌ חשבון לא נמצא',
  nostudents: '❌ אין תלמיד בהו״ק בנק',
};

// Parse the 128-byte-record מס"ב file (Windows-1255). Positions are 1-based per spec.
function parseMasav(buf: ArrayBuffer): ParsedFile {
  const text = new TextDecoder('windows-1255').decode(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines.find((l) => l[0] === 'K');
  if (!header || header.length < 128) throw new Error('הקובץ אינו קובץ מס"ב תקין (חסרה רשומת כותרת K)');
  const yymmdd = header.slice(11, 17);
  const chargeDate = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  const serial = Number(header.slice(18, 21)) || 0;

  const txs: FileTx[] = [];
  for (const l of lines) {
    if (l[0] !== '1' || l.length < 128) continue;
    txs.push({
      bank: stripZeros(l.slice(17, 19)),
      branch: stripZeros(l.slice(19, 22)),
      account: stripZeros(l.slice(26, 35)),
      amount: (Number(l.slice(61, 74)) || 0) / 100,
      nameInFile: l.slice(45, 61).trim().split('').reverse().join(''), // stored visually → flip to read
    });
  }
  const total = lines.find((l) => l[0] === '5');
  const fileTotal = total ? (Number(total.slice(36, 51)) || 0) / 100 : 0;
  const fileCount = total ? Number(total.slice(58, 65)) || 0 : 0;
  const sum = txs.reduce((s, t) => s + t.amount, 0);
  return { chargeDate, serial, txs, fileTotal, fileCount, totalOk: Math.abs(sum - fileTotal) < 0.01 && fileCount === txs.length };
}

export function MasavFileMarkPaid({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const onFile = async (f: File) => {
    setError(null); setResult(null); setRows([]); setFile(null); setLoading(true);
    try {
      const parsed = parseMasav(await f.arrayBuffer());
      setFile(parsed);
      const month = parsed.chargeDate.slice(0, 7);

      // Families by bank account.
      const fams = await fetchAll<{ id: string; family_name: string; father_name: string | null; bank_number: any; bank_branch: any; bank_account: any }>(
        'families', 'id, family_name, father_name, bank_number, bank_branch, bank_account'
      );
      const byAcct = new Map<string, typeof fams>();
      for (const fm of fams) {
        if (!fm.bank_account) continue;
        const k = stripZeros(fm.bank_account);
        (byAcct.get(k) || byAcct.set(k, []).get(k)!).push(fm);
      }
      const matchFam = (t: FileTx) => {
        const c = byAcct.get(t.account) || [];
        return c.find((fm) => stripZeros(fm.bank_number) === t.bank && stripZeros(fm.bank_branch) === t.branch) || c[0] || null;
      };
      const famOf = parsed.txs.map(matchFam);
      const famIds = [...new Set(famOf.filter(Boolean).map((fm) => fm!.id))];

      // Students of those families + their bank tuition + this month's adjustments.
      const studs = famIds.length ? await fetchAll<{ id: string; first_name: string; last_name: string; family_id: string }>(
        'students', 'id, first_name, last_name, family_id', (q) => q.in('family_id', famIds)) : [];
      const sids = studs.map((s) => s.id);
      const tuition = sids.length ? await fetchAll<{ student_id: string; monthly_amount: number; payment_method: string; active: boolean }>(
        'student_tuition', 'student_id, monthly_amount, payment_method, active', (q) => q.in('student_id', sids).eq('payment_method', 'bank_ho')) : [];
      const adjs = sids.length ? await fetchAll<{ student_id: string; kind: string; amount: number }>(
        'charge_adjustments', 'student_id, kind, amount', (q) => q.in('student_id', sids).eq('month', month).eq('status', 'active')) : [];

      const tBy = new Map(tuition.map((t) => [t.student_id, t]));
      const expected = (sid: string) => {
        const t = tBy.get(sid); if (!t) return 0;
        let ov: number | null = null, add = 0;
        for (const a of adjs) if (a.student_id === sid) { if (a.kind === 'override') ov = Number(a.amount) || 0; else add += Number(a.amount) || 0; }
        return (ov ?? (Number(t.monthly_amount) || 0)) + add;
      };

      const out: Row[] = parsed.txs.map((t, i) => {
        const fm = famOf[i];
        if (!fm) return { ...t, familyName: null, students: [], note: 'unmatched' };
        const famStuds = studs.filter((s) => s.family_id === fm.id && tBy.has(s.id));
        const active = famStuds.filter((s) => tBy.get(s.id)!.active);
        const familyName = `${fm.family_name} ${fm.father_name || ''}`.trim();
        const label = (s: typeof studs[number]) => `${s.last_name} ${s.first_name}`;
        if (famStuds.length === 0) return { ...t, familyName, students: [], note: 'nostudents' };

        // Prefer a set whose expected amounts add up exactly to the file amount.
        for (const set of [active, famStuds]) {
          if (set.length === 0) continue;
          const sum = set.reduce((s, x) => s + expected(x.id), 0);
          if (Math.abs(sum - t.amount) < 0.01) {
            return { ...t, familyName, note: set.length === 1 ? 'single' : 'exact', students: set.map((s) => ({ id: s.id, name: label(s), amount: expected(s.id) })) };
          }
        }
        const set = active.length ? active : famStuds;
        if (set.length === 1) return { ...t, familyName, note: 'single', students: [{ id: set[0].id, name: label(set[0]), amount: t.amount }] };
        // Proportional split by expected (equal if no expectations), remainder to the first.
        const weights = set.map((s) => expected(s.id));
        const wSum = weights.reduce((a, b) => a + b, 0);
        const parts = set.map((_s, j) => Math.floor((wSum > 0 ? (t.amount * weights[j]) / wSum : t.amount / set.length) * 100) / 100);
        parts[0] = Math.round((parts[0] + (t.amount - parts.reduce((a, b) => a + b, 0))) * 100) / 100;
        return { ...t, familyName, note: 'proportional', students: set.map((s, j) => ({ id: s.id, name: label(s), amount: parts[j] })) };
      });
      setRows(out);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setLoading(false); }
  };

  const items = rows.flatMap((r) => r.students);
  const matchedTotal = rows.filter((r) => r.students.length).reduce((s, r) => s + r.amount, 0);
  const unmatched = rows.filter((r) => !r.students.length);
  const proportional = rows.filter((r) => r.note === 'proportional').length;

  const apply = async () => {
    if (!file || items.length === 0) return;
    if (!confirm(`לסמן ${items.length} תלמידים כנפרעו לתאריך ${file.chargeDate.split('-').reverse().join('/')} (שידור ${file.serial})?\nסה״כ ${ils(matchedTotal)}.\n\n*** רק אם הבנק אכן זיכה את הקובץ ***`)) return;
    setBusy(true); setResult(null);
    const month = file.chargeDate.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const nd = new Date(y, m, 1);
    const nextStart = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
    let inserted = 0, updated = 0, skipped = 0;
    const errors: string[] = [];
    try {
      // Existing BANK rows for these students this month (credit mirrors excluded).
      const existing: Record<string, any[]> = {};
      for (let i = 0; i < items.length; i += 100) {
        const { data, error } = await supabase.from('payment_history')
          .select('id, student_id, amount_ils, status_code')
          .in('student_id', items.slice(i, i + 100).map((x) => x.id))
          .gte('payment_date', `${month}-01`).lt('payment_date', nextStart)
          .is('nedarim_transaction_id', null);
        if (error) throw error;
        for (const r of data || []) (existing[r.student_id] ||= []).push(r);
      }
      for (const it of items) {
        const ex = existing[it.id] || [];
        try {
          if (ex.length === 0) {
            const { error } = await supabase.from('payment_history').insert({
              student_id: it.id, payment_date: file.chargeDate, amount_ils: it.amount,
              status_code: 2, status_name: 'נפרע', group_number: file.serial,
            });
            if (error) throw error;
            inserted++;
          } else if (ex.length > 1) {
            errors.push(`${it.name}: ${ex.length} רשומות בנק בחודש זה — בדוק ידנית`); skipped++;
          } else if (ex[0].status_code === 2) {
            if (Math.abs((Number(ex[0].amount_ils) || 0) - it.amount) >= 0.01) errors.push(`${it.name}: כבר נפרע בסכום ${ils(Number(ex[0].amount_ils))} (בקובץ ${ils(it.amount)})`);
            skipped++;
          } else if (ex[0].status_code === 3) {
            errors.push(`${it.name}: מסומן כחזר — לא שונה`); skipped++;
          } else {
            const { error } = await supabase.from('payment_history').update({
              status_code: 2, status_name: 'נפרע', payment_date: file.chargeDate, amount_ils: it.amount, group_number: file.serial,
            }).eq('id', ex[0].id);
            if (error) throw error;
            updated++;
          }
        } catch (e: any) { errors.push(`${it.name}: ${e?.message || e}`); }
      }
      setResult({ inserted, updated, skipped, errors });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-[5vh]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📂 סימון קובץ מס״ב שכבר יוצא כנפרע</h2>
            <p className="text-sm text-slate-500 mt-1">מעלים את קובץ ה-txt ששודר — הסימון לפי מה שבקובץ בדיוק (תאריך, מספר שידור, חשבונות וסכומים), לא לפי חישוב של היום.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          📥 בחר קובץ מס״ב (txt)
          <input type="file" accept=".txt,.msv,.dat" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
        </label>

        {loading && <div className="mt-4 text-sm text-slate-400">קורא ומתאים…</div>}
        {error && <div className="mt-4 text-sm bg-red-50 text-red-700 rounded-lg p-3">{error}</div>}

        {file && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4 text-sm">
              <Box label="תאריך חיוב" value={file.chargeDate.split('-').reverse().join('/')} />
              <Box label="מספר שידור" value={String(file.serial)} />
              <Box label="תנועות בקובץ" value={String(rows.length)} />
              <Box label="סה״כ בקובץ" value={ils(file.fileTotal)} />
              <Box label="תלמידים לסימון" value={String(items.length)} />
            </div>
            {!file.totalOk && (
              <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">⚠️ סכום/מספר התנועות לא תואם לרשומת הסה״כ בקובץ — ודא שזה הקובץ הנכון.</div>
            )}
            {(unmatched.length > 0 || proportional > 0) && (
              <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                {unmatched.length > 0 && <>❌ {unmatched.length} חשבונות לא זוהו — לא יסומנו (סה״כ {ils(unmatched.reduce((s, r) => s + r.amount, 0))}). </>}
                {proportional > 0 && <>⚠️ {proportional} משפחות עם כמה תלמידים שסכומם לא תאם — הסכום פוצל יחסית; בדוק.</>}
              </div>
            )}

            <div className="mt-3 border border-slate-200 rounded-xl max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-start px-3 py-2">חשבון</th>
                    <th className="text-start px-3 py-2">שם בקובץ</th>
                    <th className="text-start px-3 py-2">סכום</th>
                    <th className="text-start px-3 py-2">תלמידים שיסומנו</th>
                    <th className="text-start px-3 py-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-50 align-top">
                      <td className="px-3 py-1.5 text-slate-500" dir="ltr">{r.bank}-{r.branch}-{r.account}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.nameInFile}</td>
                      <td className="px-3 py-1.5 font-semibold">{ils(r.amount)}</td>
                      <td className="px-3 py-1.5">
                        {r.students.length
                          ? r.students.map((s) => <div key={s.id}><Link href={`/students/${s.id}`} className="text-blue-700 hover:underline">{s.name}</Link> · {ils(s.amount)}</div>)
                          : <span className="text-slate-400">{r.familyName || '—'}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-xs whitespace-nowrap">{NOTE_LABEL[r.note]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result && (
              <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                ✓ נוספו {result.inserted} · עודכנו (צפי→נפרע) {result.updated} · דולגו {result.skipped}
                {result.errors.length > 0 && (
                  <details className="mt-1"><summary className="cursor-pointer">פירוט ({result.errors.length})</summary>
                    <ul className="text-xs mt-1 space-y-0.5 max-h-32 overflow-y-auto">{result.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={onClose} disabled={busy}>סגור</Button>
              <Button onClick={apply} disabled={busy || items.length === 0 || !!result}>
                {busy ? 'מסמן…' : `✅ סמן ${items.length} תלמידים כנפרעו`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  );
}
