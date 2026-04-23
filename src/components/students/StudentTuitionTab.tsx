'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { OfficePaymentDialog } from '@/components/finances/OfficePaymentDialog';

type PaymentMethod = 'bank_ho' | 'credit_nedarim' | 'office' | 'exempt' | 'none';

interface StudentTuition {
  id?: string;
  student_id: string;
  payment_method: PaymentMethod;
  monthly_amount: number;
  nedarim_subscription_id: string | null;
  bank_day: number | null;
  active: boolean;
  notes: string | null;
}

interface NedarimSub {
  id: string;
  nedarim_keva_id: string;
  amount_per_charge: number;
  last_4_digits: string | null;
  scheduled_day: number | null;
  client_name: string | null;
  student_ids: string[] | null;
  status: string;
}

interface SiblingAssignment {
  student_id: string;
  student_name: string;
  nedarim_subscription_id: string;
  monthly_amount: number;
}

interface UnifiedPayment {
  id: string;
  source: 'credit' | 'office' | 'bank';
  amount: number;
  payment_date: string;
  status: string;
  status_text: string | null;
  category: string | null;
  confirmation: string | null;
  last_4: string | null;
  note: string | null;
}

interface Props {
  studentId: string;
  familyId?: string;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_ho: 'הוראת קבע בנקאית (מס"ב)',
  credit_nedarim: 'הוראת קבע אשראי (נדרים)',
  office: 'תשלום במשרד',
  exempt: 'פטור',
  none: 'לא משלם',
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  bank_ho: 'bg-blue-100 text-blue-800',
  credit_nedarim: 'bg-purple-100 text-purple-800',
  office: 'bg-green-100 text-green-800',
  exempt: 'bg-gray-100 text-gray-700',
  none: 'bg-red-100 text-red-700',
};

const SOURCE_LABELS: Record<string, string> = {
  credit: '💳 אשראי',
  bank: '🏦 מס"ב',
  office: '💰 משרד',
};

