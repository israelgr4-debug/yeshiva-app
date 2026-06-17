'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { PageGuard } from '@/components/ui/PageGuard';
import { supabase } from '@/lib/supabase';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  changed_columns: string[] | null;
  created_at: string;
}

// --- Hebrew field labels (used in change descriptions) ---
const FIELD_LABEL: Record<string, string> = {
  first_name: 'שם פרטי', last_name: 'שם משפחה',
  status: 'סטטוס', shiur: 'שיעור', machzor_id: 'מחזור',
  institution_name: 'מוסד', is_chinuch: 'חינוך',
  phone: 'טלפון', email: 'אימייל', date_of_birth: 'תאריך לידה',
  id_number: 'ת.ז', passport_number: 'דרכון',
  notes: 'הערות', equivalent_year: 'כיתה מקבילה',
  admission_date: 'תאריך קבלה', exit_date: 'תאריך יציאה',
  family_id: 'משפחה', room_number: 'חדר',
  health_fund_code: 'קופת חולים', health_fund_name: 'קופת חולים',
  // family
  father_name: 'שם האב', mother_name: 'שם האם',
  father_phone: 'טלפון אב', mother_phone: 'טלפון אם',
  father_id_number: 'ת.ז אב', mother_id_number: 'ת.ז אם',
  address: 'כתובת', city: 'עיר', home_phone: 'טלפון בית',
  bank_name: 'בנק', bank_branch: 'סניף', bank_account: 'מס חשבון',
  yichus_code: 'ייחוס', yichus_name: 'ייחוס',
  neighborhood_code: 'שכונה',
  // tuition
  payment_method: 'שיטת תשלום', monthly_amount: 'סכום חודשי',
  bank_day: 'יום חיוב', active: 'פעיל לחיוב',
  nedarim_subscription_id: 'הוראת קבע אשראי',
  // payment_history
  amount_ils: 'סכום', payment_date: 'תאריך תשלום',
  status_code: 'סטטוס', status_name: 'סטטוס',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל', chizuk: 'בחיזוק', inactive: 'לא פעיל', graduated: 'סיים',
};
const METHOD_LABEL: Record<string, string> = {
  bank_ho: 'הו"ק בנק', credit_nedarim: 'אשראי (נדרים)', office: 'משרד',
  exempt: 'פטור', none: 'לא משלם', cash: 'מזומן',
  check: 'צ׳ק', transfer: 'העברה',
};
const STATUS_CODE_LABEL: Record<number, string> = {
  1: 'לחיוב (צפי)', 2: 'נפרע', 3: 'חזר', 4: 'לא לחייב', 5: 'שידור מרוכז', 9: 'בוטל',
};

// --- Action-meta per table ---
const TABLE_EMOJI: Record<string, string> = {
  students: '👨‍🎓', families: '👨‍👩‍👦', student_tuition: '💰',
  payment_history: '🏦', office_payments: '💵', one_time_charges: '📝',
  registrations: '📋', graduates: '🎓',
  nedarim_action_queue: '⚡', tuition_charges: '💳',
  app_users: '👤', system_settings: '⚙️',
};

const TABLE_LABEL: Record<string, string> = {
  students: 'תלמיד', families: 'משפחה', student_tuition: 'שכר לימוד',
  payment_history: 'תשלום', office_payments: 'תשלום משרד',
  one_time_charges: 'הוראת קבע חד-פעמית',
  registrations: 'רישום', graduates: 'בוגר',
  nedarim_action_queue: 'פעולת נדרים', tuition_charges: 'הוראת חיוב',
  app_users: 'משתמש', system_settings: 'הגדרות',
};

