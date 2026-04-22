'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAuth } from '@/hooks/useAuth';
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

const TABLE_LABELS: Record<string, string> = {
  students: 'תלמידים',
  families: 'משפחות',
  machzorot: 'מחזורים',
  education_history: 'היסטוריית לימודים',
  student_periods: 'תקופות כניסה/יציאה',
  donations: 'תרומות',
  tuition_charges: 'גביות',
  tuition_payments: 'תשלומים',
  app_users: 'משתמשים',
  system_settings: 'הגדרות',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: 'הוסף', color: 'bg-green-50 text-green-700' },
  UPDATE: { label: 'עדכן', color: 'bg-blue-50 text-blue-700' },
  DELETE: { label: 'מחק', color: 'bg-red-50 text-red-700' },
};

export default function AuditLogPage() {
  const { permissions } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [page, setPage] = useState(1);
  const perPage = 50;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000); // cap to last 5000 for performance

      if (filterAction) q = q.eq('action', filterAction);
      if (filterTable) q = q.eq('table_name', filterTable);
      if (filterUser) q = q.ilike('user_email', `%${filterUser}%`);
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate) q = q.lte('created_at', toDate + 'T23:59:59');

      const { data, error } = await q;
      if (error) throw error;
      setRows((data || []) as AuditRow[]);
    } catch (err: any) {
      alert('שגיאה: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterTable, filterUser, fromDate, toDate]);

  useEffect(() => {
    if (permissions.isAdmin) load();
  }, [permissions.isAdmin, load]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.user_email,
        r.record_id,
        r.table_name,
        JSON.stringify(r.old_data),
        JSON.stringify(r.new_data),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => setPage(1), [searchQuery, filterAction, filterTable, filterUser, fromDate, toDate]);

  if (!permissions.isAdmin) {
    return (
      <>
        <Header title="יומן פעולות" />
        <div className="p-8 text-center text-gray-500">אין לך הרשאה לגשת לעמוד זה</div>
      </>
    );
  }

  return (
    <>
      <Header title="יומן פעולות" subtitle="תיעוד מלא של כל פעולה במערכת" />

      <div className="p-4 md:p-8 space-y-4">
        {/* Filters */}
        <Card>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <SearchInput
                placeholder="חיפוש חופשי..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">כל הפעולות</option>
                <option value="INSERT">הוסף</option>
                <option value="UPDATE">עדכן</option>
                <option value="DELETE">מחק</option>
              </select>
              <select
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">כל הטבלאות</option>
                {Object.entries(TABLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                type="text"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                placeholder="דוא״ל משתמש"
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                title="מתאריך"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
                title="עד תאריך"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <Button size="sm" variant="secondary" onClick={load}>רענן</Button>
              <span>{filtered.length} פעולות</span>
              {totalPages > 1 && <span className="text-gray-400">(עמוד {page}/{totalPages})</span>}
            </div>
          </CardContent>
        </Card>

        {/* Entries */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">פעולות</h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">טוען...</div>
            ) : pageRows.length === 0 ? (
              <div className="py-8 text-center text-gray-500">אין פעולות</div>
            ) : (
              <div className="space-y-2">
                {pageRows.map((r) => {
                  const action = ACTION_LABELS[r.action] || { label: r.action, color: 'bg-gray-100' };
                  const isExpanded = expandedId === r.id;
                  return (
                    <div key={r.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="w-full text-right p-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '◄'}</span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString('he-IL')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${action.color}`}>
                            {action.label}
                          </span>
                          <span className="font-medium">{TABLE_LABELS[r.table_name] || r.table_name}</span>
                          <span className="text-xs text-gray-500">{r.record_id}</span>
                          <span className="mr-auto text-xs text-gray-600">
                            {r.user_email || 'לא ידוע'}
                            {r.user_role && <span className="ms-1 text-gray-400">({r.user_role})</span>}
                          </span>
                        </div>

                        {r.changed_columns && r.changed_columns.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.changed_columns.map((c) => (
                              <span key={c} className="text-xs bg-yellow-50 text-yellow-700 px-1.5 rounded">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3">
                          <DiffView row={r} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => setPage(1)} disabled={page === 1}>ראשון</Button>
            <Button size="sm" variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>הקודם</Button>
            <span className="text-sm px-2 self-center">{page} / {totalPages}</span>
            <Button size="sm" variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>הבא</Button>
            <Button size="sm" variant="secondary" onClick={() => setPage(totalPages)} disabled={page === totalPages}>אחרון</Button>
          </div>
        )}
      </div>
    </>
  );
}

function DiffView({ row }: { row: AuditRow }) {
  if (row.action === 'DELETE') {
    return (
      <div>
        <h4 className="font-semibold text-sm text-red-700 mb-2">נתונים שנמחקו:</h4>
        <pre className="bg-red-50 border border-red-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap" dir="ltr">
          {JSON.stringify(row.old_data, null, 2)}
        </pre>
      </div>
    );
  }

  if (row.action === 'INSERT') {
    return (
      <div>
        <h4 className="font-semibold text-sm text-green-700 mb-2">נתונים שנוספו:</h4>
        <pre className="bg-green-50 border border-green-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap" dir="ltr">
          {JSON.stringify(row.new_data, null, 2)}
        </pre>
      </div>
    );
  }

  // UPDATE - show side-by-side diff
  const cols = row.changed_columns || [];
  return (
    <div>
      <h4 className="font-semibold text-sm text-blue-700 mb-2">שינויים ({cols.length} שדות):</h4>
      <table className="w-full text-xs">
        <thead className="bg-white">
          <tr>
            <th className="px-2 py-1 text-start">שדה</th>
            <th className="px-2 py-1 text-start">לפני</th>
            <th className="px-2 py-1 text-start">אחרי</th>
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => {
            const oldV = row.old_data?.[c];
            const newV = row.new_data?.[c];
            return (
              <tr key={c} className="border-t border-gray-200">
                <td className="px-2 py-1 font-medium whitespace-nowrap">{c}</td>
                <td className="px-2 py-1 bg-red-50 text-red-900" dir="auto">
                  {formatVal(oldV)}
                </td>
                <td className="px-2 py-1 bg-green-50 text-green-900" dir="auto">
                  {formatVal(newV)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
