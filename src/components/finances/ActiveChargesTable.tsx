'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Family, TuitionCharge } from '@/lib/types';
import { useTuitionLifecycle } from '@/hooks/useTuitionLifecycle';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';

const methodLabels: Record<string, string> = {
  standing_order: 'הוראת קבע',
  check: 'צ"ק',
  credit: 'אשראי',
  office: 'במשרד',
  exempt: 'פטור',
};

export function ActiveChargesTable() {
  const { cancelCharge } = useTuitionLifecycle();

  const [charges, setCharges] = useState<TuitionCharge[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tuition_charges')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    setCharges((data as TuitionCharge[]) || []);

    const familyIds = [...new Set((data || []).map((c: any) => c.family_id as string))];
    const familyMap: Record<string, Family> = {};
    for (const fid of familyIds) {
      const { data: fData } = await supabase.from('families').select('*').eq('id', fid).maybeSingle();
      if (fData) familyMap[fid] = fData as Family;
    }
    setFamilies(familyMap);
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

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  if (charges.length === 0) {
    return <div className="text-center py-8 text-gray-500">אין גביות פעילות</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableCell isHeader>משפחה</TableCell>
          <TableCell isHeader>סכום חודשי</TableCell>
          <TableCell isHeader>תלמידים</TableCell>
          <TableCell isHeader>שיטה</TableCell>
          <TableCell isHeader>יום גביה</TableCell>
          <TableCell isHeader>פעולות</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {charges.map((charge) => {
          const family = families[charge.family_id];
          const isCredit = charge.payment_method === 'credit';
          return (
            <TableRow key={charge.id}>
              <TableCell>{family?.family_name || 'לא ידוע'}</TableCell>
              <TableCell className="font-semibold">
                ₪{charge.total_amount_per_month.toLocaleString('he-IL')}
              </TableCell>
              <TableCell>{charge.student_ids?.length || 0}</TableCell>
              <TableCell>
                <Badge variant={isCredit ? 'primary' : 'gray'}>
                  {methodLabels[charge.payment_method] || charge.payment_method}
                </Badge>
                {isCredit && charge.external_charge_id && (
                  <span className="text-xs text-gray-400 ms-2" title="מזהה נדרים פלוס">
                    #{charge.external_charge_id}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {charge.scheduled_day_of_month ? `${charge.scheduled_day_of_month} לחודש` : '—'}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleCancel(charge.id)}
                  disabled={cancellingId === charge.id}
                >
                  {cancellingId === charge.id ? 'מבטל...' : 'בטל גביה'}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
