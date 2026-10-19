'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { MasavFileMarkPaid } from '@/components/finances/MasavFileMarkPaid';
import { MasavRunsList } from '@/components/finances/MasavRunsList';
import { recordMasavRun } from '@/lib/masav-mark';
import { PageGuard } from '@/components/ui/PageGuard';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { fetchAll } from '@/lib/supabase-paginate';
import { buildMasavFile, buildMasavCsv, downloadFile, downloadMasavFile, MasavCharge } from '@/lib/masav';

// מס"ב institution identifiers (given by מס"ב for this מוסד).
const MASAV_MOSAD_NUMBER = '39050646'; // מוסד/נושא — 8 ספרות
const MASAV_SENDER_NUMBER = '39050';   // מוסד שולח — 5 ספרות
const MASAV_MOSAD_NAME = 'ישיבת מיר מודיעין עילית';
import { supabase } from '@/lib/supabase';

interface TuitionRow {
  student_id: string;
  monthly_amount: number;
  bank_day: number | null;
}

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string | null;
  status: string;
}

interface Family {
  id: string;
  family_name: string;
  father_name: string | null;
  father_id_number: string | null;
  bank_number: number | null;
  bank_branch: string | null;
  bank_account: string | null;
}

interface FamilyCharge {
  family: Family;
  students: { id: string; name: string; amount: number; status: string }[];
  totalAmount: number;
  valid: boolean;
  issues: string[];
}

