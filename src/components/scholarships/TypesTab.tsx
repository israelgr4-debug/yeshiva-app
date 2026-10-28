'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipType, ScholarshipSource } from '@/lib/types';
import { ScholarshipTabProps, SectionCard, EmptyState, ils } from './shared';

interface Draft {
  id?: string;
  name: string;
  source: ScholarshipSource;
  yemot_extension: string;
  default_amount: string;
  sort_order: string;
  is_active: boolean;
}

const toDraft = (t?: ScholarshipType): Draft => ({
  id: t?.id,
  name: t?.name || '',
  source: t?.source || 'manual',
  yemot_extension: t?.yemot_extension || '',
  default_amount: t?.default_amount != null ? String(t.default_amount) : '',
  sort_order: t ? String(t.sort_order) : '',
  is_active: t?.is_active ?? true,
});

const SOURCE_LABEL: Record<ScholarshipSource, string> = { yemot: '📞 ימות המשיח', manual: '⌨️ ידני' };

export function TypesTab({ perms }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = perms.canAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try { setTypes(await sch.listTypes(true)); } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    setLoading(false);
  }, [sch]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) { alert('יש להזין שם'); return; }
    setBusy(true);
    try {
      await sch.saveType({
        id: edit.id,
        name: edit.name,
        source: edit.source,
        yemot_extension: edit.yemot_extension || null,
        default_amount: edit.default_amount === '' ? null : Number(edit.default_amount),
        sort_order: edit.sort_order === '' ? (types.length + 1) : Number(edit.sort_order),
        is_active: edit.is_active,
      });
      setEdit(null);
      await load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const remove = async (t: ScholarshipType) => {
    if (!confirm(`להסיר את הרכיב "${t.name}"?\nאם כבר יש לו חיובים — הוא רק יושבת (לא יימחק).`)) return;
    setBusy(true);
    try {
      const r = await sch.removeType(t.id);
      alert(r === 'deleted' ? 'הרכיב נמחק' : 'לרכיב יש חיובים — הוא הושבת ולא נמחק');
      await load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const input = 'w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm';

  return (
    <SectionCard
      title="סוגי מלגות (רכיבים)"
      actions={canEdit && !edit ? <Button size="sm" onClick={() => setEdit(toDraft())}>➕ רכיב חדש</Button> : undefined}
    >
      {!canEdit && <p className="text-xs text-slate-500 mb-3">עריכת סוגי מלגות — למנהל מערכת בלבד.</p>}

      {edit && (
        <div className="mb-4 p-3 rounded-xl bg-orange-50/60 border border-orange-200 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <label className="col-span-2 text-xs text-slate-600">שם
            <input autoFocus className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder='למשל "שבתות"' />
          </label>
          <label className="text-xs text-slate-600">מקור
            <select className={input} value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value as ScholarshipSource })}>
              <option value="manual">⌨️ ידני</option>
              <option value="yemot">📞 ימות המשיח</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">שלוחה
            <input className={input} value={edit.yemot_extension} disabled={edit.source !== 'yemot'} dir="ltr"
              onChange={(e) => setEdit({ ...edit, yemot_extension: e.target.value })} placeholder={edit.source === 'yemot' ? '11' : '—'} />
          </label>
          <label className="text-xs text-slate-600">סכום ברירת מחדל
            <input className={input} value={edit.default_amount} inputMode="numeric" dir="ltr"
              onChange={(e) => setEdit({ ...edit, default_amount: e.target.value.replace(/[^\d.]/g, '') })} />
          </label>
          <label className="text-xs text-slate-600">סדר
            <input className={input} value={edit.sort_order} inputMode="numeric" dir="ltr"
              onChange={(e) => setEdit({ ...edit, sort_order: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2 md:col-span-1">
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> פעיל
          </label>
          <div className="col-span-2 md:col-span-5 flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={() => setEdit(null)} disabled={busy}>ביטול</Button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמור'}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">טוען…</div>
      ) : types.length === 0 ? (
        <EmptyState icon="🏷️" text="אין רכיבים עדיין" hint="אם זה המסך הראשון — ודא שמיגרציה 056 הורצה" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="text-start px-3 py-2">סדר</th>
                <th className="text-start px-3 py-2">שם</th>
                <th className="text-start px-3 py-2">מקור</th>
                <th className="text-start px-3 py-2">שלוחה</th>
                <th className="text-start px-3 py-2">ברירת מחדל</th>
                <th className="text-start px-3 py-2">סטטוס</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className={`border-b border-slate-50 hover:bg-blue-50/40 ${t.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{t.sort_order}</td>
                  <td className="px-3 py-2 font-medium">{t.name}{t.kind === 'one_time' && <span className="ms-2 text-[11px] px-1.5 rounded bg-orange-100 text-orange-800">חד פעמי</span>}</td>
                  <td className="px-3 py-2">{SOURCE_LABEL[t.source]}</td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">{t.yemot_extension || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{t.default_amount != null ? ils(t.default_amount) : '—'}</td>
                  <td className="px-3 py-2">
                    {t.is_active
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">פעיל</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">מושבת</span>}
                  </td>
                  <td className="px-3 py-2 text-end whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => setEdit(toDraft(t))} className="text-xs text-blue-600 hover:underline">✏️ עריכה</button>
                        {t.kind !== 'one_time' && <button type="button" onClick={() => remove(t)} disabled={busy} className="text-xs text-red-600 hover:underline ms-3">🗑️ הסר</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 mt-3">רכיב שיש לו חיובים לא נמחק — רק מושבת (לא יופיע בחיובים חדשים, ההיסטוריה נשמרת).</p>
        </div>
      )}
    </SectionCard>
  );
}
