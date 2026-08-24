'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

// One returned charge parsed from the מס"ב returns xlsx.
interface ReturnRow {
  bank: string; branch: string; account: string;
  amount: number; reason: string; nameInFile: string;
}
interface Matched extends ReturnRow {
  familyId: string | null;
  familyName: string;
  students: { id: string; name: string }[];
}

const ils = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');
const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
const stripZeros = (v: any) => onlyDigits(v).replace(/^0+/, '') || '0';
// מס"ב stores Hebrew names visually (reversed) — flip to read them.
const readName = (v: any) => String(v ?? '').trim().split('').reverse().join('');

function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 1; i >= -1; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ value: `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`,
               label: `${String(dd.getMonth() + 1).padStart(2, '0')}/${dd.getFullYear()}` });
  }
  return out;
}

function parseReturnsXlsx(buf: ArrayBuffer): ReturnRow[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false }) as any[][];
  // Find the header row (has בנק + חשבון + סכום).
  const hi = aoa.findIndex((row) => row && row.some((c) => String(c).includes('בנק')) && row.some((c) => String(c).includes('חשבון')));
  if (hi < 0) return [];
  const H = aoa[hi].map((c) => String(c ?? '').trim());
  const col = (needle: string) => H.findIndex((h) => h.includes(needle));
  const iBank = col('בנק'), iBranch = col('סניף'), iAcct = col('חשבון'), iAmt = col('סכום'), iReason = col('סיב'), iName = col('לקוח');
  const out: ReturnRow[] = [];
  for (let r = hi + 1; r < aoa.length; r++) {
    const row = aoa[r]; if (!row) continue;
    const reason = String(row[iReason] ?? '').trim();
    // Skip the institution summary row (automated-return total).
    if (reason.includes('ממוכנת')) continue;
    const account = onlyDigits(row[iAcct]);
    if (!account) continue;
    out.push({
      bank: onlyDigits(row[iBank]), branch: onlyDigits(row[iBranch]), account,
      amount: Number(onlyDigits(row[iAmt])) || 0,
      reason: reason || '—', nameInFile: readName(row[iName]),
    });
  }
  return out;
}

