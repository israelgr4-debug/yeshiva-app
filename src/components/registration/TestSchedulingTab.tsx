'use client';

import { useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRegistrations } from '@/hooks/useRegistrations';

interface Props {
  registrations: Registration[];
  onChanged: () => void;
}

interface SlotForm {
  test_date?: string;
  test_time?: string;
  test_mesechta?: string;
  test_perek?: string;
  test_daf_from?: string;
  test_daf_to?: string;
  test_sugya?: string;
  test_notes?: string;
}

export function TestSchedulingTab({ registrations, onChanged }: Props) {
  const { applyTestSlotToYeshiva, update } = useRegistrations();
  const [slotByYeshiva, setSlotByYeshiva] = useState<Record<string, SlotForm>>({});
  const [overrides, setOverrides] = useState<Record<string, SlotForm>>({});
  const [savingYeshiva, setSavingYeshiva] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Group registrations by source yeshiva (only ones who haven't been tested yet)
  const groups = useMemo(() => {
    const map = new Map<string, Registration[]>();
    for (const r of registrations) {
      if (r.status !== 'registered' && r.status !== 'tested') continue;
      const key = r.prev_yeshiva_name || '— ללא ישיבה —';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'he'));
  }, [registrations]);

  const setSlot = (yeshiva: string, patch: Partial<SlotForm>) => {
    setSlotByYeshiva((p) => ({ ...p, [yeshiva]: { ...p[yeshiva], ...patch } }));
  };

  const handleApplyYeshiva = async (yeshiva: string) => {
    const slot = slotByYeshiva[yeshiva];
    if (!slot) return;
    setSavingYeshiva(yeshiva);
    try {
      const n = await applyTestSlotToYeshiva(yeshiva, slot);
      alert(`עודכנו ${n} תלמידים מ"${yeshiva}"`);
      onChanged();
      // Clear the form for this yeshiva
      setSlotByYeshiva((p) => ({ ...p, [yeshiva]: {} }));
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSavingYeshiva(null);
    }
  };

  const handleSaveOverride = async (id: string) => {
    const ov = overrides[id];
    if (!ov) return;
    setSavingId(id);
    try {
      await update(id, ov as any);
      onChanged();
      setOverrides((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSavingId(null);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-5xl mb-3 opacity-40">📅</p>
        <p className="text-slate-500 text-base font-medium">אין רישומים פעילים להגדרת מועדי מבחן</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([yeshiva, rows]) => {
        const slot = slotByYeshiva[yeshiva] || {};
        return (
          <div key={yeshiva} className="bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3
                  className="font-bold text-slate-900"
                  style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
                >
                  {yeshiva}
                </h3>
                <p className="text-xs text-slate-500">{rows.length} נבחנים</p>
              </div>
            </div>

            {/* Bulk slot for the yeshiva */}
            <div className="px-4 py-3 bg-violet-50/40 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                ⚙️ הגדר מועד וחומר לכל הישיבה
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
                <Input
                  label="תאריך"
                  type="date"
                  value={slot.test_date || ''}
                  onChange={(e) => setSlot(yeshiva, { test_date: e.target.value })}
                />
                <Input
                  label="שעה"
                  type="time"
                  value={slot.test_time || ''}
                  onChange={(e) => setSlot(yeshiva, { test_time: e.target.value })}
                />
                <Input
                  label="מסכת"
                  value={slot.test_mesechta || ''}
                  onChange={(e) => setSlot(yeshiva, { test_mesechta: e.target.value })}
                />
                <Input
                  label="פרק"
                  value={slot.test_perek || ''}
                  onChange={(e) => setSlot(yeshiva, { test_perek: e.target.value })}
                />
                <Input
                  label="מדף"
                  value={slot.test_daf_from || ''}
                  onChange={(e) => setSlot(yeshiva, { test_daf_from: e.target.value })}
                />
                <Input
                  label="עד דף"
                  value={slot.test_daf_to || ''}
                  onChange={(e) => setSlot(yeshiva, { test_daf_to: e.target.value })}
                />
                <Input
                  label="סוגיא"
                  value={slot.test_sugya || ''}
                  onChange={(e) => setSlot(yeshiva, { test_sugya: e.target.value })}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleApplyYeshiva(yeshiva)}
                  disabled={savingYeshiva === yeshiva}
                >
                  {savingYeshiva === yeshiva ? 'מעדכן...' : `החל על ${rows.length} נבחנים`}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                * רק שדות שמולאו יוחלו - השאר יישארו כפי שהם בכל רשומה.
              </p>
            </div>

            {/* Per-student override list */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">שם</th>
                    <th className="px-3 py-2 text-start font-semibold">תאריך</th>
                    <th className="px-3 py-2 text-start font-semibold">שעה</th>
                    <th className="px-3 py-2 text-start font-semibold">מסכת</th>
                    <th className="px-3 py-2 text-start font-semibold">פרק</th>
                    <th className="px-3 py-2 text-start font-semibold">מדף</th>
                    <th className="px-3 py-2 text-start font-semibold">עד דף</th>
                    <th className="px-3 py-2 text-start font-semibold">סוגיא</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ov = overrides[r.id];
                    const dirty = !!ov && Object.values(ov).some((v) => v !== undefined);
                    const setOv = (patch: Partial<SlotForm>) =>
                      setOverrides((p) => ({ ...p, [r.id]: { ...p[r.id], ...patch } }));
                    const v = (key: keyof SlotForm) => (ov?.[key] !== undefined ? ov[key] : (r as any)[key] || '');
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 ${dirty ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.last_name} {r.first_name}</td>
                        <td className="px-3 py-2">
                          <input type="date" value={v('test_date') as any} onChange={(e) => setOv({ test_date: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="time" value={v('test_time') as any} onChange={(e) => setOv({ test_time: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={v('test_mesechta') as any} onChange={(e) => setOv({ test_mesechta: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs w-24" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={v('test_perek') as any} onChange={(e) => setOv({ test_perek: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs w-20" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={v('test_daf_from') as any} onChange={(e) => setOv({ test_daf_from: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs w-16" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={v('test_daf_to') as any} onChange={(e) => setOv({ test_daf_to: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs w-16" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={v('test_sugya') as any} onChange={(e) => setOv({ test_sugya: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-md text-xs w-28" />
                        </td>
                        <td className="px-3 py-2 text-end">
                          {dirty && (
                            <Button size="sm" onClick={() => handleSaveOverride(r.id)} disabled={savingId === r.id}>
                              {savingId === r.id ? '...' : '💾'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
