'use client';

import { useEffect, useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';
import {
  DOC_FIELDS,
  exportFullDetailsExcel,
  exportChecklistExcel,
  printFullDetails,
  printChecklist,
} from '@/lib/registration-report';
import Link from 'next/link';

interface Props {
  registrations: Registration[];
  onChanged: () => void;
  canDecide: boolean;
  canWrite: boolean;
}

// Short column headers for the 5 document checkboxes (full text in title=)
const DOC_SHORT: Record<string, string> = {
  doc_student_id: 'ת.ז. תלמיד',
  doc_parent_id: 'ת.ז. הורה',
  doc_credit: 'אשראי',
  doc_standing_order: 'הו"ק',
  doc_medical: 'רפואי',
  doc_declaration: 'הצהרה',
};

type ExportScope = 'accepted' | 'examinees' | 'all';

export function AcceptanceTab({ registrations, onChanged, canDecide, canWrite }: Props) {
  const { setStatus, acceptAndConvert, setDoc } = useRegistrations();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportScope>('accepted');
  const [search, setSearch] = useState('');
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  // Local overlay of the 5 doc booleans so checkbox toggles are instant.
  const [docs, setDocs] = useState<Record<string, Pick<Registration, 'doc_student_id' | 'doc_parent_id' | 'doc_credit' | 'doc_standing_order' | 'doc_medical' | 'doc_declaration'>>>({});

  useEffect(() => {
    const map: typeof docs = {};
    for (const r of registrations) {
      map[r.id] = {
        doc_student_id: !!r.doc_student_id,
        doc_parent_id: !!r.doc_parent_id,
        doc_credit: !!r.doc_credit,
        doc_standing_order: !!r.doc_standing_order,
        doc_medical: !!r.doc_medical,
        doc_declaration: !!r.doc_declaration,
      };
    }
    setDocs(map);
  }, [registrations]);

  const candidates = useMemo(
    () =>
      registrations
        .filter((r) => r.status === 'tested' || r.status === 'accepted' || r.status === 'rejected')
        .sort((a, b) => {
          const order: Record<string, number> = { tested: 0, accepted: 1, rejected: 2 };
          if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
          return a.last_name.localeCompare(b.last_name, 'he');
        }),
    [registrations]
  );

  const converted = useMemo(
    () => registrations.filter((r) => r.status === 'converted'),
    [registrations]
  );

  // Free-text search over student name + father name.
  const matchesSearch = (r: Registration) => {
    const q = search.trim();
    if (!q) return true;
    return `${r.first_name || ''} ${r.last_name || ''} ${r.father_name || ''}`.includes(q);
  };
  const filteredCandidates = useMemo(() => candidates.filter(matchesSearch), [candidates, search]);
  const filteredConverted = useMemo(() => converted.filter(matchesSearch), [converted, search]);

  // Merge the local doc overlay into a registration for export/render.
  const withDocs = (r: Registration): Registration => ({ ...r, ...(docs[r.id] || {}) });

  const exportSet = useMemo(() => {
    let set: Registration[];
    if (scope === 'accepted') {
      set = registrations.filter((r) => r.status === 'accepted' || r.status === 'converted');
    } else if (scope === 'examinees') {
      set = registrations.filter((r) => ['tested', 'accepted', 'converted'].includes(r.status));
    } else {
      set = registrations.filter((r) => r.status !== 'registered');
    }
    return set.map(withDocs);
  }, [registrations, scope, docs]);

  const toggleDoc = async (r: Registration, field: keyof typeof DOC_SHORT) => {
    if (!canWrite) return;
    const cur = docs[r.id]?.[field as keyof (typeof docs)[string]] ?? false;
    const next = !cur;
    // optimistic
    setDocs((prev) => ({ ...prev, [r.id]: { ...prev[r.id], [field]: next } }));
    try {
      await setDoc(r.id, field as any, next);
    } catch (e: any) {
      // revert on error
      setDocs((prev) => ({ ...prev, [r.id]: { ...prev[r.id], [field]: cur } }));
      alert('שגיאה בשמירת הצרופה: ' + (e?.message || e));
    }
  };

  const handleAccept = async (r: Registration) => {
    if (!canDecide) {
      alert('רק מנהל יכול לאשר קבלה');
      return;
    }
    setBusyId(r.id);
    try {
      await setStatus(r.id, 'accepted');
      onChanged();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (r: Registration) => {
    if (!canDecide) return;
    if (!confirm(`לסמן את ${r.first_name} ${r.last_name} כלא התקבל?`)) return;
    setBusyId(r.id);
    try {
      await setStatus(r.id, 'rejected');
      onChanged();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const handleConvert = async (r: Registration) => {
    if (!canDecide) return;
    if (!confirm(
      `להמיר את ${r.first_name} ${r.last_name} לתלמיד?\n\n` +
      'תיווצר רשומת תלמיד בשיעור 0, וכן רשומת משפחה אם לא קיימת.'
    )) return;
    setBusyId(r.id);
    try {
      const { studentId } = await acceptAndConvert(r.id);
      onChanged();
      if (confirm('הומר בהצלחה. לפתוח את כרטיס התלמיד?')) {
        window.open(`/students/${studentId}`, '_blank');
      }
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  // All 'accepted' registrations in the currently shown set (year-filtered by
  // the parent page) - candidates for bulk conversion to שיעור 0 students.
  const acceptedList = useMemo(
    () => registrations.filter((r) => r.status === 'accepted'),
    [registrations]
  );

  const handleConvertAll = async () => {
    if (!canDecide) { alert('רק מנהל יכול להמיר'); return; }
    if (acceptedList.length === 0) return;
    const typed = prompt(
      `המרת כל המתקבלים לתלמידים\n\n` +
      `${acceptedList.length} מתקבלים יומרו לתלמידים בשיעור 0 (תיווצר משפחה לכל אחד אם אין).\n` +
      `ניתן להריץ שוב בהמשך לחדשים.\n\n` +
      `לאישור הקלד: המר`
    );
    if (typed === null) return;
    if (typed.trim() !== 'המר') { alert('הפעולה בוטלה — לא הוקלד "המר".'); return; }

    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    for (let i = 0; i < acceptedList.length; i++) {
      const r = acceptedList[i];
      setBulkProgress(`ממיר ${i + 1}/${acceptedList.length}...`);
      try {
        await acceptAndConvert(r.id);
        ok++;
      } catch (e: any) {
        fail++;
        if (errors.length < 8) errors.push(`${r.last_name} ${r.first_name}: ${e?.message || e}`);
      }
    }
    setBulkProgress(null);
    await onChanged();
    alert(
      `הומרו: ${ok}${fail ? `\nנכשלו: ${fail}\n\n${errors.join('\n')}` : ''}`
    );
  };

  const noData = () => {
    if (exportSet.length === 0) { alert('אין נרשמים בהיקף שנבחר לייצוא'); return true; }
    return false;
  };

  return (
    <div className="space-y-4">
      {!canDecide && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          ⚠️ רק מנהל יכול לסמן קבלה / דחייה / להמיר רישומים לתלמידים.
        </div>
      )}

      {/* Bulk convert */}
      {canDecide && acceptedList.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[12rem]">
            <div className="font-bold text-emerald-900">⤴ המרה קבוצתית</div>
            <p className="text-xs text-emerald-800">
              {acceptedList.length} מתקבלים בשנה זו מוכנים להמרה לתלמידים בשיעור 0.
              הרץ לפני העלאת השנה.
            </p>
          </div>
          <Button onClick={handleConvertAll} disabled={!!bulkProgress}>
            {bulkProgress || `⤴ המר את כל המתקבלים (${acceptedList.length})`}
          </Button>
        </div>
      )}

      {/* Export toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 elevation-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
          <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
            ייצוא דוחות רישום
          </h3>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">היקף</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ExportScope)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
            >
              <option value="accepted">מתקבלים (התקבלו + הומרו) · {registrations.filter((r) => r.status === 'accepted' || r.status === 'converted').length}</option>
              <option value="examinees">כל הנבחנים (כולל ממתינים) · {registrations.filter((r) => ['tested', 'accepted', 'converted'].includes(r.status)).length}</option>
              <option value="all">הכל (כולל נדחו) · {registrations.filter((r) => r.status !== 'registered').length}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs text-slate-500 -mb-1">דוח פרטים מלא</span>
            <Button size="sm" variant="secondary" onClick={() => { if (!noData()) printFullDetails(exportSet); }}>📄 PDF</Button>
            <Button size="sm" variant="secondary" onClick={() => { if (!noData()) exportFullDetailsExcel(exportSet); }}>📊 Excel</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs text-slate-500 -mb-1">דוח צרופות</span>
            <Button size="sm" variant="secondary" onClick={() => { if (!noData()) printChecklist(exportSet); }}>📋 PDF</Button>
            <Button size="sm" variant="secondary" onClick={() => { if (!noData()) exportChecklistExcel(exportSet); }}>📊 Excel</Button>
          </div>
        </div>
      </div>

      {/* Search */}
      {(candidates.length > 0 || converted.length > 0) && (
        <input
          type="text"
          placeholder="🔍 חיפוש לפי שם תלמיד / אב..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
        />
      )}

      {candidates.length === 0 && converted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-5xl mb-3 opacity-40">✓</p>
          <p className="text-slate-500 text-base font-medium">אין רישומים בהמתנה לקבלה</p>
        </div>
      ) : filteredCandidates.length === 0 && filteredConverted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-5xl mb-3 opacity-40">🔍</p>
          <p className="text-slate-500 text-base font-medium">אין תוצאות לחיפוש "{search}"</p>
        </div>
      ) : (
        <>
          {/* Accepted candidates that haven't been converted yet */}
          {filteredCandidates.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50 to-white">
                <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                  ממתינים להחלטה / קבלה
                </h3>
                <p className="text-xs text-slate-500">{filteredCandidates.length} נבחנים · סמן ✓ ליד כל צרופה שהתלמיד הביא</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">שם</th>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">אב</th>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">מבחן</th>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">סטטוס</th>
                      {DOC_FIELDS.map((d) => (
                        <th key={d.key as string} className="px-2 py-2 text-center font-semibold whitespace-nowrap" title={d.label}>
                          {DOC_SHORT[d.key as string]}
                        </th>
                      ))}
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidates.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          {r.last_name} {r.first_name}
                        </td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.father_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                          {r.test_date ? `${r.test_date}` : '—'}
                          {r.test_grade && <span className="ms-1 font-bold text-slate-900">· ציון {r.test_grade}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={r.status} />
                        </td>
                        {DOC_FIELDS.map((d) => {
                          const on = docs[r.id]?.[d.key as keyof (typeof docs)[string]] ?? false;
                          return (
                            <td key={d.key as string} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!canWrite}
                                onChange={() => toggleDoc(r, d.key as keyof typeof DOC_SHORT)}
                                title={d.label}
                                className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-end whitespace-nowrap">
                          {r.status === 'tested' && (
                            <>
                              <Button size="sm" onClick={() => handleAccept(r)} disabled={busyId === r.id || !canDecide}>
                                ✓ קבל
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleReject(r)} disabled={busyId === r.id || !canDecide}>
                                ✕ דחה
                              </Button>
                            </>
                          )}
                          {r.status === 'accepted' && (
                            <Button size="sm" onClick={() => handleConvert(r)} disabled={busyId === r.id || !canDecide}>
                              ⤴ העבר לתלמיד (שיעור 0)
                            </Button>
                          )}
                          {r.status === 'rejected' && (
                            <Button size="sm" variant="ghost" onClick={() => handleAccept(r)} disabled={busyId === r.id || !canDecide}>
                              שנה החלטה
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Already converted */}
          {filteredConverted.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
                <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                  הומרו לתלמידים (שיעור 0)
                </h3>
                <p className="text-xs text-slate-500">{filteredConverted.length} תלמידים · סמן ✓ ליד כל צרופה שהתלמיד הביא</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">שם</th>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">אב</th>
                      <th className="px-3 py-2 text-start font-semibold whitespace-nowrap">תאריך המרה</th>
                      {DOC_FIELDS.map((d) => (
                        <th key={d.key as string} className="px-2 py-2 text-center font-semibold whitespace-nowrap" title={d.label}>
                          {DOC_SHORT[d.key as string]}
                        </th>
                      ))}
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConverted.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.last_name} {r.first_name}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.father_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                          {r.decided_at ? new Date(r.decided_at).toLocaleDateString('he-IL') : '—'}
                        </td>
                        {DOC_FIELDS.map((d) => {
                          const on = docs[r.id]?.[d.key as keyof (typeof docs)[string]] ?? false;
                          return (
                            <td key={d.key as string} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={!canWrite}
                                onChange={() => toggleDoc(r, d.key as keyof typeof DOC_SHORT)}
                                title={d.label}
                                className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-end">
                          {r.converted_to_student_id && (
                            <Link
                              href={`/students/${r.converted_to_student_id}`}
                              className="text-xs text-blue-700 hover:underline font-semibold whitespace-nowrap"
                            >
                              פתח כרטיס תלמיד ←
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    tested: 'bg-amber-50 text-amber-800 ring-amber-200',
    accepted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    rejected: 'bg-red-50 text-red-800 ring-red-200',
  };
  const label: Record<string, string> = {
    tested: 'נבחן · ממתין להחלטה',
    accepted: 'התקבל',
    rejected: 'לא התקבל',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${map[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
      {label[status] || status}
    </span>
  );
}
