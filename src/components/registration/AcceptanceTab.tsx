'use client';

import { useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';
import Link from 'next/link';

interface Props {
  registrations: Registration[];
  onChanged: () => void;
  canDecide: boolean;
}

export function AcceptanceTab({ registrations, onChanged, canDecide }: Props) {
  const { setStatus, acceptAndConvert } = useRegistrations();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {!canDecide && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          ⚠️ רק מנהל יכול לסמן קבלה / דחייה / להמיר רישומים לתלמידים.
        </div>
      )}

      {candidates.length === 0 && converted.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-5xl mb-3 opacity-40">✓</p>
          <p className="text-slate-500 text-base font-medium">אין רישומים בהמתנה לקבלה</p>
        </div>
      ) : (
        <>
          {/* Accepted candidates that haven't been converted yet */}
          {candidates.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50 to-white">
                <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                  ממתינים להחלטה / קבלה
                </h3>
                <p className="text-xs text-slate-500">{candidates.length} נבחנים</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold">שם</th>
                      <th className="px-3 py-2 text-start font-semibold">ישיבה קטנה</th>
                      <th className="px-3 py-2 text-start font-semibold">אב</th>
                      <th className="px-3 py-2 text-start font-semibold">מבחן</th>
                      <th className="px-3 py-2 text-start font-semibold">סטטוס</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          {r.last_name} {r.first_name}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.prev_yeshiva_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.father_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {r.test_date ? `${r.test_date}` : '—'}
                          {r.test_grade && <span className="ms-1 font-bold text-slate-900">· ציון {r.test_grade}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={r.status} />
                        </td>
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
          {converted.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
                <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                  הומרו לתלמידים (שיעור 0)
                </h3>
                <p className="text-xs text-slate-500">{converted.length} תלמידים</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold">שם</th>
                      <th className="px-3 py-2 text-start font-semibold">ישיבה קטנה</th>
                      <th className="px-3 py-2 text-start font-semibold">תאריך המרה</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {converted.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.last_name} {r.first_name}</td>
                        <td className="px-3 py-2 text-slate-700">{r.prev_yeshiva_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {r.decided_at ? new Date(r.decided_at).toLocaleDateString('he-IL') : '—'}
                        </td>
                        <td className="px-3 py-2 text-end">
                          {r.converted_to_student_id && (
                            <Link
                              href={`/students/${r.converted_to_student_id}`}
                              className="text-xs text-blue-700 hover:underline font-semibold"
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
