'use client';

import { useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useRegistrations } from '@/hooks/useRegistrations';
import * as XLSX from 'xlsx';

interface Props {
  registrations: Registration[];
  onChanged: () => void;
}

type GroupBy = 'date' | 'yeshiva';

export function TestDayReportTab({ registrations, onChanged }: Props) {
  const { uploadPhoto, update, setStatus } = useRegistrations();
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const withTest = useMemo(
    () => registrations.filter((r) => r.test_date),
    [registrations]
  );

  const groups = useMemo(() => {
    const map = new Map<string, Registration[]>();
    for (const r of withTest) {
      const key =
        groupBy === 'date'
          ? r.test_date || ''
          : r.prev_yeshiva_name || '— ללא ישיבה —';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) =>
      groupBy === 'date' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0], 'he')
    );
  }, [withTest, groupBy]);

  const handlePhotoUpload = async (id: string, file: File) => {
    setUploadingId(id);
    try {
      await uploadPhoto(id, file);
      onChanged();
    } catch (e: any) {
      alert('שגיאה בהעלאת תמונה: ' + (e?.message || e));
    } finally {
      setUploadingId(null);
    }
  };

  const exportToExcel = () => {
    const rows: any[][] = [
      ['תאריך', 'שעה', 'ישיבה קטנה', 'שם משפחה', 'שם פרטי', 'ת״ז', 'אב', 'טלפון אב', 'מסכת', 'פרק', 'מדף', 'עד דף', 'סוגיא'],
    ];
    for (const r of withTest) {
      rows.push([
        r.test_date || '',
        r.test_time || '',
        r.prev_yeshiva_name || '',
        r.last_name,
        r.first_name,
        r.id_number || '',
        r.father_name || '',
        r.father_phone || '',
        r.test_mesechta || '',
        r.test_perek || '',
        r.test_daf_from || '',
        r.test_daf_to || '',
        r.test_sugya || '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 8 }, { wch: 8 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נבחנים');
    XLSX.writeFile(wb, `test_day_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handlePrint = () => window.print();

  if (withTest.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-5xl mb-3 opacity-40">📸</p>
        <p className="text-slate-500 text-base font-medium">אין נבחנים עם תאריכי מבחן</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">קבץ לפי</label>
          <Select
            options={[
              { value: 'date', label: 'תאריך' },
              { value: 'yeshiva', label: 'ישיבה קטנה' },
            ]}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="w-40"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handlePrint}>🖨️ הדפס</Button>
          <Button size="sm" onClick={exportToExcel}>📥 ייצא לאקסל</Button>
        </div>
      </div>

      <div className="space-y-4 print-area">
        {groups.map(([key, rows]) => (
          <div key={key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-amber-50 to-white">
              <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                {groupBy === 'date'
                  ? new Date(key).toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                  : key}
              </h3>
              <p className="text-xs text-slate-500">{rows.length} נבחנים</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
              {rows
                .sort((a, b) => (a.test_time || '').localeCompare(b.test_time || ''))
                .map((r) => (
                  <div key={r.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:elevation-2 transition-all">
                    <div className="aspect-square bg-slate-100 flex items-center justify-center relative group">
                      {r.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photo_url} alt={`${r.first_name} ${r.last_name}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl text-slate-300">👤</span>
                      )}
                      <label className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center text-xs no-print">
                        {uploadingId === r.id ? '⏳ מעלה...' : '📷 העלה תמונה'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePhotoUpload(r.id, f);
                          }}
                          disabled={uploadingId !== null}
                        />
                      </label>
                    </div>
                    <div className="p-2.5">
                      <p className="font-semibold text-slate-900 text-sm truncate">{r.last_name} {r.first_name}</p>
                      {groupBy === 'yeshiva' && r.test_date && (
                        <p className="text-[11px] text-slate-500 mt-0.5">📅 {r.test_date} · {r.test_time}</p>
                      )}
                      {groupBy === 'date' && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{r.prev_yeshiva_name || '—'}</p>
                      )}
                      {r.test_time && groupBy !== 'date' && (
                        <p className="text-[11px] text-slate-400 mt-0.5">⏰ {r.test_time}</p>
                      )}
                      {r.status === 'registered' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await setStatus(r.id, 'tested');
                              onChanged();
                            } catch (e: any) {
                              alert('שגיאה: ' + (e?.message || e));
                            }
                          }}
                          className="mt-1.5 w-full text-[11px] py-1 rounded-md bg-amber-50 text-amber-800 hover:bg-amber-100 ring-1 ring-amber-200 no-print"
                        >
                          ✓ סמן כנבחן
                        </button>
                      )}
                      {(r.status === 'tested' || r.status === 'accepted') && (
                        <input
                          type="text"
                          placeholder="ציון"
                          defaultValue={r.test_grade || ''}
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            if (val !== (r.test_grade || '')) {
                              try {
                                await update(r.id, { test_grade: val });
                                onChanged();
                              } catch (err: any) {
                                alert('שגיאה: ' + (err?.message || err));
                              }
                            }
                          }}
                          className="mt-1.5 w-full text-xs px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400/40 no-print"
                        />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; padding: 10mm; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
