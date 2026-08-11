'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Family } from '@/lib/types';

type FamRow = Family & Record<string, any>;
interface Stud { id: string; first_name: string; last_name: string; shiur: string | null; status: string; family_id: string | null }

interface DupGroup {
  key: string;
  reason: string;             // מה חיבר אותן
  families: FamRow[];
  studentsByFamily: Record<string, Stud[]>;
  gradsByFamily: Record<string, number>;
}

const digits = (s: any) => String(s || '').replace(/\D/g, '');
const normId = (s: any) => digits(s).replace(/^0+/, '');
const normPhone = (s: any) => { let v = digits(s); if (v.startsWith('972')) v = '0' + v.slice(3); return v; };
const normName = (s: any) => String(s || '').trim().replace(/\s+/g, ' ');

// Fields copied to fill empty target fields on merge (no overwrite).
const FILL_FIELDS = [
  'father_name', 'father_id_number', 'father_phone', 'father_email', 'father_occupation',
  'mother_name', 'mother_id_number', 'mother_phone', 'mother_email', 'mother_occupation',
  'address', 'city', 'postal_code', 'home_phone', 'bank_name', 'bank_branch', 'bank_account',
];

export function DuplicateFamiliesTab() {
  const { permissions } = useAuth();
  const canWrite = permissions.canWrite;
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    setMsg(null);
    try {
      // load all families + students + graduates (paginated)
      const fams: FamRow[] = [];
      const studs: Stud[] = [];
      const grads: { family_id: string | null }[] = [];
      for (let p = 0; p < 40; p++) {
        const { data } = await supabase.from('families').select('*').range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        fams.push(...(data as FamRow[]));
        if (data.length < 1000) break;
      }
      for (let p = 0; p < 40; p++) {
        const { data } = await supabase
          .from('students')
          .select('id,first_name,last_name,shiur,status,family_id')
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        studs.push(...(data as Stud[]));
        if (data.length < 1000) break;
      }
      for (let p = 0; p < 40; p++) {
        const { data } = await supabase.from('graduates').select('family_id').range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        grads.push(...(data as { family_id: string | null }[]));
        if (data.length < 1000) break;
      }

      const studentsByFamily: Record<string, Stud[]> = {};
      for (const s of studs) {
        if (s.family_id) (studentsByFamily[s.family_id] ||= []).push(s);
      }
      const gradsByFamilyAll: Record<string, number> = {};
      for (const g of grads) {
        if (g.family_id) gradsByFamilyAll[g.family_id] = (gradsByFamilyAll[g.family_id] || 0) + 1;
      }
      // Families with no students AND no graduates = orphan clutter.
      setOrphanCount(
        fams.filter((f) => (studentsByFamily[f.id] || []).length === 0 && !gradsByFamilyAll[f.id]).length
      );

      // Union-Find over families
      const idx = new Map(fams.map((f, i) => [f.id, i]));
      const parent = fams.map((_, i) => i);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      const union = (a: number, b: number) => { parent[find(a)] = find(b); };

      // (a) same normalized father id
      const byId: Record<string, number[]> = {};
      // (b) father id missing → same phone + same father name
      const byPhoneName: Record<string, number[]> = {};
      fams.forEach((f, i) => {
        const id = normId(f.father_id_number);
        if (id) (byId[id] ||= []).push(i);
        else {
          const ph = normPhone(f.father_phone);
          const nm = normName(f.father_name);
          if (ph && nm) (byPhoneName[`${ph}|${nm}`] ||= []).push(i);
        }
      });
      for (const arr of Object.values(byId)) for (let k = 1; k < arr.length; k++) union(arr[0], arr[k]);
      for (const arr of Object.values(byPhoneName)) for (let k = 1; k < arr.length; k++) union(arr[0], arr[k]);

      // collect components with >1 family
      const comps: Record<number, number[]> = {};
      fams.forEach((_, i) => { (comps[find(i)] ||= []).push(i); });

      const result: DupGroup[] = [];
      for (const members of Object.values(comps)) {
        if (members.length < 2) continue;
        const gfams = members.map((i) => fams[i]);
        const sbf: Record<string, Stud[]> = {};
        const gbf: Record<string, number> = {};
        let familiesWithData = 0;
        for (const f of gfams) {
          sbf[f.id] = studentsByFamily[f.id] || [];
          gbf[f.id] = gradsByFamilyAll[f.id] || 0;
          if (sbf[f.id].length > 0 || gbf[f.id] > 0) familiesWithData += 1;
        }
        // A real merge needs ≥2 families that actually hold a student/graduate.
        // One real family surrounded by empty records isn't a merge - those
        // empties are cleaned up by "נקה משפחות יתומות".
        if (familiesWithData < 2) continue;
        const ids = new Set(gfams.map((f) => normId(f.father_id_number)).filter(Boolean));
        const reason = ids.size > 0 ? 'ת"ז אב זהה' : 'טלפון + שם אב זהים';
        result.push({
          key: gfams.map((f) => f.id).join(','),
          reason,
          families: gfams,
          studentsByFamily: sbf,
          gradsByFamily: gbf,
        });
      }
      // sort: groups with more families-holding-students first
      const withStudents = (g: DupGroup) => g.families.filter((f) => (g.studentsByFamily[f.id] || []).length > 0).length;
      result.sort((a, b) => withStudents(b) - withStudents(a) || b.families.length - a.families.length);
      setGroups(result);
      setScanned(true);
      void idx;
    } catch (e: any) {
      setMsg('שגיאה בסריקה: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // pick the family with most students, tie → most filled fields
  const pickTarget = (g: DupGroup): FamRow => {
    return [...g.families].sort((a, b) => {
      const sa = (g.studentsByFamily[a.id] || []).length;
      const sb = (g.studentsByFamily[b.id] || []).length;
      if (sa !== sb) return sb - sa;
      const fa = FILL_FIELDS.filter((k) => String(a[k] || '').trim()).length;
      const fb = FILL_FIELDS.filter((k) => String(b[k] || '').trim()).length;
      return fb - fa;
    })[0];
  };

  const mergeGroup = async (g: DupGroup) => {
    if (!canWrite) return;
    const target = pickTarget(g);
    const sources = g.families.filter((f) => f.id !== target.id);
    setBusyKey(g.key);
    try {
      // fill empty target fields from sources
      const patch: Record<string, any> = {};
      for (const k of FILL_FIELDS) {
        if (String(target[k] || '').trim()) continue;
        for (const src of sources) {
          const v = String(src[k] || '').trim();
          if (v) { patch[k] = src[k]; break; }
        }
      }
      if (Object.keys(patch).length) {
        await supabase.from('families').update(patch).eq('id', target.id);
      }
      // move students + graduates, then delete emptied source families
      for (const src of sources) {
        const kids = g.studentsByFamily[src.id] || [];
        for (const s of kids) {
          await supabase.from('students').update({ family_id: target.id }).eq('id', s.id);
        }
        if ((g.gradsByFamily[src.id] || 0) > 0) {
          await supabase.from('graduates').update({ family_id: target.id }).eq('family_id', src.id);
        }
        const { data: remStud } = await supabase.from('students').select('id').eq('family_id', src.id).limit(1);
        const { data: remGrad } = await supabase.from('graduates').select('id').eq('family_id', src.id).limit(1);
        if ((!remStud || remStud.length === 0) && (!remGrad || remGrad.length === 0)) {
          await supabase.from('families').delete().eq('id', src.id);
        }
      }
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      setMsg('✓ מוזגה משפחה אחת');
    } catch (e: any) {
      setMsg('שגיאה במיזוג: ' + (e?.message || e));
    } finally {
      setBusyKey(null);
    }
  };

  const mergeAll = async () => {
    if (!canWrite) return;
    if (!confirm(`למזג את כל ${groups.length} הכפילויות שנמצאו?`)) return;
    for (const g of [...groups]) {
      // eslint-disable-next-line no-await-in-loop
      await mergeGroup(g);
    }
  };

  // Delete every family with no students AND no graduates. Re-checks each
  // family against the live DB before deleting (never trusts the scan count).
  const cleanupOrphans = async () => {
    if (!canWrite) return;
    const typed = prompt(
      `ניקוי משפחות יתומות\n\n` +
      `יימחקו כל המשפחות שאין בהן אף תלמיד ואף בוגר (~${orphanCount}).\n` +
      `הפעולה אינה הפיכה.\n\nלאישור הקלד: מחק`
    );
    if (typed === null) return;
    if (typed.trim() !== 'מחק') { alert('הפעולה בוטלה — לא הוקלד "מחק".'); return; }

    setBusyKey('__orphans__');
    setMsg(null);
    try {
      // fresh family/student/graduate ids
      const famIds: string[] = [];
      for (let p = 0; p < 40; p++) {
        const { data } = await supabase.from('families').select('id').range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        famIds.push(...data.map((f: any) => f.id));
        if (data.length < 1000) break;
      }
      const used = new Set<string>();
      for (const table of ['students', 'graduates']) {
        for (let p = 0; p < 40; p++) {
          const { data } = await supabase.from(table).select('family_id').not('family_id', 'is', null).range(p * 1000, p * 1000 + 999);
          if (!data || data.length === 0) break;
          for (const r of data as any[]) if (r.family_id) used.add(r.family_id);
          if (data.length < 1000) break;
        }
      }
      const orphanIds = famIds.filter((id) => !used.has(id));
      let deleted = 0;
      for (let i = 0; i < orphanIds.length; i += 100) {
        const chunk = orphanIds.slice(i, i + 100);
        const { error } = await supabase.from('families').delete().in('id', chunk);
        if (!error) deleted += chunk.length;
        setBusyKey(`__orphans__:${Math.min(i + 100, orphanIds.length)}/${orphanIds.length}`);
      }
      setOrphanCount(0);
      setMsg(`✓ נמחקו ${deleted} משפחות יתומות`);
    } catch (e: any) {
      setMsg('שגיאה בניקוי: ' + (e?.message || e));
    } finally {
      setBusyKey(null);
    }
  };

  const fld = (f: FamRow, k: string) => String(f[k] || '').trim() || '—';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">🔎 חיפוש משפחות כפולות</h3>
            <p className="text-sm text-gray-600 mt-1">
              מזהה משפחות שהן ככל הנראה אותה משפחה: לפי <strong>ת"ז אב זהה</strong> (ללא אפסים מובילים),
              ולמשפחות ללא ת"ז — לפי <strong>טלפון אב + שם אב זהים</strong>.
            </p>
          </div>
          <Button onClick={scan} disabled={loading}>
            {loading ? 'סורק...' : '🔎 חפש כפילויות'}
          </Button>
        </div>
        {msg && <div className="mt-3 text-sm text-emerald-700">{msg}</div>}
      </div>

      {scanned && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              נמצאו <strong>{groups.length}</strong> כפילויות אמיתיות (2+ משפחות עם תלמיד/בוגר)
            </div>
            {canWrite && groups.length > 0 && (
              <Button variant="secondary" onClick={mergeAll} disabled={!!busyKey}>
                מזג הכל ({groups.length})
              </Button>
            )}
          </div>
          {orphanCount > 0 && (
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
              <span>
                ℹ️ קיימות במערכת <strong>{orphanCount}</strong> משפחות ללא אף תלמיד או בוגר (רשומות ריקות,
                כנראה שאריות מרישומים שבוטלו). הן לא מוצגות כאן.
              </span>
              {canWrite && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={cleanupOrphans}
                  disabled={!!busyKey}
                >
                  {busyKey?.startsWith('__orphans__') ? (busyKey.split(':')[1] ? `מוחק ${busyKey.split(':')[1]}` : 'מוחק...') : '🗑️ נקה משפחות יתומות'}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {scanned && groups.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg border border-gray-200 text-gray-500">
          ✓ לא נמצאו כפילויות משפחה
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const target = pickTarget(g);
          return (
            <div key={g.key} className="bg-white border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                  {g.reason} · {g.families.length} משפחות
                </span>
                {canWrite && (
                  <Button size="sm" onClick={() => mergeGroup(g)} disabled={busyKey === g.key}>
                    {busyKey === g.key ? 'ממזג...' : '⤵ מזג'}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr>
                      <th className="text-start px-2 py-1"></th>
                      <th className="text-start px-2 py-1">אב</th>
                      <th className="text-start px-2 py-1">ת"ז אב</th>
                      <th className="text-start px-2 py-1">טלפון אב</th>
                      <th className="text-start px-2 py-1">עיר</th>
                      <th className="text-start px-2 py-1">תלמידים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.families.map((f) => {
                      const kids = g.studentsByFamily[f.id] || [];
                      const isTarget = f.id === target.id;
                      return (
                        <tr key={f.id} className={`border-t border-gray-100 ${isTarget ? 'bg-emerald-50' : ''}`}>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {isTarget ? <span className="text-emerald-700 text-xs font-semibold">יעד ✓</span> : ''}
                          </td>
                          <td className="px-2 py-1">{fld(f, 'father_name')}</td>
                          <td className="px-2 py-1" dir="ltr">{fld(f, 'father_id_number')}</td>
                          <td className="px-2 py-1" dir="ltr">{fld(f, 'father_phone')}</td>
                          <td className="px-2 py-1">{fld(f, 'city')}</td>
                          <td className="px-2 py-1">
                            {kids.length === 0 && !g.gradsByFamily[f.id] ? (
                              <span className="text-gray-400">ריקה</span>
                            ) : (
                              <>
                                {kids.map((s) => `${s.last_name} ${s.first_name}${s.shiur ? ` (${s.shiur})` : ''}`).join(', ')}
                                {g.gradsByFamily[f.id] > 0 && (
                                  <span className="text-indigo-600 text-xs">
                                    {kids.length ? ' · ' : ''}{g.gradsByFamily[f.id]} בוגר{g.gradsByFamily[f.id] > 1 ? 'ים' : ''}
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                המיזוג יעביר את כל התלמידים למשפחת היעד (הירוקה), ישלים שדות חסרים ממנה, וימחק את הכפילות.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
