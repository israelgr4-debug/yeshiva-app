'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Family, TuitionCharge } from '@/lib/types';
import { useTuitionLifecycle } from '@/hooks/useTuitionLifecycle';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';

const methodLabels: Record<string, string> = {
  standing_order: 'הוראת קבע',
  check: 'צ"ק',
  credit: 'אשראי',
  office: 'במשרד',
  exempt: 'פטור',
};

const statusLabels: Record<string, { label: string; variant: any }> = {
  active: { label: 'פעיל', variant: 'success' },
  suspended: { label: 'מושהה', variant: 'warning' },
  cancelled: { label: 'בוטל', variant: 'gray' },
};

type SortKey = 'family' | 'amount' | 'method' | 'day' | 'status';
type SortDir = 'asc' | 'desc';

export function ActiveChargesTable() {
  const { cancelCharge } = useTuitionLifecycle();

  const [charges, setCharges] = useState<TuitionCharge[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'active' | 'cancelled' | 'all'>('active');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('family');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    // Paginate through all charges (PostgREST caps at 1000)
    const all: TuitionCharge[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase
        .from('tuition_charges')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (!data || data.length === 0) break;
      all.push(...(data as TuitionCharge[]));
      if (data.length < 1000) break;
    }
    setCharges(all);

    // Load all families (also paginated)
    const allFamilies: Family[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase.from('families').select('*').range(from, to);
      if (!data || data.length === 0) break;
      allFamilies.push(...(data as Family[]));
      if (data.length < 1000) break;
    }
    const famMap: Record<string, Family> = {};
    for (const f of allFamilies) famMap[f.id] = f;
    setFamilies(famMap);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancel = async (chargeId: string) => {
    const reason = window.prompt('סיבת הביטול (אופציונלי):', 'ביטול ידני');
    if (reason === null) return;

    setCancellingId(chargeId);
    const res = await cancelCharge(chargeId, reason || 'ביטול ידני');
    setCancellingId(null);

    if (res.success) {
      alert('הגביה בוטלה בהצלחה');
      loadData();
    } else {
      alert('שגיאה בביטול: ' + (res.error || 'לא ידוע'));
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Filter + sort
  const filtered = useMemo(() => {
    let result = charges;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Method filter
    if (methodFilter) {
      result = result.filter((c) => c.payment_method === methodFilter);
    }

    // Search - smart: matches family name, father name, amount, payment method
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => {
        const family = families[c.family_id];
        const hayStack = [
          family?.family_name,
          family?.father_name,
          family?.mother_name,
          family?.city,
          String(c.total_amount_per_month),
          methodLabels[c.payment_method],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hayStack.includes(q);
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      const famA = families[a.family_id];
      const famB = families[b.family_id];
      switch (sortKey) {
        case 'family':
          cmp = (famA?.family_name || '').localeCompare(famB?.family_name || '', 'he');
          break;
        case 'amount':
          cmp = (a.total_amount_per_month || 0) - (b.total_amount_per_month || 0);
          break;
        case 'method':
          cmp = (methodLabels[a.payment_method] || '').localeCompare(
            methodLabels[b.payment_method] || '',
            'he'
          );
          break;
        case 'day':
          cmp = (a.scheduled_day_of_month || 0) - (b.scheduled_day_of_month || 0);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [charges, families, statusFilter, methodFilter, searchQuery, sortKey, sortDir]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, methodFilter, searchQuery, sortKey, sortDir]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

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

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  const activeCount = charges.filter((c) => c.status === 'active').length;
  const cancelledCount = charges.filter((c) => c.status === 'cancelled').length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SearchInput
          placeholder="חיפוש: משפחה, הורה, סכום..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">פעיל ({activeCount})</option>
          <option value="cancelled">בוטל ({cancelledCount})</option>
          <option value="all">הכל ({charges.length})</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">כל שיטות התשלום</option>
          {Object.entries(methodLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex items-center text-sm text-gray-600">
          {filtered.length} מתוך {charges.length}
          {totalPages > 1 && <span className="ms-2 text-gray-400">(עמ' {page}/{totalPages})</span>}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">אין תוצאות</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader><SortHeader label="משפחה" sortK="family" /></TableCell>
                  <TableCell isHeader><SortHeader label="סכום חודשי" sortK="amount" /></TableCell>
                  <TableCell isHeader>תלמידים</TableCell>
                  <TableCell isHeader><SortHeader label="שיטה" sortK="method" /></TableCell>
                  <TableCell isHeader><SortHeader label="יום גביה" sortK="day" /></TableCell>
                  <TableCell isHeader><SortHeader label="סטטוס" sortK="status" /></TableCell>
                  <TableCell isHeader>פעולות</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((charge) => {
                  const family = families[charge.family_id];
                  const isCredit = charge.payment_method === 'credit';
                  const status = statusLabels[charge.status] || { label: charge.status, variant: 'gray' };
                  return (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <span className="font-medium">{family?.family_name || 'לא ידוע'}</span>
                        {family?.father_name && (
                          <span className="text-gray-500 text-xs block">{family.father_name}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        ₪{charge.total_amount_per_month.toLocaleString('he-IL')}
                      </TableCell>
                      <TableCell>{charge.student_ids?.length || 0}</TableCell>
                      <TableCell>
                        <Badge variant={isCredit ? 'primary' : 'gray'}>
                          {methodLabels[charge.payment_method] || charge.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {charge.scheduled_day_of_month ? `${charge.scheduled_day_of_month}` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {charge.status === 'active' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleCancel(charge.id)}
                            disabled={cancellingId === charge.id}
                          >
                            {cancellingId === charge.id ? 'מבטל...' : 'בטל'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {pageItems.map((charge) => {
              const family = families[charge.family_id];
              const status = statusLabels[charge.status] || { label: charge.status, variant: 'gray' };
              return (
                <div
                  key={charge.id}
                  className="bg-white border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold">{family?.family_name || 'לא ידוע'}</p>
                      {family?.father_name && (
                        <p className="text-xs text-gray-500">{family.father_name}</p>
                      )}
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg">
                      ₪{charge.total_amount_per_month.toLocaleString('he-IL')}
                    </span>
                    <span className="text-xs text-gray-600">
                      {methodLabels[charge.payment_method] || charge.payment_method}
                      {charge.scheduled_day_of_month ? ` • יום ${charge.scheduled_day_of_month}` : ''}
                    </span>
                  </div>
                  {charge.status === 'active' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleCancel(charge.id)}
                      disabled={cancellingId === charge.id}
                      className="w-full"
                    >
                      {cancellingId === charge.id ? 'מבטל...' : 'בטל גביה'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={() => setPage(1)} disabled={page === 1}>ראשון</Button>
              <Button size="sm" variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>הקודם</Button>
              <span className="text-sm text-gray-600 px-2">עמוד {page} מתוך {totalPages}</span>
              <Button size="sm" variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>הבא</Button>
              <Button size="sm" variant="secondary" onClick={() => setPage(totalPages)} disabled={page === totalPages}>אחרון</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
