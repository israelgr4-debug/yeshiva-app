'use client';

import { useState, useEffect } from 'react';
import { TuitionPayment, Family } from '@/lib/types';
import { useSupabase } from '@/hooks/useSupabase';
import { useTuitionPayments } from '@/hooks/useTuitionPayments';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';

export function TuitionPaymentsTable() {
  const { fetchData } = useSupabase();
  const { getTuitionPayments, updatePaymentStatus } = useTuitionPayments();

  const [payments, setPayments] = useState<TuitionPayment[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [checkNumbers, setCheckNumbers] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [filterMonth]);

  async function loadData() {
    setLoading(true);
    try {
      const paymentData = await getTuitionPayments({ month: filterMonth });
      setPayments(paymentData);

      const familyIds = [...new Set(paymentData.map((p) => p.family_id))];
      const familyMap: Record<string, Family> = {};

      for (const fid of familyIds) {
        const f = await fetchData<Family>('families', { id: fid });
        if (f.length > 0) familyMap[fid] = f[0];
      }
      setFamilies(familyMap);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkCollected(paymentId: string, paymentMethod: string) {
    const paymentDetails: Record<string, string> = {};

    if (paymentMethod === 'check') {
      const checkNum = checkNumbers[paymentId];
      if (!checkNum) {
        alert('הזן מספר צ"ק');
        return;
      }
      paymentDetails.check_number = checkNum;
    }

    const success = await updatePaymentStatus(paymentId, 'collected', paymentDetails);
    if (success) {
      await loadData();
      alert('תשלום סומן כגבוה');
    }
  }

  function handleCheckNumberChange(paymentId: string, value: string) {
    setCheckNumbers((prev) => ({ ...prev, [paymentId]: value }));
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  if (payments.length === 0) {
    return <div className="text-center py-8 text-gray-500">אין תשלומים לחודש זה</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">חודש</label>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableCell isHeader>משפחה</TableCell>
            <TableCell isHeader>סכום</TableCell>
            <TableCell isHeader>שיטה</TableCell>
            <TableCell isHeader>סטטוס</TableCell>
            <TableCell isHeader>פעולות</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell>{families[payment.family_id]?.family_name || 'לא ידוע'}</TableCell>
              <TableCell>₪{payment.total_amount.toLocaleString('he-IL')}</TableCell>
              <TableCell>{payment.payment_method}</TableCell>
              <TableCell>
                <Badge variant={payment.status === 'collected' ? 'success' : 'warning'}>
                  {payment.status === 'collected' ? 'גבוה' : 'מתוזמן'}
                </Badge>
              </TableCell>
              <TableCell>
                {payment.status === 'scheduled' && (
                  <div className="flex gap-2">
                    {payment.payment_method === 'check' && (
                      <Input
                        type="text"
                        placeholder="מס צק"
                        value={checkNumbers[payment.id] || ''}
                        onChange={(e) => handleCheckNumberChange(payment.id, e.target.value)}
                        className="w-24 text-sm"
                      />
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleMarkCollected(payment.id, payment.payment_method)}
                    >
                      גבוה
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
