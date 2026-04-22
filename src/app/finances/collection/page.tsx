'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { supabase } from '@/lib/supabase';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { TuitionCharge, Family, Student } from '@/lib/types';
import { buildMasavFile, buildMasavCsv, downloadFile, MasavCharge } from '@/lib/masav';

interface ChargeRow {
  charge: TuitionCharge;
  family: Family | undefined;
  students: Student[];
}

export default function CollectionPage() {
  const { getSetting, setSetting } = useSystemSettings();

  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [chargeDate, setChargeDate] = useState(() => {
    // Default to 20th of current month
    const d = new Date();
    d.setDate(20);
    return d.toISOString().slice(0, 10);
  });

  const [mosadNumber, setMosadNumber] = useState('');
  const [mosadName, setMosadName] = useState('');
  const [sendCounter, setSendCounter] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Load institution settings
      const [mn, mname, cnt] = await Promise.all([
        getSetting<string>('mosad_number', '39050646'),
        getSetting<string>('mosad_name', 'ישיבת מיר מודיעין עילית'),
        getSetting<number>('mosad_send_counter', 1),
      ]);
      setMosadNumber(mn);
      setMosadName(mname);
      setSendCounter(cnt);

      // Load active standing-order charges (paginate to bypass 1000 cap)
      const allCharges: TuitionCharge[] = [];
      for (let page = 0; page < 20; page++) {
        const from = page * 1000;
        const to = from + 999;
        const { data } = await supabase
          .from('tuition_charges')
          .select('*')
          .eq('status', 'active')
          .eq('payment_method', 'standing_order')
          .range(from, to);
        if (!data || data.length === 0) break;
        allCharges.push(...(data as TuitionCharge[]));
        if (data.length < 1000) break;
      }

      // Load families (paginate)
      const allFamilies: Family[] = [];
      for (let page = 0; page < 20; page++) {
        const from = page * 1000;
        const to = from + 999;
        const { data } = await supabase.from('families').select('*').range(from, to);
        if (!data || data.length === 0) break;
        allFamilies.push(...(data as Family[]));
        if (data.length < 1000) break;
      }
      const familyMap = new Map(allFamilies.map((f) => [f.id, f]));

      // Load active students (for names)
      const allStudents: Student[] = [];
      for (let page = 0; page < 20; page++) {
        const from = page * 1000;
        const to = from + 999;
        const { data } = await supabase
          .from('students')
          .select('id,id_number,first_name,last_name,family_id')
          .range(from, to);
        if (!data || data.length === 0) break;
        allStudents.push(...(data as Student[]));
        if (data.length < 1000) break;
      }
      const studentsMap = new Map(allStudents.map((s) => [s.id, s]));

      // Build rows
      const composed: ChargeRow[] = allCharges.map((c) => ({
        charge: c,
        family: familyMap.get(c.family_id),
        students: (c.student_ids || []).map((id) => studentsMap.get(id)).filter(Boolean) as Student[],
      }));

      setRows(composed);

      // Initially select all that have valid bank details
      const initialSelected = new Set<string>();
      for (const r of composed) {
        if (hasValidBankDetails(r.family)) initialSelected.add(r.charge.id);
      }
      setSelected(initialSelected);

      setLoading(false);
    }
    load();
  }, [getSetting]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.family?.family_name,
        r.family?.father_name,
        r.family?.mother_name,
        r.family?.city,
        String(r.charge.total_amount_per_month),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery]);

  const totals = useMemo(() => {
    let count = 0;
    let amount = 0;
    let missingBank = 0;
    for (const r of filtered) {
      if (selected.has(r.charge.id)) {
        count += 1;
        amount += r.charge.total_amount_per_month || 0;
      }
      if (!hasValidBankDetails(r.family)) missingBank += 1;
    }
    return { count, amount, missingBank };
  }, [filtered, selected]);

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const valid = new Set<string>();
    for (const r of filtered) {
      if (hasValidBankDetails(r.family)) valid.add(r.charge.id);
    }
    setSelected(valid);
  };

  const handleClearAll = () => setSelected(new Set());

  const buildCharges = (): MasavCharge[] => {
    const result: MasavCharge[] = [];
    for (const r of rows) {
      if (!selected.has(r.charge.id)) continue;
      if (!r.family) continue;
      if (!hasValidBankDetails(r.family)) continue;
      const payerName = r.family.father_name || r.family.family_name || '';
      const ref = String(r.charge.id).replace(/-/g, '').slice(0, 9);
      result.push({
        reference: ref,
        bankNumber: r.family.bank_number || 0,
        branch: parseInt(r.family.bank_branch || '0') || 0,
        accountNumber: (r.family.bank_account || '').replace(/\D/g, ''),
        payerIdNumber: (r.family.father_id_number || '').replace(/\D/g, '').slice(-9),
        payerName,
        amountAgorot: Math.round((r.charge.total_amount_per_month || 0) * 100),
      });
    }
    return result;
  };

  const handleDownloadMasav = async () => {
    const charges = buildCharges();
    if (charges.length === 0) {
      alert('לא נבחרו חיובים חוקיים (יש לוודא שלמשפחות הנבחרות יש פרטי בנק)');
      return;
    }
    const content = buildMasavFile(
      { mosadNumber, mosadName, chargeDate, sendCounter },
      charges
    );
    const dateStr = chargeDate.replace(/-/g, '');
    downloadFile(`masav_${dateStr}.txt`, content);

    // Increment send counter
    await setSetting('mosad_send_counter', sendCounter + 1);
    setSendCounter((n) => n + 1);
  };

  const handleDownloadCsv = () => {
    const charges = buildCharges();
    if (charges.length === 0) {
      alert('לא נבחרו חיובים חוקיים');
      return;
    }
    const content = buildMasavCsv(charges);
    const dateStr = chargeDate.replace(/-/g, '');
    downloadFile(`masav_preview_${dateStr}.csv`, content, 'text/csv');
  };

  if (loading) {
    return (
      <>
        <Header title="גביה במס״ב" />
        <div className="p-8 text-center text-gray-600">טוען נתונים...</div>
      </>
    );
  }

  return (
    <>
      <Header title="גביה במס״ב" subtitle={`מוסד ${mosadNumber} - ${mosadName}`} />

      <div className="p-4 md:p-8 space-y-4">
        {/* Settings + summary */}
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חיוב</label>
                <input
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מספר מוסד</label>
                <input
                  type="text"
                  value={mosadNumber}
                  onChange={(e) => setMosadNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מונה שליחה</label>
                <input
                  type="number"
                  value={sendCounter}
                  onChange={(e) => setSendCounter(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex items-end">
                <SearchInput
                  placeholder="חיפוש..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary + actions */}
        <div className="sticky top-0 z-10 bg-white shadow-md rounded-lg p-4 border border-gray-200">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleSelectAll}>
                סמן הכל
              </Button>
              <Button size="sm" variant="secondary" onClick={handleClearAll}>
                הסר הכל
              </Button>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                <strong>{totals.count}</strong> נבחרו
              </span>
              <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">
                סה״כ: <strong>₪{totals.amount.toLocaleString('he-IL')}</strong>
              </span>
              {totals.missingBank > 0 && (
                <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full" title="חסרים פרטי בנק">
                  ⚠️ {totals.missingBank} ללא פרטי בנק
                </span>
              )}
            </div>

            <div className="mr-auto flex gap-2">
              <Button variant="secondary" onClick={handleDownloadCsv} disabled={totals.count === 0}>
                📊 CSV
              </Button>
              <Button onClick={handleDownloadMasav} disabled={totals.count === 0}>
                💾 צור קובץ מס״ב
              </Button>
            </div>
          </div>
        </div>

        {/* Charges list */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-start w-8"></th>
                  <th className="px-3 py-2 text-start">משפחה</th>
                  <th className="px-3 py-2 text-start">אב</th>
                  <th className="px-3 py-2 text-start">סכום</th>
                  <th className="px-3 py-2 text-start">בנק</th>
                  <th className="px-3 py-2 text-start">סניף</th>
                  <th className="px-3 py-2 text-start">חשבון</th>
                  <th className="px-3 py-2 text-start">תז אב</th>
                  <th className="px-3 py-2 text-start">תלמידים</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const valid = hasValidBankDetails(r.family);
                  const isSelected = selected.has(r.charge.id);
                  return (
                    <tr
                      key={r.charge.id}
                      className={`border-t border-gray-100 ${!valid ? 'bg-amber-50/40' : ''} ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggle(r.charge.id)}
                          disabled={!valid}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{r.family?.family_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{r.family?.father_name || '-'}</td>
                      <td className="px-3 py-2 font-semibold">₪{r.charge.total_amount_per_month.toLocaleString('he-IL')}</td>
                      <td className="px-3 py-2">{r.family?.bank_number || <span className="text-red-500">-</span>}</td>
                      <td className="px-3 py-2">{r.family?.bank_branch || <span className="text-red-500">-</span>}</td>
                      <td className="px-3 py-2 text-xs">{r.family?.bank_account || <span className="text-red-500">-</span>}</td>
                      <td className="px-3 py-2 text-xs">{r.family?.father_id_number || <span className="text-red-500">-</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {r.students.map((s) => `${s.first_name}`).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function hasValidBankDetails(f: Family | undefined): boolean {
  if (!f) return false;
  return Boolean(f.bank_number && f.bank_branch && f.bank_account);
}