function fmtVal(v: any, key?: string): string {
  if (v === null || v === undefined || v === '') return '(ריק)';
  if (key === 'status' && typeof v === 'string' && STATUS_LABEL[v]) return STATUS_LABEL[v];
  if (key === 'payment_method' && typeof v === 'string' && METHOD_LABEL[v]) return METHOD_LABEL[v];
  if (key === 'status_code' && typeof v === 'number' && STATUS_CODE_LABEL[v]) return STATUS_CODE_LABEL[v];
  if (key === 'amount_ils' || key === 'monthly_amount' || key === 'amount') {
    return `₪${Number(v).toLocaleString('he-IL')}`;
  }
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface ChangeFragment {
  field: string;
  from: string;
  to: string;
}

/** Builds an array of {field, from, to} for UPDATE rows. */
function buildChanges(row: AuditRow): ChangeFragment[] {
  if (row.action !== 'UPDATE') return [];
  const cols = row.changed_columns || [];
  // Filter noise: updated_at / created_at / id
  const skip = new Set(['updated_at', 'created_at', 'id']);
  const out: ChangeFragment[] = [];
  for (const c of cols) {
    if (skip.has(c)) continue;
    const oldV = row.old_data?.[c];
    const newV = row.new_data?.[c];
    out.push({
      field: FIELD_LABEL[c] || c,
      from: fmtVal(oldV, c),
      to: fmtVal(newV, c),
    });
  }
  return out;
}

/** A short subject string identifying the affected entity. */
function subjectOf(row: AuditRow): string {
  const d = row.new_data || row.old_data || {};
  switch (row.table_name) {
    case 'students':
      return [d.first_name, d.last_name].filter(Boolean).join(' ') || 'תלמיד';
    case 'families':
      return d.family_name || [d.father_name].filter(Boolean).join(' ') || 'משפחה';
    case 'graduates':
      return [d.first_name, d.last_name].filter(Boolean).join(' ') || 'בוגר';
    case 'registrations':
      return [d.first_name, d.last_name].filter(Boolean).join(' ') || 'מועמד';
    case 'app_users':
      return d.full_name || d.email || 'משתמש';
    default:
      return '';
  }
}

/** A one-line headline summarizing the event. */
function summarize(row: AuditRow): string {
  const subj = subjectOf(row);
  const tbl = TABLE_LABEL[row.table_name] || row.table_name;

  if (row.action === 'INSERT') {
    switch (row.table_name) {
      case 'students':         return `הוספה תלמיד חדש: ${subj}`;
      case 'families':         return `הוספה משפחה חדשה: ${subj}`;
      case 'student_tuition':  return `הוגדר שכר לימוד לתלמיד`;
      case 'payment_history':  return `נוצרה רשומת תשלום (${fmtVal(row.new_data?.amount_ils, 'amount_ils')}, ${fmtVal(row.new_data?.status_code, 'status_code')})`;
      case 'office_payments':  return `התקבל תשלום במשרד (${fmtVal(row.new_data?.amount, 'amount_ils')}, ${METHOD_LABEL[row.new_data?.method] || row.new_data?.method || ''})`;
      case 'one_time_charges': return `נוספה הוראת קבע חד-פעמית (${fmtVal(row.new_data?.amount, 'amount_ils')})`;
      case 'nedarim_action_queue': return `נוצרה פעולה בתור נדרים: ${row.new_data?.action || ''}`;
      case 'registrations':    return `הוספה מועמד חדש: ${subj}`;
      case 'graduates':        return `הוספה בוגר: ${subj}`;
      default:                 return `נוצרה רשומה ב${tbl}${subj ? ` (${subj})` : ''}`;
    }
  }

  if (row.action === 'DELETE') {
    return `נמחקה רשומה ב${tbl}${subj ? `: ${subj}` : ''}`;
  }

  // UPDATE
  const changes = buildChanges(row);
  // Special-case: status change is the most important thing
  const statusChange = changes.find((c) => c.field === 'סטטוס' && row.table_name === 'students');
  if (statusChange) {
    return `${subj}: סטטוס שונה מ"${statusChange.from}" ל"${statusChange.to}"`;
  }
  if (row.table_name === 'student_tuition') {
    const methodChange = changes.find((c) => c.field === 'שיטת תשלום');
    const activeChange = changes.find((c) => c.field === 'פעיל לחיוב');
    if (methodChange) return `שונתה שיטת תשלום: ${methodChange.from} → ${methodChange.to}`;
    if (activeChange) return `שכר לימוד ${activeChange.to === 'כן' ? 'הופעל' : 'הופסק'} לתלמיד`;
    return `עודכנו פרטי שכר לימוד`;
  }
  if (row.table_name === 'payment_history') {
    const sc = changes.find((c) => c.field === 'סטטוס');
    if (sc) return `תשלום: סטטוס שונה מ"${sc.from}" ל"${sc.to}"`;
    return `עודכנה רשומת תשלום`;
  }
  // Generic
  if (changes.length === 0) return `עדכון ב${tbl}${subj ? ` (${subj})` : ''}`;
  if (changes.length === 1)
    return `${subj ? `${subj}: ` : ''}שונה ${changes[0].field}: ${changes[0].from} → ${changes[0].to}`;
  return `${subj ? `${subj}: ` : ''}עודכנו ${changes.length} שדות (${changes.map((c) => c.field).slice(0, 3).join(', ')}${changes.length > 3 ? '...' : ''})`;
}

function fmtDT(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

function dateBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const ystd = new Date(); ystd.setDate(today.getDate() - 1);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (ymd(d) === ymd(today)) return 'היום';
  if (ymd(d) === ymd(ystd))  return 'אתמול';
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function SecretaryActivityPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [secretaries, setSecretaries] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
  const [userFilter, setUserFilter] = useState<string>('all'); // 'all' or user_id
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState<number>(30);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Get the list of secretary users (for the dropdown + for filtering)
    const { data: users } = await supabase
      .from('app_users')
      .select('id, email, full_name, role')
      .in('role', ['secretary']);
    setSecretaries((users || []) as any);
    const secretaryIds = (users || []).map((u: any) => u.id);

    // Load audit log
    const since = new Date();
    since.setDate(since.getDate() - days);
    let q = supabase
      .from('audit_log')
      .select('*')
      .eq('user_role', 'secretary')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);
    if (secretaryIds.length > 0) q = q.in('user_id', secretaryIds);
    const { data } = await q;
    setRows((data || []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let l = rows;
    if (userFilter !== 'all') l = l.filter((r) => r.user_id === userFilter);
    if (actionFilter !== 'all') l = l.filter((r) => r.action === actionFilter);
    if (tableFilter !== 'all') l = l.filter((r) => r.table_name === tableFilter);
    const q = search.trim();
    if (q) {
      l = l.filter((r) => {
        const blob = JSON.stringify(r.new_data || {}) + JSON.stringify(r.old_data || {}) + (r.user_email || '');
        return blob.includes(q);
      });
    }
    return l;
  }, [rows, userFilter, actionFilter, tableFilter, search]);

  // Group by date bucket
  const grouped = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      const key = dateBucket(r.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const tableOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.table_name);
    return Array.from(set).sort();
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, INSERT: 0, UPDATE: 0, DELETE: 0 };
    for (const r of rows) c[r.action] = (c[r.action] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <PageGuard requires="admin" message="מסך מעקב פעולות מזכירה - למנהל ראשי בלבד.">
    <>
      <Header
        title="מעקב פעולות מזכירה"
        subtitle="כל מה שביצעו משתמשי 'מזכירה' לאחרונה, בשפה ברורה"
      />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link href="/settings" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ← הגדרות
          </Link>
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            🔄 רענן
          </Button>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(['all', 'INSERT', 'UPDATE', 'DELETE'] as const).map((k) => {
            const meta = {
              all:    { label: 'כל הפעולות', emoji: '📋', color: 'bg-slate-50 text-slate-700' },
              INSERT: { label: 'הוספות',     emoji: '➕', color: 'bg-emerald-50 text-emerald-700' },
              UPDATE: { label: 'עדכונים',    emoji: '✏️', color: 'bg-blue-50 text-blue-700' },
              DELETE: { label: 'מחיקות',     emoji: '🗑',  color: 'bg-red-50 text-red-700' },
            }[k];
            const active = actionFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActionFilter(k)}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'
                } ${meta.color}`}
              >
                <div className="text-2xl font-bold tabular-nums">{counts[k] || 0}</div>
                <div className="text-xs">{meta.emoji} {meta.label}</div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3 items-center">
              {secretaries.length > 1 && (
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">כל המזכירות</option>
                  {secretaries.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              )}
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">כל הסוגים</option>
                {tableOptions.map((t) => (
                  <option key={t} value={t}>{TABLE_EMOJI[t] || ''} {TABLE_LABEL[t] || t}</option>
                ))}
              </select>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value={1}>היום בלבד</option>
                <option value={7}>7 ימים אחרונים</option>
                <option value={30}>30 ימים אחרונים</option>
                <option value={90}>90 ימים אחרונים</option>
                <option value={365}>שנה אחרונה</option>
              </select>
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש בטקסט הפעולה..."
                  className="w-full px-3 py-2 pl-9 border border-gray-300 rounded-lg text-sm"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              </div>
              <span className="text-sm text-gray-500">
                {filtered.length.toLocaleString('he-IL')} פעולות
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-5xl mb-2 opacity-40">🤷</p>
                <p>לא נמצאו פעולות מזכירה בטווח הזה</p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map(([day, items]) => (
                  <div key={day}>
                    <h3 className="text-sm font-bold text-slate-600 mb-2 sticky top-0 bg-white/95 backdrop-blur py-1 z-10">
                      📅 {day} ({items.length})
                    </h3>
                    <div className="space-y-2">
                      {items.map((r) => {
                        const headline = summarize(r);
                        const isExpanded = expandedId === r.id;
                        const changes = buildChanges(r);
                        const actionMeta = {
                          INSERT: { color: 'border-emerald-300 bg-emerald-50/30' },
                          UPDATE: { color: 'border-blue-300 bg-blue-50/30' },
                          DELETE: { color: 'border-red-300 bg-red-50/30' },
                        }[r.action];
                        return (
                          <div
                            key={r.id}
                            className={`border rounded-lg p-3 ${actionMeta.color}`}
                          >
                            <div className="flex justify-between items-start gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-900 flex items-center gap-2">
                                  <span className="text-lg">{TABLE_EMOJI[r.table_name] || '•'}</span>
                                  <span>{headline}</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                  {fmtDT(r.created_at)} · {r.user_email}
                                  {r.record_id && r.table_name === 'students' && (
                                    <Link
                                      href={`/students/${r.record_id}`}
                                      className="ml-2 text-blue-600 hover:underline mr-2"
                                    >פתח כרטיס →</Link>
                                  )}
                                </div>
                              </div>
                              {(changes.length > 0 || r.action !== 'UPDATE') && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                                  className="text-xs text-blue-700 hover:underline whitespace-nowrap"
                                >
                                  {isExpanded ? '▲ סגור' : '▼ פרטים'}
                                </button>
                              )}
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-200/50 text-sm">
                                {r.action === 'UPDATE' && changes.length > 0 ? (
                                  <table className="w-full text-xs">
                                    <thead className="text-slate-500">
                                      <tr>
                                        <th className="text-start font-semibold py-1">שדה</th>
                                        <th className="text-start font-semibold py-1">היה</th>
                                        <th className="text-start font-semibold py-1">→</th>
                                        <th className="text-start font-semibold py-1">נהיה</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {changes.map((c, i) => (
                                        <tr key={i} className="border-t border-slate-100">
                                          <td className="py-1 font-medium text-slate-700">{c.field}</td>
                                          <td className="py-1 text-slate-500 line-through">{c.from}</td>
                                          <td className="py-1 text-slate-400">→</td>
                                          <td className="py-1 font-semibold text-emerald-700">{c.to}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : r.action === 'INSERT' && r.new_data ? (
                                  <details>
                                    <summary className="cursor-pointer text-xs text-slate-600">JSON של הרשומה החדשה</summary>
                                    <pre className="text-xs bg-slate-50 rounded p-2 mt-1 overflow-x-auto max-h-60" dir="ltr">
                                      {JSON.stringify(r.new_data, null, 2)}
                                    </pre>
                                  </details>
                                ) : r.action === 'DELETE' && r.old_data ? (
                                  <details>
                                    <summary className="cursor-pointer text-xs text-slate-600">JSON של הרשומה שנמחקה</summary>
                                    <pre className="text-xs bg-slate-50 rounded p-2 mt-1 overflow-x-auto max-h-60" dir="ltr">
                                      {JSON.stringify(r.old_data, null, 2)}
                                    </pre>
                                  </details>
                                ) : (
                                  <p className="text-xs text-slate-500 italic">אין פרטים נוספים</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4 text-center">
              מוצגות עד 1000 פעולות אחרונות. מבוסס על טבלת audit_log.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
    </PageGuard>
  );
}
