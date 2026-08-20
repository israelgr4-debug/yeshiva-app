'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
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
  const [downloaded, setDownloaded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markResult, setMarkResult] = useState<{ updated: number; inserted: number; skipped: number; errors: string[] } | null>(null);
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

  const handleDownloadMasav = () => {
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
    setDownloaded(true);
    setMarkResult(null);
  };

  /**
   * After the bank has charged the MASAV file, mark every student in this run
   * as paid in payment_history.
   * Logic per student:
   *   - find an existing record for that student in the SAME month as chargeDate
   *   - if found with status_code=1 (לחיוב/צפי) → UPDATE to status=2 (נפרע), set
   *     date=chargeDate, amount=that student's amount, group_number=sendCounter
   *   - if found with status_code=2 already and same amount → SKIP
   *   - if found with status_code=2 and DIFFERENT amount → error (manual review)
   *   - if not found → INSERT new with status=2, group_number=sendCounter
   */
  const handleMarkAsPaid = async () => {
    if (validCharges.length === 0) return;
    const totalToMark = validCharges.reduce((sum, c) => sum + c.students.length, 0);
    if (!confirm(
      `לסמן ${totalToMark} תלמידים (${validCharges.length} משפחות) כנפרעו לתאריך ${chargeDate}?\n` +
      `מספר שידור: ${sendCounter}\n` +
      `סה״כ ₪${formatCurrency(totalAmount).replace('₪', '')}.\n\n` +
      `*** לעשות זאת רק אחרי שהבנק חייב בפועל ***`
    )) return;

    setMarking(true);
    setMarkResult(null);
    let updated = 0, inserted = 0, skipped = 0;
    const errors: string[] = [];

    try {
      const monthStart = chargeDate.slice(0, 7) + '-01';
      const monthEnd   = chargeDate.slice(0, 7) + '-31';

      // Build list of {student_id, amount, name} to process
      const items: { student_id: string; amount: number; name: string }[] = [];
      for (const fc of validCharges) {
        for (const s of fc.students) {
          items.push({ student_id: s.id, amount: s.amount, name: s.name });
        }
      }

      // Fetch existing payment_history for this month in chunks
      const existingByStudent: Record<string, any[]> = {};
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100);
        const { data, error } = await supabase
          .from('payment_history')
          .select('id, student_id, payment_date, amount_ils, status_code')
          .in('student_id', chunk.map((x) => x.student_id))
          .gte('payment_date', monthStart)
          .lte('payment_date', monthEnd);
        if (error) throw error;
        for (const r of data || []) {
          (existingByStudent[r.student_id] ||= []).push(r);
        }
      }

      for (const it of items) {
        const existing = existingByStudent[it.student_id] || [];
        try {
          if (existing.length === 0) {
            const { error } = await supabase.from('payment_history').insert({
              student_id: it.student_id,
              payment_date: chargeDate,
              amount_ils: it.amount,
              status_code: 2,
              status_name: 'נפרע',
              group_number: sendCounter,
            });
            if (error) throw error;
            inserted++;
          } else if (existing.length > 1) {
            errors.push(`${it.name}: יש ${existing.length} רשומות בחודש זה - דרוש בדיקה ידנית`);
            skipped++;
          } else {
            const rec = existing[0];
            const recAmt = Number(rec.amount_ils) || 0;
            if (rec.status_code === 2) {
              if (Math.abs(recAmt - it.amount) < 0.01) {
                skipped++; // already paid same amount
              } else {
                errors.push(`${it.name}: כבר נפרע בסכום ₪${recAmt} (קובץ מבקש ₪${it.amount})`);
                skipped++;
              }
            } else {
              const { error } = await supabase
                .from('payment_history')
                .update({
                  status_code: 2,
                  status_name: 'נפרע',
                  payment_date: chargeDate,
                  amount_ils: it.amount,
                  group_number: sendCounter,
                })
                .eq('id', rec.id);
              if (error) throw error;
              updated++;
            }
          }
        } catch (e: any) {
          errors.push(`${it.name}: ${e.message || e}`);
        }
      }

      setMarkResult({ updated, inserted, skipped, errors });
      setSendCounter((c) => c + 1);
    } catch (e: any) {
      alert('שגיאה: ' + (e.message || e));
    } finally {
      setMarking(false);
    }
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

        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleDownloadMasav} disabled={validCharges.length === 0}>
            💾 הורד קובץ מס״ב (.txt)
          </Button>
          <Button variant="secondary" onClick={handleDownloadCsv} disabled={validCharges.length === 0}>
            📄 הורד תצוגה מקדימה (CSV)
          </Button>
          <Button
            variant={downloaded ? 'primary' : 'secondary'}
            onClick={handleMarkAsPaid}
            disabled={validCharges.length === 0 || marking}
            className={downloaded ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {marking ? 'מעדכן...' : '✅ סמן את הקובץ כנפרע (אחרי שהבנק חייב)'}
          </Button>
        </div>

        {downloaded && !markResult && !marking && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            ✓ הקובץ הורד. העלה אותו לאתר הבנק. אחרי שהבנק חייב בפועל - לחץ על
            <b className="mx-1">&quot;סמן את הקובץ כנפרע&quot;</b>
            כדי לעדכן את כל התלמידים כנפרעו.
          </div>
        )}

        {markResult && (
          <Card>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-start">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-lg font-semibold text-emerald-700">✅ עודכן בהצלחה</p>
                  <ul className="text-sm mt-2 space-y-0.5">
                    <li>📝 עודכנו (היו ב״צפי״ → נפרעו): <b>{markResult.updated}</b></li>
                    <li>➕ נוספו חדשות (לא היה צפי): <b>{markResult.inserted}</b></li>
                    <li>⏭️ דולגו (כבר נפרעו / רב-משמעי): <b>{markResult.skipped}</b></li>
                    <li>❌ שגיאות: <b>{markResult.errors.length}</b></li>
                  </ul>
                  {markResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-amber-700">פירוט שגיאות</summary>
                      <ul className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto bg-amber-50 p-2 rounded">
                        {markResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
                <Link
                  href="/finances/collection/history"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  עבור להיסטוריית הגביות ←
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

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
