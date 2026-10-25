'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { PageGuard } from '@/components/ui/PageGuard';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import { useAuth } from '@/hooks/useAuth';
import { ISRAELI_BANKS, bankCodeFromText, bankColumns, getBankByCode } from '@/lib/israeli-banks';
import { validateBankAccountFull } from '@/lib/israeli-validators';

// families keeps the bank in TWO columns: bank_number (what מס"ב/finances use) and
// bank_name (what the old student card showed/edited). They drifted apart — this page
// finds every family whose bank details are missing, out of sync or invalid, and fixes them.

type IssueKey = 'missing' | 'no_number' | 'no_name' | 'mismatch' | 'unknown' | 'invalid' | 'bad_check';

const ISSUES: { key: IssueKey; label: string; hint: string; tone: 'red' | 'amber' | 'blue' }[] = [
  { key: 'missing', label: 'חסר בנק/סניף/חשבון', hint: 'משלם בהו״ק בנקאי אבל חסרים פרטים — לא ייכלל בקובץ מס״ב', tone: 'red' },
  { key: 'no_number', label: 'חסר מספר בנק', hint: 'יש שם בנק אבל אין מספר — מס״ב מדלג עליו. מתוקן בסנכרון', tone: 'red' },
  { key: 'invalid', label: 'חשבון/סניף לא תקין', hint: 'מבנה לא תקין (לא ספרות / אורך שגוי)', tone: 'red' },
  { key: 'mismatch', label: 'שם ≠ מספר', hint: 'שם הבנק בכרטיס לא תואם את מספר הבנק שמשמש בגבייה', tone: 'amber' },
  { key: 'unknown', label: 'שם בנק לא מזוהה', hint: 'טקסט בשדה הבנק שלא זוהה כבנק מוכר', tone: 'amber' },
  { key: 'bad_check', label: 'ספרת ביקורת', hint: 'לא עבר ספרת ביקורת — כדאי לוודא מול ההורה (ייתכן שתקין)', tone: 'amber' },
  { key: 'no_name', label: 'חסר שם בנק בכרטיס', hint: 'יש מספר בנק אבל כרטיס התלמיד הציג ריק. מתוקן בסנכרון', tone: 'blue' },
];
const ISSUE_BY_KEY = Object.fromEntries(ISSUES.map((i) => [i.key, i])) as Record<IssueKey, (typeof ISSUES)[number]>;
const TONE: Record<string, string> = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
};

interface FamilyRaw {
  id: string; family_name: string | null; father_name: string | null;
  bank_number: number | string | null; bank_name: string | null; bank_branch: string | null; bank_account: string | null;
}
interface StudentLite { id: string; first_name: string | null; last_name: string | null; family_id: string | null; status: string; shiur: string | null }
interface TuitionLite { student_id: string; payment_method: string | null; active: boolean | null; monthly_amount: number | null }
interface Row extends FamilyRaw {
  code: number | null; nameCode: number | null; hk: boolean; hkAmount: number;
  students: { id: string; name: string; status: string; hk: boolean }[];
  issues: IssueKey[];
}

const s = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
const ils = (n: number) => '₪' + n.toLocaleString('he-IL', { maximumFractionDigits: 0 });

function analyze(f: FamilyRaw, hk: boolean): { code: number | null; nameCode: number | null; issues: IssueKey[] } {
  const n = Number(f.bank_number);
  const code = s(f.bank_number) && Number.isFinite(n) && n > 0 ? n : null;
  const nameCode = bankCodeFromText(f.bank_name);
  const issues: IssueKey[] = [];
  const eff = code ?? nameCode;
  if (hk && (!eff || !s(f.bank_branch) || !s(f.bank_account))) issues.push('missing');
  if (!code && nameCode) issues.push('no_number');
  if (code && !s(f.bank_name)) issues.push('no_name');
  if (code && nameCode && code !== nameCode) issues.push('mismatch');
  if (!code && s(f.bank_name) && !nameCode) issues.push('unknown');
  if (s(f.bank_branch) && s(f.bank_account)) {
    const r = validateBankAccountFull(eff, f.bank_branch, f.bank_account);
    if (r === 'invalid') issues.push('invalid');
    else if (r === 'bad-check') issues.push('bad_check');
  }
  return { code, nameCode, issues };
}

