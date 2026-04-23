'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

interface Group {
  id: string;
  name: string;
  category_type: 'tuition' | 'donation' | 'other' | 'unclassified';
  is_active: boolean;
}

interface GroupStats {
  groupe: string | null;
  count: number;
  total_amount: number;
}

const TYPE_LABELS: Record<string, string> = {
  tuition: 'שכר לימוד',
  donation: 'תרומה',
  other: 'אחר',
  unclassified: 'לא מסווג',
};

const TYPE_COLORS: Record<string, string> = {
  tuition: 'bg-blue-100 text-blue-800',
  donation: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
  unclassified: 'bg-amber-100 text-amber-800',
};

export default function NedarimGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Record<string, GroupStats>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data: g } = await supabase
      .from('nedarim_groups')
      .select('*')
      .order('name', { ascending: true });
    setGroups((g || []) as Group[]);

    // Stats per groupe
    const { data: subs } = await supabase
      .from('nedarim_subscriptions')
      .select('groupe, amount_per_charge, status')
      .eq('status', 'active');
    const byGroupe: Record<string, GroupStats> = {};
    for (const s of subs || []) {
      const k = s.groupe || '__null__';
      if (!byGroupe[k]) byGroupe[k] = { groupe: s.groupe, count: 0, total_amount: 0 };
      byGroupe[k].count++;
      byGroupe[k].total_amount += Number(s.amount_per_charge) || 0;
    }
    setStats(byGroupe);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleTypeChange = async (group: Group, newType: Group['category_type']) => {
    setSaving((prev) => ({ ...prev, [group.id]: true }));
    try {
      const { error } = await supabase
        .from('nedarim_groups')
        .update({ category_type: newType })
        .eq('id', group.id);
      if (error) throw error;
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, category_type: newType } : g)));
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSaving((prev) => ({ ...prev, [group.id]: false }));
    }
  };

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  // Summary by type
  const summary: Record<string, { count: number; monthly: number }> = {
    tuition: { count: 0, monthly: 0 },
    donation: { count: 0, monthly: 0 },
    other: { count: 0, monthly: 0 },
    unclassified: { count: 0, monthly: 0 },
  };
  for (const g of groups) {
    const s = stats[g.name];
    if (s) {
      summary[g.category_type].count += s.count;
      summary[g.category_type].monthly += s.total_amount;
    }
  }
  // Also count subscriptions without a group at all (goes to unclassified)
  const nullStats = stats['__null__'];
  if (nullStats) {
    summary.unclassified.count += nullStats.count;
    summary.unclassified.monthly += nullStats.total_amount;
  }

  return (
    <>
      <Header title="קטגוריות נדרים" subtitle="סיווג קטגוריות ל-שכר לימוד / תרומה / אחר" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances/nedarim"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← חזרה לרשימה
          </Link>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          ℹ️ סווג כל קטגוריה שמגיעה מנדרים. הצפי של שכר לימוד יחושב רק מקטגוריות המסומנות &quot;שכר לימוד&quot;.
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['tuition', 'donation', 'other', 'unclassified'] as const).map((type) => (
            <div key={type} className={`rounded-lg p-4 text-center ${TYPE_COLORS[type]}`}>
              <p className="text-xs mb-1">{TYPE_LABELS[type]}</p>
              <p className="text-2xl font-bold">{formatCurrency(summary[type].monthly)}</p>
              <p className="text-xs mt-1">{summary[type].count} הוראות</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">
              קטגוריות ({groups.length.toLocaleString('he-IL')})
            </h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                אין קטגוריות - הרץ סנכרון קודם
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">שם קטגוריה</th>
                      <th className="px-3 py-2 text-start">הוראות פעילות</th>
                      <th className="px-3 py-2 text-start">סכום חודשי</th>
                      <th className="px-3 py-2 text-start">סוג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const s = stats[g.name];
                      return (
                        <tr key={g.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{g.name}</td>
                          <td className="px-3 py-2">{s?.count || 0}</td>
                          <td className="px-3 py-2">{formatCurrency(s?.total_amount || 0)}</td>
                          <td className="px-3 py-2">
                            <select
                              value={g.category_type}
                              onChange={(e) => handleTypeChange(g, e.target.value as Group['category_type'])}
                              disabled={saving[g.id]}
                              className={`px-2 py-1 rounded text-sm ${TYPE_COLORS[g.category_type]} border-0 focus:ring-2 focus:ring-blue-500`}
                            >
                              <option value="unclassified">לא מסווג</option>
                              <option value="tuition">שכר לימוד</option>
                              <option value="donation">תרומה</option>
                              <option value="other">אחר</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