export function StudentTuitionTab({ studentId, familyId }: Props) {
  const [tuition, setTuition] = useState<StudentTuition | null>(null);
  const [familyNedarimSubs, setFamilyNedarimSubs] = useState<NedarimSub[]>([]);
  const [siblingAssignments, setSiblingAssignments] = useState<SiblingAssignment[]>([]);
  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [officeDialogOpen, setOfficeDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: subs }, { data: pays }, { data: siblings }] = await Promise.all([
      supabase.from('student_tuition').select('*').eq('student_id', studentId).maybeSingle(),
      familyId
        ? supabase
            .from('nedarim_subscriptions')
            .select('id, nedarim_keva_id, amount_per_charge, last_4_digits, scheduled_day, client_name, student_ids, status')
            .eq('family_id', familyId)
            .eq('status', 'active')
        : Promise.resolve({ data: [] }),
      supabase
        .from('student_payments_unified')
        .select('*')
        .eq('student_id', studentId)
        .order('payment_date', { ascending: false })
        .limit(500),
      // Siblings' tuition assignments (to detect HK sharing / conflicts)
      familyId
        ? supabase
            .from('student_tuition')
            .select('student_id, nedarim_subscription_id, monthly_amount, students!inner(family_id, first_name, last_name)')
            .eq('students.family_id', familyId)
            .neq('student_id', studentId)
            .not('nedarim_subscription_id', 'is', null)
        : Promise.resolve({ data: [] }),
    ]);

    setSiblingAssignments(
      ((siblings || []) as any[]).map((row) => ({
        student_id: row.student_id,
        student_name: `${row.students.first_name} ${row.students.last_name}`,
        nedarim_subscription_id: row.nedarim_subscription_id,
        monthly_amount: Number(row.monthly_amount) || 0,
      }))
    );

    setTuition(
      t ||
        ({
          student_id: studentId,
          payment_method: 'none',
          monthly_amount: 0,
          nedarim_subscription_id: null,
          bank_day: 20,
          active: true,
          notes: null,
        } as StudentTuition)
    );
    setFamilyNedarimSubs((subs || []) as NedarimSub[]);
    setPayments((pays || []) as UnifiedPayment[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [studentId, familyId]);

  const handleSave = async () => {
    if (!tuition) return;

    // Guard: check if we're assigning an HK that's already taken by a sibling
    if (
      tuition.payment_method === 'credit_nedarim' &&
      tuition.nedarim_subscription_id
    ) {
      const conflicts = siblingAssignments.filter(
        (s) => s.nedarim_subscription_id === tuition.nedarim_subscription_id
      );
      const sub = familyNedarimSubs.find((s) => s.id === tuition.nedarim_subscription_id);
      const hkAmount = Number(sub?.amount_per_charge) || 0;
      const siblingsTotal = conflicts.reduce((sum, c) => sum + c.monthly_amount, 0);
      const projectedTotal = siblingsTotal + Number(tuition.monthly_amount);

      if (conflicts.length > 0) {
        // There are siblings already on this HK
        const siblingsList = conflicts
          .map((c) => `  • ${c.student_name} - ₪${c.monthly_amount.toLocaleString('he-IL')}`)
          .join('\n');
        const remaining = hkAmount - siblingsTotal;

        // Check if original was also on this HK vs reassigning
        const wasOnThisHK =
          (tuition.id || false) && siblingAssignments.every((s) => s.nedarim_subscription_id !== tuition.nedarim_subscription_id)
            ? false
            : false; // simplified - always warn

        let warning = `⚠️ שים לב!\n\nההוק הזו (₪${hkAmount.toLocaleString('he-IL')}) כבר משויכת לאחים:\n${siblingsList}\n\n`;
        warning += `סך התלמידים כרגע: ₪${siblingsTotal.toLocaleString('he-IL')}\n`;
        warning += `אתה מוסיף: ₪${Number(tuition.monthly_amount).toLocaleString('he-IL')}\n`;
        warning += `סה"כ צפוי: ₪${projectedTotal.toLocaleString('he-IL')}\n\n`;

        if (Math.abs(projectedTotal - hkAmount) > 0.01) {
          warning += `❌ אי-התאמה! ההוק בבנק/אשראי היא ₪${hkAmount.toLocaleString('he-IL')} (חסר/עודף: ₪${Math.abs(hkAmount - projectedTotal).toLocaleString('he-IL')})\n\n`;
          warning += `זה אומר שלא כל הסכום יכוסה או שיגבה יותר מהצורך.\n`;
          warning += `רוצה לבצע את השיוך בכל זאת?`;
        } else {
          warning += `✓ סך הסכומים מתאים להוק. להמשיך?`;
          void remaining;
          void wasOnThisHK;
        }

        if (!confirm(warning)) {
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        student_id: studentId,
        payment_method: tuition.payment_method,
        monthly_amount: Number(tuition.monthly_amount) || 0,
        nedarim_subscription_id:
          tuition.payment_method === 'credit_nedarim' ? tuition.nedarim_subscription_id : null,
        bank_day:
          tuition.payment_method === 'bank_ho' ? Number(tuition.bank_day) || 20 : null,
        notes: tuition.notes,
        active: true,
      };
      const { error } = await supabase
        .from('student_tuition')
        .upsert(payload, { onConflict: 'student_id' });
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  if (!tuition) return null;

  const totalPaid = payments
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      {/* Setup: how does this student pay */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">אופן תשלום שכר לימוד</h4>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">שיטת תשלום</label>
            <select
              value={tuition.payment_method}
              onChange={(e) =>
                setTuition((t) =>
                  t ? { ...t, payment_method: e.target.value as PaymentMethod, nedarim_subscription_id: null } : t
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {/* Method-specific fields */}
          {tuition.payment_method === 'credit_nedarim' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                הוראת קבע בנדרים (של המשפחה)
              </label>
              {familyNedarimSubs.length === 0 ? (
                <p className="text-sm text-amber-600">
                  ⚠️ לא נמצאה הוראת קבע אשראי פעילה במשפחה זו בנדרים
                </p>
              ) : (
                <select
                  value={tuition.nedarim_subscription_id || ''}
                  onChange={(e) =>
                    setTuition((t) => (t ? { ...t, nedarim_subscription_id: e.target.value || null } : t))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- בחר הוראה --</option>
                  {familyNedarimSubs.map((s) => {
                    const coverage = s.student_ids?.length || 0;
                    const parts: string[] = [`${formatCurrency(Number(s.amount_per_charge))} / חודש`];
                    if (s.last_4_digits) parts.push(`****${s.last_4_digits}`);
                    if (s.scheduled_day) parts.push(`יום ${s.scheduled_day}`);

                    // Check sibling assignments on this HK
                    const siblingsOnHK = siblingAssignments.filter((sa) => sa.nedarim_subscription_id === s.id);
                    const siblingsTotal = siblingsOnHK.reduce((sum, sa) => sum + sa.monthly_amount, 0);
                    const remaining = Number(s.amount_per_charge) - siblingsTotal;

                    if (siblingsOnHK.length > 0) {
                      parts.push(`🔒 ${siblingsOnHK.length} אחים משויכים (נותר ₪${remaining.toLocaleString('he-IL')})`);
                    } else if (coverage > 1) {
                      parts.push(`מכסה ${coverage} תלמידים`);
                    }

                    return (
                      <option key={s.id} value={s.id}>
                        {parts.join(' · ')}
                      </option>
                    );
                  })}
                </select>
              )}
              {tuition.nedarim_subscription_id && (
                <MultiStudentWarning
                  subscription={familyNedarimSubs.find((s) => s.id === tuition.nedarim_subscription_id)}
                  currentStudentId={studentId}
                />
              )}
            </div>
          )}

          {tuition.payment_method === 'bank_ho' && (
            <Input
              label="יום חיוב בחודש"
              type="number"
              min={1}
              max={31}
              value={String(tuition.bank_day ?? 20)}
              onChange={(e) => setTuition((t) => (t ? { ...t, bank_day: Number(e.target.value) || 20 } : t))}
            />
          )}

          {tuition.payment_method !== 'exempt' && tuition.payment_method !== 'none' && (
            <Input
              label="סכום חודשי (₪)"
              type="number"
              min={0}
              step={10}
              value={String(tuition.monthly_amount || '')}
              onChange={(e) =>
                setTuition((t) => (t ? { ...t, monthly_amount: Number(e.target.value) || 0 } : t))
              }
            />
          )}

          <div>
            <label className="block text-sm font-medium mb-1">הערות</label>
            <textarea
              value={tuition.notes || ''}
              onChange={(e) => setTuition((t) => (t ? { ...t, notes: e.target.value } : t))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">שיטת תשלום</p>
          <p className={`inline-block font-bold px-2 py-1 rounded text-sm ${METHOD_COLORS[tuition.payment_method]}`}>
            {METHOD_LABELS[tuition.payment_method]}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">סכום חודשי</p>
          <p className="text-2xl font-bold text-green-700">
            {formatCurrency(tuition.monthly_amount)}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">סה"כ שולם בפועל</p>
          <p className="text-2xl font-bold text-purple-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-gray-500">
            {payments.filter((p) => p.status === 'success').length} תשלומים
          </p>
        </div>
      </div>

      {/* Office payment button */}
      {tuition.payment_method === 'office' && (
        <div className="flex justify-end">
          <Button onClick={() => setOfficeDialogOpen(true)}>💰 רשום תשלום שהתקבל במשרד</Button>
        </div>
      )}

      {/* Payment history (all sources unified) */}
      {payments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">היסטוריית תשלומים</h4>
            {tuition.payment_method !== 'office' && (
              <Button size="sm" variant="secondary" onClick={() => setOfficeDialogOpen(true)}>
                + תשלום נוסף במשרד
              </Button>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-start">תאריך</th>
                  <th className="px-3 py-2 text-start">מקור</th>
                  <th className="px-3 py-2 text-start">סכום</th>
                  <th className="px-3 py-2 text-start">סטטוס</th>
                  <th className="px-3 py-2 text-start">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 100).map((p) => (
                  <tr key={p.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-xs">{p.payment_date || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {SOURCE_LABELS[p.source] || p.source}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatCurrency(p.amount)}</td>
                    <td className={`px-3 py-2 text-xs ${
                      p.status === 'success' ? 'text-green-700' :
                      p.status === 'returned' ? 'text-red-700' :
                      'text-gray-500'
                    }`}>
                      {p.status_text || p.status}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {p.last_4 && <span>****{p.last_4} </span>}
                      {p.confirmation && <span>· אישור {p.confirmation}</span>}
                      {p.note && <span>· {p.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length > 100 && (
              <p className="p-2 text-center text-xs text-gray-500">
                מוצגות 100 ראשונות מתוך {payments.length}
              </p>
            )}
          </div>
        </div>
      )}

      <OfficePaymentDialog
        isOpen={officeDialogOpen}
        studentId={studentId}
        defaultAmount={tuition.monthly_amount > 0 ? tuition.monthly_amount : undefined}
        onClose={() => setOfficeDialogOpen(false)}
        onDone={() => {
          setOfficeDialogOpen(false);
          load();
        }}
      />
    </div>
  );
}

function MultiStudentWarning({
  subscription,
  currentStudentId,
}: {
  subscription: NedarimSub | undefined;
  currentStudentId: string;
}) {
  if (!subscription || !subscription.student_ids || subscription.student_ids.length < 2) return null;
  const others = subscription.student_ids.filter((id) => id !== currentStudentId).length;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2 text-xs text-amber-800">
      ⚠️ ההוק הזו מכסה עוד {others} תלמידים נוספים. כל תלמיד צריך להזין את הסכום שלו בנפרד.
      סך כל הסכומים של התלמידים צריך להיות שווה לסכום ההוק ({'₪' + Number(subscription.amount_per_charge).toLocaleString('he-IL')}).
    </div>
  );
}