export default function BankCheckPage() {
  const { permissions } = useAuth();
  const canWrite = permissions.canWrite;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyHk, setOnlyHk] = useState(true);
  const [issueFilter, setIssueFilter] = useState<IssueKey | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ bank_number: '', bank_branch: '', bank_account: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [fams, studs, tuit] = await Promise.all([
      fetchAll<FamilyRaw>('families', 'id, family_name, father_name, bank_number, bank_name, bank_branch, bank_account'),
      fetchAll<StudentLite>('students', 'id, first_name, last_name, family_id, status, shiur'),
      fetchAll<TuitionLite>('student_tuition', 'student_id, payment_method, active, monthly_amount'),
    ]);
    const tuitionBy: Record<string, TuitionLite> = {};
    for (const t of tuit) tuitionBy[t.student_id] = t;
    const studsBy: Record<string, Row['students']> = {};
    const hkAmount: Record<string, number> = {};
    for (const st of studs) {
      if (!st.family_id) continue;
      const t = tuitionBy[st.id];
      const isHk = !!t && t.active !== false && t.payment_method === 'bank_ho';
      (studsBy[st.family_id] ||= []).push({ id: st.id, name: `${s(st.first_name)} ${s(st.last_name)}`.trim(), status: st.status, hk: isHk });
      if (isHk) hkAmount[st.family_id] = (hkAmount[st.family_id] || 0) + (Number(t!.monthly_amount) || 0);
    }
    const list: Row[] = [];
    for (const f of fams) {
      const students = (studsBy[f.id] || []).sort((a, b) => Number(b.hk) - Number(a.hk));
      const hk = students.some((x) => x.hk);
      const a = analyze(f, hk);
      list.push({ ...f, ...a, hk, hkAmount: hkAmount[f.id] || 0, students });
    }
    // most urgent first: HK families, then red issues, then by name
    const rank = (r: Row) => (r.hk ? 0 : 10) + (r.issues.some((i) => ISSUE_BY_KEY[i].tone === 'red') ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b) || s(a.family_name).localeCompare(s(b.family_name), 'he'));
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const scoped = useMemo(
    () => rows.filter((r) => r.issues.length > 0 && (!onlyHk || r.hk)),
    [rows, onlyHk]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    for (const r of scoped) for (const i of r.issues) c[i] = (c[i] || 0) + 1;
    return c;
  }, [scoped]);
  const filtered = useMemo(() => {
    const q = search.trim();
    return scoped.filter((r) => {
      if (issueFilter !== 'all' && !r.issues.includes(issueFilter)) return false;
      if (!q) return true;
      const pool = [r.family_name, r.father_name, r.bank_account, ...r.students.map((x) => x.name)].map(s).join(' ');
      return pool.includes(q);
    });
  }, [scoped, issueFilter, search]);

  // auto-fixable across ALL families: name↔number where one side is missing
  const syncable = useMemo(() => rows.filter((r) => r.issues.includes('no_number') || r.issues.includes('no_name')), [rows]);

  const patchRow = (id: string, patch: Partial<FamilyRaw>) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const f = { ...r, ...patch };
      return { ...f, ...analyze(f, r.hk) };
    }));
  };

  const saveFamily = async (id: string, patch: Partial<FamilyRaw>): Promise<boolean> => {
    const { error } = await supabase.from('families').update(patch).eq('id', id);
    if (error) { alert('שגיאה בשמירה: ' + error.message); return false; }
    patchRow(id, patch);
    return true;
  };

  const runSync = async () => {
    const nNum = syncable.filter((r) => r.issues.includes('no_number')).length;
    const nName = syncable.length - nNum;
    if (!confirm(`סנכרון שם ↔ מספר בנק ל-${syncable.length} משפחות:\n• ${nNum} — יושלם מספר הבנק לפי השם\n• ${nName} — יושלם שם הבנק לפי המספר\n\nסניף וחשבון לא משתנים. להמשיך?`)) return;
    setBusy('sync');
    let ok = 0, fail = 0;
    for (let i = 0; i < syncable.length; i += 10) {
      await Promise.all(syncable.slice(i, i + 10).map(async (r) => {
        const code = r.code ?? r.nameCode;
        const cols = bankColumns(code);
        // keep a non-standard name the user typed if the code isn't in our list
        const patch = { bank_number: cols.bank_number, bank_name: cols.bank_name || r.bank_name };
        const { error } = await supabase.from('families').update(patch).eq('id', r.id);
        if (error) fail++; else { ok++; patchRow(r.id, patch); }
      }));
      setSyncMsg(`מסנכרן… ${Math.min(i + 10, syncable.length)}/${syncable.length}`);
    }
    setBusy(null);
    setSyncMsg(`✓ סונכרנו ${ok} משפחות${fail ? ` · ${fail} נכשלו` : ''}`);
  };

  const startEdit = (r: Row) => {
    setEditId(r.id);
    setDraft({ bank_number: r.code ?? r.nameCode ? String(r.code ?? r.nameCode) : '', bank_branch: s(r.bank_branch), bank_account: s(r.bank_account) });
  };
  const saveEdit = async (r: Row) => {
    setBusy(r.id);
    const ok = await saveFamily(r.id, {
      ...bankColumns(draft.bank_number),
      bank_branch: draft.bank_branch.trim() || null,
      bank_account: draft.bank_account.trim() || null,
    });
    setBusy(null);
    if (ok) setEditId(null);
  };
  const chooseCode = async (r: Row, code: number) => {
    setBusy(r.id);
    await saveFamily(r.id, bankColumns(code));
    setBusy(null);
  };

  const draftCheck = draft.bank_branch && draft.bank_account
    ? validateBankAccountFull(draft.bank_number || null, draft.bank_branch, draft.bank_account) : null;

  return (
    <PageGuard requires="write" message="עמוד זה דורש הרשאת כתיבה (admin / secretary).">
    <>
      <Header title="בדיקת פרטי בנק" subtitle="משפחות שפרטי הבנק שלהן חסרים, לא מסונכרנים או לא תקינים" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap items-center">
          <Link href="/finances" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">← כספים</Link>
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>🔄 רענן</Button>
          {canWrite && syncable.length > 0 && (
            <Button size="sm" onClick={runSync} disabled={!!busy}>
              {busy === 'sync' ? '⏳ מסנכרן…' : `🔁 סנכרן שם ↔ מספר בנק (${syncable.length})`}
            </Button>
          )}
          {syncMsg && <span className="text-sm text-emerald-700">{syncMsg}</span>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOnlyHk(true)}
              className={`px-3 py-1.5 rounded-full text-sm border ${onlyHk ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`}>
              🏦 רק משלמי הו״ק בנקאי
            </button>
            <button type="button" onClick={() => setOnlyHk(false)}
              className={`px-3 py-1.5 rounded-full text-sm border ${!onlyHk ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`}>
              👪 כל המשפחות
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIssueFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-sm ring-1 ${issueFilter === 'all' ? 'ring-2 ring-blue-500 bg-blue-50 font-bold' : 'ring-slate-200 bg-white'}`}>
              הכל <b className="tabular-nums">{counts.all || 0}</b>
            </button>
            {ISSUES.map((i) => (
              <button key={i.key} type="button" title={i.hint} onClick={() => setIssueFilter(i.key)}
                className={`px-3 py-1.5 rounded-xl text-sm ring-1 ${TONE[i.tone]} ${issueFilter === i.key ? 'ring-2 !ring-blue-500 font-bold' : ''} ${!counts[i.key] ? 'opacity-40' : ''}`}>
                {i.label} <b className="tabular-nums">{counts[i.key] || 0}</b>
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש משפחה / תלמיד / חשבון…"
            className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-xl text-sm" />
          {issueFilter !== 'all' && <p className="text-xs text-slate-500">ℹ️ {ISSUE_BY_KEY[issueFilter].hint}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-slate-400">טוען…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-5xl mb-2">✓</div>
              <div className="text-slate-500 font-medium">אין משפחות לטיפול בסינון הזה</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="px-4 py-2 text-sm text-slate-600 border-b border-slate-100"><b>{filtered.length}</b> משפחות</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <th className="text-start px-3 py-2">משפחה</th>
                    <th className="text-start px-3 py-2">תלמידים</th>
                    <th className="text-start px-3 py-2">בנק (מס״ב)</th>
                    <th className="text-start px-3 py-2">שם בנק (כרטיס)</th>
                    <th className="text-start px-3 py-2">סניף</th>
                    <th className="text-start px-3 py-2">חשבון</th>
                    <th className="text-start px-3 py-2">בעיות</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    editId === r.id ? (
                      <tr key={r.id} className="border-b border-slate-100 bg-blue-50/40">
                        <td className="px-3 py-2 font-medium">{r.family_name}{r.father_name ? <div className="text-xs text-slate-500">{r.father_name}</div> : null}</td>
                        <td className="px-3 py-2 text-xs">{r.students.slice(0, 3).map((x) => x.name).join(', ')}</td>
                        <td className="px-3 py-2" colSpan={2}>
                          <select value={draft.bank_number} onChange={(e) => setDraft((d) => ({ ...d, bank_number: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm">
                            <option value="">-- בחר בנק --</option>
                            {draft.bank_number && !getBankByCode(draft.bank_number) && <option value={draft.bank_number}>{draft.bank_number}</option>}
                            {ISRAELI_BANKS.map((b) => <option key={b.code} value={String(b.code)}>{b.code} - {b.shortName}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input value={draft.bank_branch} onChange={(e) => setDraft((d) => ({ ...d, bank_branch: e.target.value }))} className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" dir="ltr" /></td>
                        <td className="px-3 py-2"><input value={draft.bank_account} onChange={(e) => setDraft((d) => ({ ...d, bank_account: e.target.value }))} className="w-32 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" dir="ltr" /></td>
                        <td className="px-3 py-2 text-xs">
                          {draftCheck === 'valid' && <span className="text-emerald-700">✓ תקין</span>}
                          {draftCheck === 'structural' && <span className="text-blue-700">○ מבנה תקין</span>}
                          {draftCheck === 'bad-check' && <span className="text-amber-700">⚠ ספרת ביקורת — לוודא</span>}
                          {draftCheck === 'invalid' && <span className="text-red-700">❌ מבנה לא תקין</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Button size="sm" onClick={() => saveEdit(r)} disabled={busy === r.id}>{busy === r.id ? '…' : 'שמור'}</Button>
                          <button type="button" onClick={() => setEditId(null)} className="text-xs text-slate-500 hover:underline ms-2">ביטול</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-blue-50/40 align-top">
                        <td className="px-3 py-2">
                          <Link href={`/families/${r.id}`} className="text-blue-700 hover:underline font-medium">{r.family_name || '—'}</Link>
                          {r.father_name && <div className="text-xs text-slate-500">{r.father_name}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.students.slice(0, 4).map((x) => (
                            <div key={x.id}>
                              <Link href={`/students/${x.id}`} className={`hover:underline ${x.hk ? 'text-blue-700 font-medium' : 'text-slate-500'}`}>{x.name}</Link>
                              {x.hk && <span className="text-[10px] text-blue-600 ms-1">🏦</span>}
                            </div>
                          ))}
                          {r.students.length > 4 && <div className="text-slate-400">+{r.students.length - 4}</div>}
                          {r.hkAmount > 0 && <div className="text-slate-500 mt-0.5">הו״ק {ils(r.hkAmount)}</div>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.code ? `${r.code}${getBankByCode(r.code) ? ' - ' + getBankByCode(r.code)!.shortName : ''}` : <span className="text-red-600">חסר</span>}
                        </td>
                        <td className="px-3 py-2">{s(r.bank_name) || <span className="text-slate-400">ריק</span>}</td>
                        <td className="px-3 py-2 tabular-nums" dir="ltr">{s(r.bank_branch) || <span className="text-red-600">—</span>}</td>
                        <td className="px-3 py-2 tabular-nums" dir="ltr">{s(r.bank_account) || <span className="text-red-600">—</span>}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.issues.map((i) => (
                              <span key={i} title={ISSUE_BY_KEY[i].hint} className={`px-2 py-0.5 rounded-full text-[11px] ring-1 ${TONE[ISSUE_BY_KEY[i].tone]}`}>{ISSUE_BY_KEY[i].label}</span>
                            ))}
                          </div>
                          {canWrite && r.issues.includes('mismatch') && r.code && r.nameCode && (
                            <div className="flex flex-wrap gap-1 mt-1.5 text-[11px]">
                              <span className="text-slate-500">מה נכון?</span>
                              {[r.code, r.nameCode].map((c) => (
                                <button key={c} type="button" disabled={busy === r.id} onClick={() => chooseCode(r, c)}
                                  className="px-2 py-0.5 rounded-md bg-white ring-1 ring-slate-300 hover:bg-slate-50">
                                  {c} - {getBankByCode(c)?.shortName || ''}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-end whitespace-nowrap">
                          {canWrite && <button type="button" onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline">✏️ תקן</button>}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 text-center">
          💡 מס״ב והגבייה משתמשים ב<b>מספר הבנק</b>. מעכשיו כל שמירה (כרטיס תלמיד, הרצה חודשית, אקסל, מסך זה) כותבת מספר ושם יחד, כך שהם לא יתפצלו שוב.
        </p>
      </div>
    </>
    </PageGuard>
  );
}
