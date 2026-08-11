'use client';

import { useRef, useState } from 'react';
import { Student, Family, Machzor } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { exportBulkXlsx, parseBulkFile, buildPatches } from '@/lib/student-bulk';

interface Props {
  students: Student[]; // already filtered by the sidebar (shiur + status)
  families: Record<string, Family>;
  machzorot: Record<string, Machzor>;
}

export function BulkShiurUpdate({ students, families, machzorot }: Props) {
  const { permissions } = useAuth();
  const canWrite = permissions.canWrite;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  const handleExport = () => {
    if (students.length === 0) { alert('אין תלמידים בסינון הנוכחי לייצוא'); return; }
    exportBulkXlsx(students, families, machzorot, `עדכון_תלמידים_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('קורא קובץ...');
    setResult(null);
    try {
      const { rows, unknownHeaders } = await parseBulkFile(file);
      if (rows.length === 0) { alert('לא נמצאו שורות עם מזהה בקובץ'); setBusy(null); return; }

      // Fetch id → {family_id, last_name} for the ids in the file (chunked).
      const ids = rows.map((r) => r.id);
      const byId = new Map<string, { family_id: string | null; last_name: string | null }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('students')
          .select('id, family_id, last_name')
          .in('id', ids.slice(i, i + 200));
        for (const s of data || []) byId.set(s.id, { family_id: s.family_id, last_name: s.last_name });
      }

      let studentUpd = 0, familyUpd = 0, familyNew = 0, notFound = 0, unchanged = 0;
      const errors: string[] = [];

      const confirmMsg =
        `הקובץ מכיל ${rows.length} שורות.` +
        (unknownHeaders.length ? `\nעמודות שלא זוהו (יידלגו): ${unknownHeaders.join(', ')}` : '') +
        `\n\nהמערכת תעדכן רק תאים שמולאו (תאים ריקים לא ימחקו נתונים).\nלהמשיך?`;
      if (!confirm(confirmMsg)) { setBusy(null); return; }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setBusy(`מעדכן ${i + 1}/${rows.length}...`);
        const rec = byId.get(row.id);
        if (!rec) { notFound++; continue; }
        const { student: sPatch, family: fPatch } = buildPatches(row.values);
        if (Object.keys(sPatch).length === 0 && Object.keys(fPatch).length === 0) { unchanged++; continue; }
        try {
          if (Object.keys(sPatch).length > 0) {
            const { error } = await supabase.from('students').update(sPatch).eq('id', row.id);
            if (error) throw error;
            studentUpd++;
          }
          if (Object.keys(fPatch).length > 0) {
            if (rec.family_id) {
              const { error } = await supabase.from('families').update(fPatch).eq('id', rec.family_id);
              if (error) throw error;
              familyUpd++;
            } else {
              // No family yet - create one and link it.
              const insert = { family_name: fPatch.family_name || rec.last_name || '', ...fPatch };
              const { data: nf, error } = await supabase.from('families').insert(insert).select('id').single();
              if (error) throw error;
              await supabase.from('students').update({ family_id: nf.id }).eq('id', row.id);
              familyNew++;
            }
          }
        } catch (err: any) {
          if (errors.length < 10) errors.push(`${row.id.slice(0, 8)}: ${err?.message || err}`);
        }
      }

      setBusy(null);
      setResult([
        `✓ תלמידים עודכנו: ${studentUpd}`,
        `✓ משפחות עודכנו: ${familyUpd}${familyNew ? ` (נוצרו ${familyNew})` : ''}`,
        ...(unchanged ? [`ללא שינוי: ${unchanged}`] : []),
        ...(notFound ? [`מזהה לא נמצא: ${notFound}`] : []),
        ...(unknownHeaders.length ? [`עמודות שדולגו: ${unknownHeaders.join(', ')}`] : []),
        ...(errors.length ? ['', 'שגיאות:', ...errors] : []),
      ]);
    } catch (err: any) {
      setBusy(null);
      alert('שגיאה בייבוא: ' + (err?.message || err));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">עדכון תלמידים לפי שיעור (אקסל)</h3>
        <p className="text-sm text-gray-600 mt-1">
          ייצא את התלמידים שנבחרו בסינון (שיעור/סטטוס), מלא/תקן פרטים באקסל, והעלה בחזרה לעדכון.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 space-y-1">
        <p>• השיוך לעדכון הוא לפי עמודת <strong>מזהה</strong> — <strong>אל תמחק אותה</strong>.</p>
        <p>• תאים <strong>ריקים לא ימחקו</strong> נתונים קיימים — רק תאים שמולאו יעודכנו.</p>
        <p>• עמודות "שיעור / מחזור / סטטוס" הן לצפייה בלבד ולא מתעדכנות מהקובץ.</p>
        <p>• תאריך לידה: בפורמט YYYY-MM-DD או DD/MM/YYYY.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Button onClick={handleExport} disabled={!!busy}>
          📥 ייצא לאקסל ({students.length})
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImport}
          className="hidden"
        />
        {canWrite ? (
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy || '📤 ייבוא ועדכון'}
          </Button>
        ) : (
          <span className="text-xs text-gray-500">ייבוא זמין למנהל/מזכירה בלבד</span>
        )}
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900 whitespace-pre-wrap">
          {result.join('\n')}
        </div>
      )}
    </div>
  );
}
