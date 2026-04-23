'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { fetchAll } from '@/lib/supabase-paginate';
import { buildMasavFile, buildMasavCsv, downloadFile, MasavCharge } from '@/lib/masav';

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
  students: { id: string; name: string; amount: number }[];
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [tuitions, students, families] = await Promise.all([
        fetchAll<TuitionRow>('student_tuition', 'student_id, monthly_amount, bank_day', (q) =>
          q.eq('payment_method', 'bank_ho').eq('active', true)
        ),
        fetchAll<StudentLite>('students', 'id, first_name, last_name, family_id', (q) =>
          q.eq('status', 'active')
        ),
        fetchAll<Family>('families', '*'),
      ]);

      const studentMap: Record<string, StudentLite> = {};
      for (const s of students) studentMap[s.id] = s;

      const familyMap: Record<string, Family> = {};
      for (const f of families) familyMap[f.id] = f;

      // Group tuitions by family_id
      const byFamily: Record<string, FamilyCharge> = {};
      for (const t of tuitions) {
        const student = studentMap[t.student_id];
        if (!student?.family_id) continue;
        const fam = familyMap[student.family_id];
        if (!fam) continue;

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
          amount: Number(t.monthly_amount) || 0,
        });
        byFamily[fam.id].totalAmount += Number(t.monthly_amount) || 0;
      }

      // Validate bank details
      for (const fc of Object.values(byFamily)) {
        const issues: string[] = [];
        if (!fc.family.bank_number) issues.push('חסר בנק');
        if (!fc.family.bank_branch) issues.push('חסר סניף');
        if (!fc.family.bank_account) issues.push('חסר חשבון');
        if (!fc.family.father_id_number) issues.push('חסרה ת.ז אב');
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
  }, []);

  const filtered = useMemo(() => charges, [charges]);

  const validCharges = filtered.filter((c) => c.valid);
  const invalidCharges = filtered.filter((c) => !c.valid);
  const totalAmount = validCharges.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalStudents = validCharges.reduce((sum, c) => sum + c.students.length, 0);

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  const handleDownloadMasav = () => {
    if (validCharges.length === 0) {
      alert('אין גביות תקינות לייצוא');
      return;
    }
    const mosadId = '7001496'; // TODO: from settings
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
        mosadNumber: mosadId,
        mosadName: 'ישיבת מיר מודיעין עילית',
        chargeDate,
        sendCounter,
      },
      masavCharges
    );
    const filename = `masav_${chargeDate.replace(/-/g, '')}_${sendCounter}.txt`;
    downloadFile(filename, content);
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

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <p className="text-xs text-gray-600 mb-1">משפחות עם בעיות</p>
            <p className="text-3xl font-bold text-amber-700">{invalidCharges.length}</p>
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
        </div>

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
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.family.bank_number}-{c.family.bank_branch}-{c.family.bank_account}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.students.map((s) => (
                            <div key={s.id}>
                              {s.name} · {formatCurrency(s.amount)}
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
  );
}
