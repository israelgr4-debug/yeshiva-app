'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';
import { exportRosterXlsx, parseRosterFile, rosterNameKey, isYeshivaStudent } from '@/lib/dorm-roster';

type SortKey = 'last_name' | 'first_name' | 'current_room' | 'new_room' | 'shiur';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'active' | 'active_chizuk' | 'inactive' | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'פעילים בלבד' },
  { value: 'active_chizuk', label: 'פעילים + חיזוק' },
  { value: 'inactive', label: 'לא פעילים' },
  { value: 'all', label: 'כל הסטטוסים' },
];

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל', chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים',
};

export default function DormitoryManagePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRooms, setNewRooms] = useState<Record<string, string>>({});
  const [shiurFilter, setShiurFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithChanges, setOnlyWithChanges] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('current_room');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [busyOp, setBusyOp] = useState<null | 'clear' | 'import'>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  // --- Annual reshuffle: download backup / template ---
  const handleDownloadRoster = () => {
    if (statusScoped.length === 0) { alert('אין תלמידים להורדה בסינון הנוכחי'); return; }
    exportRosterXlsx(statusScoped, `שיבוץ_פנימייה_${todayStr()}.xlsx`);
  };

  // --- Clear the whole dorm (with an automatic backup download first) ---
  const handleClearDorm = async () => {
    setBusyOp('clear');
    try {
      // Every student that currently holds a room - ANY status (active, chizuk,
      // inactive, graduated). This is exactly what gets backed up and cleared.
      const rawWithRooms: any[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('students')
          .select('id,first_name,last_name,shiur,room_number,status,institution_name')
          .not('room_number', 'is', null)
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        rawWithRooms.push(...data);
        if (data.length < 1000) break;
      }
      // Dorm = ישיבה only. Never back up or clear כולל students.
      const withRooms = rawWithRooms.filter(isYeshivaStudent);
      const skippedKollel = rawWithRooms.length - withRooms.length;
      if (withRooms.length === 0) { alert('אין שיבוצים לרוקן'); return; }

      const byStatus: Record<string, number> = {};
      for (const s of withRooms) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      const breakdown = Object.entries(byStatus)
        .map(([k, v]) => `${STATUS_LABEL[k] || k}: ${v}`)
        .join(' · ');

      const typed = prompt(
        `⚠️ ריקון פנימייה\n\nפעולה זו תמחק את שיבוצי החדרים של ${withRooms.length} תלמידי ישיבה — בכל הסטטוסים.\n` +
        `(${breakdown})\n` +
        (skippedKollel > 0 ? `\nלא ייגעו ${skippedKollel} תלמידי כולל.\n` : '') +
        `\nלפני הריקון יירד אוטומטית קובץ גיבוי אקסל עם השיבוץ הנוכחי.\n\n` +
        `לאישור הקלד את המילה: רוקן`
      );
      if (typed === null) return;
      if (typed.trim() !== 'רוקן') { alert('הפעולה בוטלה — לא הוקלד "רוקן".'); return; }

      // 1) Backup download (every ישיבה student who currently has a room)
      exportRosterXlsx(withRooms as Student[], `גיבוי_פנימייה_${todayStr()}.xlsx`);
      // 2) Clear by id, in chunks - so כולל students are never touched
      const ids = withRooms.map((s) => s.id);
      let cleared = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from('students')
          .update({ room_number: null })
          .in('id', ids.slice(i, i + 200))
          .select('id');
        if (error) throw error;
        cleared += data?.length ?? 0;
      }
      alert(`הפנימייה רוקנה. ${cleared} תלמידים אופסו.\nקובץ הגיבוי ירד למחשב.`);
      setNewRooms({});
      await loadStudents();
    } catch (e: any) {
      alert('שגיאה בריקון: ' + (e?.message || e));
    } finally {
      setBusyOp(null);
    }
  };

  // --- Import assignments from an Excel/CSV roster ---
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    setBusyOp('import');
    try {
      const rows = await parseRosterFile(file);
      if (rows.length === 0) { alert('הקובץ ריק או לא בפורמט מוכר (צריך עמודות שם/חדר).'); return; }

      // Match against ALL students (any status) for robust restore.
      const all: any[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('students')
          .select('id,first_name,last_name,shiur,room_number')
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const byId = new Map(all.map((s) => [s.id, s]));
      const byName = new Map<string, any>();
      for (const s of all) {
        const k = rosterNameKey(s.last_name, s.first_name, s.shiur);
        byName.set(k, byName.has(k) ? 'DUP' : s);
      }

      const updates: { id: string; room: number | null }[] = [];
      let unmatched = 0, ambiguous = 0, badRoom = 0;
      const unmatchedNames: string[] = [];
      for (const row of rows) {
        let target: any = row.id ? byId.get(row.id) : undefined;
        if (!target) {
          const m = byName.get(rosterNameKey(row.last_name, row.first_name, row.shiur));
          if (m === 'DUP') { ambiguous++; continue; }
          target = m;
        }
        if (!target) {
          unmatched++;
          if (unmatchedNames.length < 8) unmatchedNames.push(`${row.last_name} ${row.first_name}`.trim());
          continue;
        }
        let newRoom: number | null = null;
        if (row.room !== '') {
          const n = parseInt(row.room, 10);
          if (!n || isNaN(n)) { badRoom++; continue; }
          newRoom = n;
        }
        const cur = target.room_number ?? null;
        if (cur !== newRoom) updates.push({ id: target.id, room: newRoom });
      }

      const clears = updates.filter((u) => u.room === null).length;
      if (updates.length === 0) {
        alert(
          `לא נמצאו שינויים לביצוע.\nשורות בקובץ: ${rows.length}\n` +
          `ללא התאמה: ${unmatched}${ambiguous ? `\nכפילות שם: ${ambiguous}` : ''}${badRoom ? `\nחדר לא תקין: ${badRoom}` : ''}`
        );
        return;
      }
      const proceed = confirm(
        `לעדכן ${updates.length} תלמידים לפי הקובץ?\n` +
        (clears ? `(מתוכם ${clears} יאופסו/יתרוקנו)\n` : '') +
        `\nללא התאמה: ${unmatched}${unmatchedNames.length ? ` (${unmatchedNames.join(', ')}${unmatched > unmatchedNames.length ? '…' : ''})` : ''}` +
        `${ambiguous ? `\nכפילות שם (דלג): ${ambiguous}` : ''}${badRoom ? `\nחדר לא תקין (דלג): ${badRoom}` : ''}`
      );
      if (!proceed) return;

      let ok = 0, err = 0;
      for (const u of updates) {
        const { error } = await supabase.from('students').update({ room_number: u.room }).eq('id', u.id);
        if (error) err++; else ok++;
      }
      alert(`ייבוא הושלם.\nעודכנו: ${ok}${err ? `\nשגיאות: ${err}` : ''}${unmatched ? `\nללא התאמה: ${unmatched}` : ''}`);
      setNewRooms({});
      await loadStudents();
    } catch (e: any) {
      alert('שגיאה בייבוא: ' + (e?.message || e));
    } finally {
      setBusyOp(null);
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    // Load students of EVERY status (paginated) so inactive/chizuk can also be
    // assigned for next year. כולל students are excluded - the dorm is ישיבה only.
    const all: Student[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase
        .from('students')
        .select('id,first_name,last_name,shiur,room_number,status,id_number,institution_name')
        .range(from, to);
      if (!data || data.length === 0) break;
      all.push(...(data as Student[]));
      if (data.length < 1000) break;
    }
    setStudents(all.filter(isYeshivaStudent));
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Status scope - default shows only active; other statuses are opt-in so they
  // can be assigned ahead of next year without cluttering the default view.
  const statusScoped = useMemo(() => {
    switch (statusFilter) {
      case 'active': return students.filter((s) => s.status === 'active');
      case 'active_chizuk': return students.filter((s) => s.status === 'active' || s.status === 'chizuk');
      case 'inactive': return students.filter((s) => s.status === 'inactive');
      default: return students;
    }
  }, [students, statusFilter]);

  const filtered = useMemo(() => {
    let result = statusScoped;
    if (shiurFilter) result = result.filter((s) => s.shiur === shiurFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s) =>
        [s.first_name, s.last_name, s.id_number, String(s.room_number || '')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (onlyWithChanges) {
      result = result.filter((s) => {
        const newVal = (newRooms[s.id] ?? '').trim();
        if (!newVal) return false;
        const currentVal = s.room_number ? String(s.room_number) : '';
        return newVal !== currentVal;
      });
    }

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'last_name':
          cmp = (a.last_name || '').localeCompare(b.last_name || '', 'he');
          break;
        case 'first_name':
          cmp = (a.first_name || '').localeCompare(b.first_name || '', 'he');
          break;
        case 'current_room':
          cmp = (a.room_number || 0) - (b.room_number || 0);
          break;
        case 'new_room':
          cmp = (parseInt(newRooms[a.id] || '0') || 0) - (parseInt(newRooms[b.id] || '0') || 0);
          break;
        case 'shiur':
          cmp = (a.shiur || '').localeCompare(b.shiur || '', 'he');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [statusScoped, shiurFilter, searchQuery, onlyWithChanges, sortKey, sortDir, newRooms]);

  const handleChangeRoom = (id: string, value: string) => {
    setNewRooms((prev) => {
      const next = { ...prev };
      if (value.trim() === '') delete next[id];
      else next[id] = value.trim();
      return next;
    });
  };

  const pendingChanges = useMemo(() => {
    return students.filter((s) => {
      const newVal = (newRooms[s.id] ?? '').trim();
      if (!newVal) return false;
      const currentVal = s.room_number ? String(s.room_number) : '';
      return newVal !== currentVal;
    });
  }, [students, newRooms]);

  const handleClearAll = () => {
    if (Object.keys(newRooms).length === 0) return;
    if (!confirm('לנקות את כל השינויים שהוזנו?')) return;
    setNewRooms({});
  };

  const handleApplyChanges = async () => {
    if (pendingChanges.length === 0) {
      alert('אין שינויים לביצוע');
      return;
    }

    if (!confirm(`לעדכן ${pendingChanges.length} תלמידים למספרי חדרים חדשים?`)) return;

    setSaving(true);
    let updated = 0;
    let errors = 0;
    for (const s of pendingChanges) {
      const newVal = newRooms[s.id];
      try {
        const newRoom = parseInt(newVal);
        if (!newRoom || isNaN(newRoom)) continue;
        const { error } = await supabase
          .from('students')
          .update({ room_number: newRoom })
          .eq('id', s.id);
        if (error) errors++;
        else updated++;
      } catch {
        errors++;
      }
    }

    setSaving(false);
    alert(`בוצע: ${updated} תלמידים עודכנו${errors > 0 ? `, ${errors} שגיאות` : ''}`);
    setNewRooms({});
    await loadStudents();
  };

  const SortHeader = ({ label, sortK }: { label: string; sortK: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortK)}
      className="flex items-center gap-1 font-semibold hover:text-blue-600"
    >
      {label}
      {sortKey === sortK && <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  const shiurOptions = [{ value: '', label: 'כל השיעורים' }, ...SHIURIM.map((s) => ({ value: s.name, label: s.name }))];

  return (
    <PageGuard requires="write" message="עמוד זה דורש הרשאת כתיבה (admin / secretary). למנהל ולצופה אין גישה לפעולות כתיבה.">

    <>
      <Header title="ניהול פנימייה" subtitle="שיבוץ חדרים המוני לתלמידים" />

      <div className="p-4 md:p-8 space-y-4">
        {/* Nav */}
        <div className="flex flex-wrap gap-2">
          <Link href="/dormitory" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ← מפת פנימייה
          </Link>
          <Link href="/dormitory/edit" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ערוך מפה
          </Link>
        </div>

        {/* Annual reshuffle: backup / import / clear */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-bold text-amber-900 mb-1">🔁 שיבוץ שנתי</h3>
          <p className="text-sm text-amber-800 mb-3">
            הורד גיבוי/תבנית → ערוך את עמודת <strong>חדר</strong> באקסל → ייבא בחזרה. הריקון מוריד גיבוי אוטומטית לפני המחיקה.
            <br />
            <span className="text-xs">עמודת <strong>מזהה</strong> משמשת לשיוך מדויק — אל תמחק אותה. חדר ריק בקובץ = איפוס שיבוץ לאותו תלמיד.</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleDownloadRoster} disabled={busyOp !== null || loading}>
              📥 הורד גיבוי / תבנית
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busyOp !== null || loading}>
              {busyOp === 'import' ? 'מייבא...' : '📤 ייבוא מאקסל'}
            </Button>
            <Button variant="danger" onClick={handleClearDorm} disabled={busyOp !== null || loading}>
              {busyOp === 'clear' ? 'מרוקן...' : '🗑️ ריקון פנימייה'}
            </Button>
          </div>
        </div>

        {/* Filters + summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SearchInput placeholder="חיפוש לפי שם, ת.ז., חדר..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select value={shiurFilter} onChange={(e) => setShiurFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg">
            {shiurOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
            title="ברירת מחדל: פעילים. שנה כדי לשבץ גם חיזוק / לא פעילים לשנה הבאה"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer bg-white">
            <input type="checkbox" checked={onlyWithChanges} onChange={(e) => setOnlyWithChanges(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">הצג רק שינויים</span>
          </label>
          <div className="text-sm text-gray-600 flex items-center">
            {filtered.length} תלמידים {loading && '(טוען...)'}
          </div>
        </div>

        {/* Action bar - sticky */}
        <div className="sticky top-0 z-10 bg-white shadow-md rounded-lg p-4 border border-gray-200 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
              <strong>{pendingChanges.length}</strong> שינויים ממתינים
            </span>
          </div>
          <div className="mr-auto flex gap-2">
            <Button variant="secondary" onClick={handleClearAll} disabled={Object.keys(newRooms).length === 0}>
              נקה הכל
            </Button>
            <Button onClick={handleApplyChanges} disabled={saving || pendingChanges.length === 0}>
              {saving ? 'מבצע...' : `✓ בצע ${pendingChanges.length > 0 ? `(${pendingChanges.length})` : ''}`}
            </Button>
          </div>
        </div>

        {/* Students table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-start"><SortHeader label="שם משפחה" sortK="last_name" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="שם פרטי" sortK="first_name" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="שיעור" sortK="shiur" /></th>
                <th className="px-3 py-2 text-start font-semibold">סטטוס</th>
                <th className="px-3 py-2 text-start"><SortHeader label="חדר נוכחי" sortK="current_room" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="חדר חדש" sortK="new_room" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const newVal = newRooms[s.id] || '';
                const currentVal = s.room_number ? String(s.room_number) : '';
                const hasChange = newVal && newVal !== currentVal;
                return (
                  <tr key={s.id} className={`border-t border-gray-100 ${hasChange ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-3 py-2">
                      <Link href={`/students/${s.id}`} className="text-blue-600 hover:underline font-medium">
                        {s.last_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{s.first_name}</td>
                    <td className="px-3 py-2 text-gray-600">{s.shiur || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          s.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800'
                            : s.status === 'chizuk'
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{currentVal || <span className="text-gray-400">-</span>}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newVal}
                        onChange={(e) => handleChangeRoom(s.id, e.target.value)}
                        placeholder="—"
                        className={`w-24 px-2 py-1 border rounded text-center font-medium ${
                          hasChange ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">אין תלמידים להצגה</div>
          )}
        </div>
      </div>
    </>
    </PageGuard>
  );
}