export function MasavReturnsImport() {
  const [returns, setReturns] = useState<Matched[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [marking, setMarking] = useState(false);
  const [markMsg, setMarkMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const onFile = async (file: File) => {
    setLoading(true); setMarkMsg(null); setReturns([]); setFileName(file.name);
    try {
      const rows = parseReturnsXlsx(await file.arrayBuffer());
      // Match each return to a family by bank account, then to its students.
      const fams = await fetchAll<{ id: string; family_name: string; father_name: string | null; bank_number: any; bank_branch: any; bank_account: any }>(
        'families', 'id, family_name, father_name, bank_number, bank_branch, bank_account'
      );
      // Index families by normalized account (+bank+branch for safety).
      const byAcct = new Map<string, typeof fams[number][]>();
      for (const f of fams) {
        if (!f.bank_account) continue;
        const key = stripZeros(f.bank_account);
        (byAcct.get(key) || byAcct.set(key, []).get(key)!)!.push(f);
      }
      const matchedFamIds = new Set<string>();
      const prelim = rows.map((rr) => {
        const cands = byAcct.get(stripZeros(rr.account)) || [];
        // Prefer a candidate that also matches bank + branch.
        const fam = cands.find((f) => onlyDigits(f.bank_number) === rr.bank && stripZeros(f.bank_branch) === stripZeros(rr.branch)) || cands[0] || null;
        if (fam) matchedFamIds.add(fam.id);
        return { rr, fam };
      });
      // Students of matched families.
      const stById = new Map<string, { id: string; name: string; family_id: string }[]>();
      if (matchedFamIds.size > 0) {
        const studs = await fetchAll<{ id: string; first_name: string; last_name: string; family_id: string }>(
          'students', 'id, first_name, last_name, family_id',
          (q) => q.in('family_id', [...matchedFamIds])
        );
        for (const s of studs) {
          const arr = stById.get(s.family_id) || [];
          arr.push({ id: s.id, name: `${s.last_name} ${s.first_name}`, family_id: s.family_id });
          stById.set(s.family_id, arr);
        }
      }
      const matched: Matched[] = prelim.map(({ rr, fam }) => ({
        ...rr,
        familyId: fam?.id || null,
        familyName: fam ? `${fam.family_name} ${fam.father_name || ''}`.trim() : '',
        students: fam ? (stById.get(fam.id) || []).map((s) => ({ id: s.id, name: s.name })) : [],
      }));
      setReturns(matched);
    } catch (e: any) {
      setMarkMsg('שגיאה בקריאת הקובץ: ' + (e?.message || e));
    } finally { setLoading(false); }
  };

  const total = returns.reduce((s, r) => s + r.amount, 0);
  const unmatched = returns.filter((r) => !r.familyId).length;

  // Mark every matched student's PAID row this month as bounced (status 3).
  const markBounced = async () => {
    const studentIds = returns.flatMap((r) => r.students.map((s) => s.id));
    if (studentIds.length === 0) { setMarkMsg('אין תלמידים מזוהים לסימון'); return; }
    if (!confirm(`לסמן חזרה ל-${studentIds.length} תלמידים (${returns.filter((r) => r.familyId).length} משפחות) לחודש ${month}?`)) return;
    setMarking(true); setMarkMsg(null);
    try {
      const [y, m] = month.split('-').map(Number);
      const next = new Date(y, m, 1);
      const nextStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
      let updated = 0;
      for (let i = 0; i < studentIds.length; i += 100) {
        const chunk = studentIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from('payment_history')
          .update({ status_code: 3, status_name: 'חזר' })
          .in('student_id', chunk)
          .eq('status_code', 2)
          .gte('payment_date', `${month}-01`)
          .lt('payment_date', nextStart)
          .is('nedarim_transaction_id', null) // bank rows only
          .select('id');
        if (error) throw error;
        updated += data?.length || 0;
      }
      setMarkMsg(`✓ סומנו ${updated} רשומות תשלום כ"חזר". טפל בהן בלשונית "חזרות".`);
    } catch (e: any) {
      setMarkMsg('שגיאה בסימון: ' + (e?.message || e));
    } finally { setMarking(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              📥 בחר קובץ חזרות (xlsx)
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
            </label>
            {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
            {returns.length > 0 && (
              <>
                <div className="w-36"><Select label="חודש הגבייה" value={month} onChange={(e) => setMonth(e.target.value)} options={monthOptions()} /></div>
                <Button variant="danger" onClick={markBounced} disabled={marking}>{marking ? 'מסמן…' : '↩ סמן כחזרות'}</Button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            הקובץ מתאים לפי <b>מספר חשבון בנק</b> למשפחה ולתלמידים שלה (המזהה ששלחנו הוא רק אינדקס ולכן לא משמש להתאמה).
            השמות בקובץ הפוכים — מוצגים כאן מהופכים לקריאה. "סמן כחזרות" הופך את רשומות התשלום של החודש לסטטוס "חזר".
          </p>
          {loading && <div className="text-slate-400 text-sm">טוען ומתאים…</div>}
          {markMsg && <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{markMsg}</div>}
        </CardContent>
      </Card>

      {returns.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="חזרות בקובץ" value={String(returns.length)} />
            <Stat label="סכום כולל" value={ils(total)} />
            <Stat label="זוהו" value={String(returns.length - unmatched)} />
            <Stat label="לא זוהו" value={String(unmatched)} danger={unmatched > 0} />
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <th className="text-start px-3 py-2 font-semibold">חשבון</th>
                    <th className="text-start px-3 py-2 font-semibold">סכום</th>
                    <th className="text-start px-3 py-2 font-semibold">סיבה</th>
                    <th className="text-start px-3 py-2 font-semibold">שם בקובץ</th>
                    <th className="text-start px-3 py-2 font-semibold">תלמיד/משפחה במערכת</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-amber-50/40">
                      <td className="px-3 py-2 text-slate-600" dir="ltr">{r.bank}-{r.branch}-{r.account}</td>
                      <td className="px-3 py-2 font-semibold text-red-700">{ils(r.amount)}</td>
                      <td className="px-3 py-2 text-slate-600">{r.reason}</td>
                      <td className="px-3 py-2 text-slate-500">{r.nameInFile}</td>
                      <td className="px-3 py-2">
                        {r.familyId ? (
                          <span>
                            {r.students.length > 0
                              ? r.students.map((s, j) => (
                                  <span key={s.id}>{j > 0 ? ', ' : ''}<Link href={`/students/${s.id}`} className="text-blue-700 hover:underline">{s.name}</Link></span>
                                ))
                              : <span className="text-slate-500">{r.familyName} (אין תלמידים)</span>}
                          </span>
                        ) : (
                          <span className="text-red-600">❌ לא זוהה — חשבון לא נמצא במערכת</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border elevation-1 px-4 py-3 ${danger ? 'border-red-200' : 'border-slate-200/70'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${danger ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