export default function MasavExportPage() {
  const [charges, setCharges] = useState<FamilyCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState<number>(20);
  const [chargeDate, setChargeDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(20);
    if (d < new Date()) d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [sendCounter, setSendCounter] = useState(1);
  const [fileMarkOpen, setFileMarkOpen] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  const [hasOpenRun, setHasOpenRun] = useState(false);

  // Default the send counter to the last recorded run's counter + 1.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('masav_runs').select('send_counter')
        .eq('kind', 'tuition').order('send_counter', { ascending: false }).limit(1);
      if (data && data[0]) setSendCounter((Number(data[0].send_counter) || 0) + 1);
    })();
  }, [runsKey]);
  const [adjustedCount, setAdjustedCount] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const chargeMonth = chargeDate.slice(0, 7); // 'YYYY-MM' — the collection run this file is for
      const [tuitions, students, families, adjustments] = await Promise.all([
        fetchAll<TuitionRow & { tuition_active_until?: string | null }>(
          'student_tuition',
          'student_id, monthly_amount, bank_day, tuition_active_until',
          (q) => q.eq('payment_method', 'bank_ho').eq('active', true)
        ),
        // Inclusion is driven by student_tuition.active (below), NOT by student status —
        // so an inactive student who keeps paying (active bank הו״ק) is charged too.
        // Load all students; the tuition list decides who is actually charged.
        fetchAll<StudentLite>('students', 'id, first_name, last_name, family_id, status'),
        fetchAll<Family>('families', '*'),
        fetchAll<{ student_id: string; kind: string; amount: number }>(
          'charge_adjustments',
          'student_id, kind, amount',
          (q) => q.eq('month', chargeMonth).eq('status', 'active')
        ),
      ]);

      const studentMap: Record<string, StudentLite> = {};
      for (const s of students) studentMap[s.id] = s;

      const familyMap: Record<string, Family> = {};
      for (const f of families) familyMap[f.id] = f;

      // This month's per-student adjustments (REQ 7/8/9): override replaces the base,
      // additions are summed on top. Applied to the charged amount.
      const overrideByStudent: Record<string, number> = {};
      const additionsByStudent: Record<string, number> = {};
      for (const a of adjustments) {
        if (a.kind === 'override') overrideByStudent[a.student_id] = Number(a.amount) || 0;
        else additionsByStudent[a.student_id] = (additionsByStudent[a.student_id] || 0) + (Number(a.amount) || 0);
      }

      // Group tuitions by family_id
      let adjApplied = 0;
      const byFamily: Record<string, FamilyCharge> = {};
      for (const t of tuitions) {
        // Honor scheduled stop date: if charge_date > tuition_active_until → skip
        if (t.tuition_active_until && chargeDate > t.tuition_active_until) continue;
        const student = studentMap[t.student_id];
        if (!student?.family_id) continue;
        const fam = familyMap[student.family_id];
        if (!fam) continue;

        const base = Number(t.monthly_amount) || 0;
        const ov = overrideByStudent[t.student_id];
        const add = additionsByStudent[t.student_id] || 0;
        const amount = (ov != null ? ov : base) + add;
        if (ov != null || add !== 0) adjApplied++;

        if (!byFamily[fam.id]) {
          byFamily[fam.id] = {
            family: fam,
            students: [],
            totalAmount: 0,
            valid: false,
            issues: [],
          };
        }
        byFamily[fam.id].students.push({
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          amount,
          status: student.status,
        });
        byFamily[fam.id].totalAmount += amount;
      }
      setAdjustedCount(adjApplied);

      // Validate bank details
      for (const fc of Object.values(byFamily)) {
        const issues: string[] = [];
        if (!fc.family.bank_number) issues.push('חסר בנק');
        if (!fc.family.bank_branch) issues.push('חסר סניף');
        if (!fc.family.bank_account) issues.push('חסר חשבון');
        // Note: missing father_id is a WARNING, not an error - row is still included
        // if (!fc.family.father_id_number) issues.push('חסרה ת.ז אב');
        if (fc.totalAmount <= 0) issues.push('סכום 0');
        fc.issues = issues;
        fc.valid = issues.length === 0;
      }

      setCharges(
        Object.values(byFamily).sort((a, b) =>
          (a.family.family_name || '').localeCompare(b.family.family_name || '', 'he')
        )
      );
      setLoading(false);
    })();
  }, [chargeDate]);

  const filtered = useMemo(() => charges, [charges]);

  const validCharges = filtered.filter((c) => c.valid);
  const invalidCharges = filtered.filter((c) => !c.valid);
  const totalAmount = validCharges.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalStudents = validCharges.reduce((sum, c) => sum + c.students.length, 0);
  const inactiveIncluded = validCharges.reduce(
    (sum, c) => sum + c.students.filter((s) => s.status !== 'active').length,
    0
  );

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  const handleDownloadMasav = async () => {
    if (hasOpenRun) { alert('יש קובץ פתוח — סמן "שודר וזוכה" או "ביטול" לפני הפקת קובץ חדש.'); return; }
    if (validCharges.length === 0) {
      alert('אין גביות תקינות לייצוא');
      return;
    }
    const masavCharges: MasavCharge[] = validCharges.map((c, idx) => ({
      reference: String(idx + 1),
      bankNumber: Number(c.family.bank_number) || 0,
      branch: Number(c.family.bank_branch) || 0,
      accountNumber: String(c.family.bank_account || ''),
      payerIdNumber: String(c.family.father_id_number || ''),
      payerName: `${c.family.family_name} ${c.family.father_name || ''}`.trim(),
      amountAgorot: Math.round(c.totalAmount * 100),
    }));

    const content = buildMasavFile(
      {
        mosadNumber: MASAV_MOSAD_NUMBER,
        senderNumber: MASAV_SENDER_NUMBER,
        mosadName: MASAV_MOSAD_NAME,
        chargeDate,
        sendCounter,
      },
      masavCharges
    );
    const filename = `masav_${chargeDate.replace(/-/g, '')}_${sendCounter}.txt`;
    downloadMasavFile(filename, content);

    // Remember what this file contained (per student) so it can be marked paid later
    // exactly as produced — not the file itself.
    const res = await recordMasavRun(chargeDate, sendCounter, validCharges.map((c) => ({
      family_id: c.family.id,
      family_name: `${c.family.family_name} ${c.family.father_name || ''}`.trim(),
      bank: String(c.family.bank_number ?? ''),
      branch: String(c.family.bank_branch ?? ''),
      account: String(c.family.bank_account ?? ''),
      students: c.students.map((s) => ({ id: s.id, name: s.name, amount: s.amount })),
    })));
    if (!res.ok) alert('⚠️ הקובץ הורד, אך רישום השידור במערכת נכשל: ' + res.error + '\nאפשר לסמן כנפרע בהמשך דרך "סמן קובץ שיוצא בעבר".');
    setRunsKey((k) => k + 1);
  };

  const handleDownloadCsv = () => {
    if (validCharges.length === 0) {
      alert('אין גביות תקינות לייצוא');
      return;
    }
    const masavCharges: MasavCharge[] = validCharges.map((c, idx) => ({
      reference: String(idx + 1),
      bankNumber: Number(c.family.bank_number) || 0,
      branch: Number(c.family.bank_branch) || 0,
      accountNumber: String(c.family.bank_account || ''),
      payerIdNumber: String(c.family.father_id_number || ''),
      payerName: `${c.family.family_name} ${c.family.father_name || ''}`.trim(),
      amountAgorot: Math.round(c.totalAmount * 100),
    }));
    const csv = buildMasavCsv(masavCharges);
    const filename = `masav_preview_${chargeDate.replace(/-/g, '')}.csv`;
    downloadFile(filename, csv, 'text/csv');
  };

  return (
    <PageGuard requires="generateMasav" message="הפקת קובץ מס״ב דורשת הרשאת admin או secretary.">

    <>
      <Header title="ייצוא קובץ מס״ב" subtitle="הוראות קבע בנקאיות לבנק" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← כספים
          </Link>
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">הגדרות ייצוא</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">תאריך חיוב</label>
                <input
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">מספר מונה שידור</label>
                <input
                  type="number"
                  min={1}
                  value={sendCounter}
                  onChange={(e) => setSendCounter(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">סינון לפי יום בחודש</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayFilter}
                  onChange={(e) => setDayFilter(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {adjustedCount > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl px-4 py-2.5 text-sm">
            📅 הסכומים כוללים <b>{adjustedCount}</b> שינויים חודשיים (תוספות/override) לחודש {chargeDate.slice(0, 7)}.
            לניהולם: <Link href="/finances/monthly" className="underline font-medium">הרצת גבייה חודשית</Link>
          </div>
        )}

        {inactiveIncluded > 0 && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2.5 text-sm">
            ⚠️ הקובץ כולל <b>{inactiveIncluded}</b> תלמידים <b>לא-פעילים</b> שההו״ק שלהם עדיין פעילה (מסומנים "לא-פעיל" ברשימה).
            אם מישהו מהם לא אמור להיגבות — הפסק אותו ב<Link href="/finances/inactive-payers" className="underline font-medium">תלמידים לא-פעילים עם חיוב</Link> לפני ההורדה.
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">משפחות לחיוב</p>
            <p className="text-3xl font-bold text-green-700">{validCharges.length}</p>
            <p className="text-xs text-gray-500">{totalStudents} תלמידים</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">סכום כולל לחיוב</p>
            <p className="text-3xl font-bold text-blue-700">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">חסרה ת.ז אב</p>
            <p className="text-3xl font-bold text-amber-700">
              {validCharges.filter((c) => !c.family.father_id_number).length}
            </p>
            <p className="text-xs text-gray-500">ייכללו בקובץ (להשלים)</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">חסר בנק - לא יוצאות</p>
            <p className="text-3xl font-bold text-red-700">{invalidCharges.length}</p>
            <p className="text-xs text-gray-500">לא ייכללו בקובץ</p>
          </div>
        </div>

        {/* The OPEN produced file (if any): mark "שודר וזוכה" or cancel to produce a new one. */}
        <MasavRunsList mode="open" refreshKey={runsKey} onOpenChange={setHasOpenRun} onChanged={() => setRunsKey((k) => k + 1)} />

        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleDownloadMasav} disabled={validCharges.length === 0 || hasOpenRun}>
            💾 הפק קובץ מס״ב (.txt)
          </Button>
          <Button variant="secondary" onClick={handleDownloadCsv} disabled={validCharges.length === 0}>
            📄 הורד תצוגה מקדימה (CSV)
          </Button>
          <Button variant="secondary" onClick={() => setFileMarkOpen(true)}>
            📂 סמן קובץ ישן (txt) כנפרע
          </Button>
        </div>
        {hasOpenRun && (
          <div className="text-xs text-amber-700">🔒 יש קובץ פתוח למעלה — סמן אותו &quot;שודר וזוכה&quot; או &quot;ביטול&quot; לפני הפקת קובץ חדש.</div>
        )}
        {fileMarkOpen && <MasavFileMarkPaid onClose={() => setFileMarkOpen(false)} />}

        <MasavRunsList mode="history" refreshKey={runsKey} />

        {/* Invalid list */}
        {invalidCharges.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-bold text-amber-800">⚠️ משפחות עם בעיות ({invalidCharges.length})</h3>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="px-3 py-2 text-start">משפחה</th>
                      <th className="px-3 py-2 text-start">תלמידים</th>
                      <th className="px-3 py-2 text-start">סכום</th>
                      <th className="px-3 py-2 text-start">בעיה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidCharges.map((c) => (
                      <tr key={c.family.id} className="border-t border-gray-200">
                        <td className="px-3 py-2">
                          <Link href={`/families/${c.family.id}`} className="text-blue-600 hover:underline">
                            {c.family.family_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.students.map((s) => s.name).join(', ')}
                        </td>
                        <td className="px-3 py-2">{formatCurrency(c.totalAmount)}</td>
                        <td className="px-3 py-2 text-xs text-red-700">{c.issues.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Valid list */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">משפחות לחיוב ({validCharges.length})</h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : validCharges.length === 0 ? (
              <div className="text-center py-8 text-gray-500">אין משפחות עם הוק בנקאי תקינה</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">משפחה</th>
                      <th className="px-3 py-2 text-start">בנק</th>
                      <th className="px-3 py-2 text-start">תלמידים</th>
                      <th className="px-3 py-2 text-start">סכום חודשי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validCharges.slice(0, 200).map((c) => (
                      <tr key={c.family.id} className="border-t border-gray-200">
                        <td className="px-3 py-2">
                          <Link href={`/families/${c.family.id}`} className="text-blue-600 hover:underline">
                            {c.family.family_name}
                          </Link>
                          <div className="text-xs text-gray-500">{c.family.father_name}</div>
                          {!c.family.father_id_number && (
                            <div className="text-xs text-amber-700 font-medium">⚠ חסרה ת.ז אב</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.family.bank_number}-{c.family.bank_branch}-{c.family.bank_account}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.students.map((s) => (
                            <div key={s.id}>
                              {s.name} · {formatCurrency(s.amount)}
                              {s.status !== 'active' && (
                                <span className="ms-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">לא-פעיל</span>
                              )}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 font-bold text-green-700">
                          {formatCurrency(c.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validCharges.length > 200 && (
                  <p className="text-center text-xs text-gray-500 mt-3">
                    מוצגות 200 ראשונות מתוך {validCharges.length}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
    </PageGuard>
  );
}
