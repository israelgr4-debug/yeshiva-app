'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { Family, Student } from '@/lib/types';

interface NedarimSub {
  id: string;
  nedarim_keva_id: string;
  kind: 'credit' | 'bank';
  status: string;
  amount_per_charge: number;
  scheduled_day: number | null;
  next_charge_date: string | null;
  last_4_digits: string | null;
  bank_number: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  groupe: string | null;
  client_name: string | null;
  student_ids: string[] | null;
  last_error: string | null;
}

export default function FamilyDetailPage() {
  const params = useParams<{ id: string }>();
  const familyId = params?.id;

  const [family, setFamily] = useState<Family | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [nedarimSubs, setNedarimSubs] = useState<NedarimSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    (async () => {
      setLoading(true);
      const [{ data: f }, { data: st }, { data: ns }] = await Promise.all([
        supabase.from('families').select('*').eq('id', familyId).single(),
        supabase.from('students').select('*').eq('family_id', familyId).order('first_name'),
        supabase.from('nedarim_subscriptions').select('*').eq('family_id', familyId).neq('status', 'deleted'),
      ]);
      setFamily(f as Family);
      setStudents((st || []) as Student[]);
      setNedarimSubs((ns || []) as NedarimSub[]);
      setLoading(false);
    })();
  }, [familyId]);

  const activeSubs = nedarimSubs.filter((s) => s.status === 'active');
  const frozenSubs = nedarimSubs.filter((s) => s.status !== 'active');
  const totalMonthly = activeSubs.reduce((sum, s) => sum + Number(s.amount_per_charge), 0);

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  if (loading) {
    return (
      <>
        <Header title="משפחה" subtitle="טוען..." />
        <div className="p-8 text-center text-gray-500">טוען...</div>
      </>
    );
  }

  if (!family) {
    return (
      <>
        <Header title="משפחה לא נמצאה" />
        <div className="p-8 text-center text-gray-500">
          <Link href="/families" className="text-blue-600 hover:underline">
            חזרה לרשימת משפחות
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title={family.family_name} subtitle={family.father_name} />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/families"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← רשימת משפחות
          </Link>
        </div>

        {/* Family info */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">פרטי משפחה</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">אב</p>
                <p className="font-medium">{family.father_name}</p>
                {family.father_id_number && <p className="text-gray-600">ת.ז: {family.father_id_number}</p>}
                {family.father_phone && <p className="text-gray-600">📞 {family.father_phone}</p>}
                {family.father_email && <p className="text-gray-600">✉️ {family.father_email}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">אם</p>
                <p className="font-medium">{family.mother_name}</p>
                {family.mother_id_number && <p className="text-gray-600">ת.ז: {family.mother_id_number}</p>}
                {family.mother_phone && <p className="text-gray-600">📞 {family.mother_phone}</p>}
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-500">כתובת</p>
                <p className="font-medium">
                  {[family.address, family.city, family.postal_code].filter(Boolean).join(', ')}
                </p>
                {family.home_phone && <p className="text-gray-600">🏠 {family.home_phone}</p>}
              </div>
              {family.bank_name && (
                <div className="md:col-span-2 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">פרטי בנק</p>
                  <p className="font-medium">
                    בנק {family.bank_number} {family.bank_name} · סניף {family.bank_branch} · חשבון {family.bank_account}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">תלמידים פעילים</p>
            <p className="text-2xl font-bold text-green-700">
              {students.filter((s) => s.status === 'active').length}
            </p>
            <p className="text-xs text-gray-500">מתוך {students.length}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">הוראות פעילות בנדרים</p>
            <p className="text-2xl font-bold text-blue-700">{activeSubs.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">סכום חודשי</p>
            <p className="text-2xl font-bold text-purple-700">{formatCurrency(totalMonthly)}</p>
          </div>
        </div>

        {/* Students */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">תלמידים ({students.length})</h3>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-gray-500 text-center py-4">אין תלמידים משויכים למשפחה</p>
            ) : (
              <div className="space-y-2">
                {students.map((s) => (
                  <Link
                    key={s.id}
                    href={`/students/${s.id}`}
                    className="block bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">
                          {s.first_name} {s.last_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {s.shiur && `שיעור ${s.shiur}`}
                          {s.status !== 'active' && ` · ${s.status}`}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          s.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.status === 'active' ? 'פעיל' : s.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nedarim subscriptions */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">💳 הוראות קבע בנדרים פלוס ({nedarimSubs.length})</h3>
              <Link
                href="/finances/nedarim"
                className="text-sm text-blue-600 hover:underline"
              >
                לכל הוראות הקבע →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {nedarimSubs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">אין הוראות קבע בנדרים פלוס למשפחה זו</p>
            ) : (
              <div className="space-y-2">
                {activeSubs.map((s) => (
                  <SubRow key={s.id} sub={s} />
                ))}
                {frozenSubs.length > 0 && (
                  <>
                    <div className="pt-3 text-sm font-medium text-gray-500">
                      לא פעילות / מוקפאות ({frozenSubs.length})
                    </div>
                    {frozenSubs.map((s) => (
                      <SubRow key={s.id} sub={s} />
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SubRow({ sub }: { sub: NedarimSub }) {
  const statusColor =
    sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
  const statusLabel =
    sub.status === 'active' ? 'פעיל' : sub.status === 'frozen' ? 'מוקפא' : sub.status;

  return (
    <div className={`bg-white border rounded-lg p-3 ${sub.status !== 'active' ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            {sub.kind === 'credit' ? '💳 אשראי' : '🏦 בנקאי'}
          </span>
          {sub.groupe && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              {sub.groupe}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>{statusLabel}</span>
        </div>
        <div className="text-end">
          <p className="font-bold text-lg text-green-700">
            ₪{Number(sub.amount_per_charge).toLocaleString('he-IL')}
          </p>
          <p className="text-xs text-gray-500">/ חודש</p>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {sub.scheduled_day && <span>יום חיוב: {sub.scheduled_day}</span>}
        {sub.last_4_digits && <span className="ms-2">כרטיס ****{sub.last_4_digits}</span>}
        {sub.bank_number && (
          <span className="ms-2">
            בנק {sub.bank_number}-{sub.bank_agency}-{sub.bank_account}
          </span>
        )}
        {sub.nedarim_keva_id !== '—' && <span className="ms-2">מזהה נדרים: {sub.nedarim_keva_id}</span>}
      </div>
      {sub.last_error && (
        <p className="text-xs text-red-600 mt-1">⚠ {sub.last_error}</p>
      )}
    </div>
  );
}
