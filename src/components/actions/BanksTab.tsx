'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

export function BanksTab() {
  const [importing, setImporting] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [lastImported, setLastImported] = useState<string | null>(null);

  const loadStats = async () => {
    const { count: c } = await supabase
      .from('bank_branches')
      .select('*', { count: 'exact', head: true });
    setCount(c || 0);

    const { data: latest } = await supabase
      .from('bank_branches')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    setLastImported(latest?.[0]?.updated_at || null);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleImport = async () => {
    if (!confirm('לייבא את כל הסניפים מבנק ישראל? זה ייקח 1-2 דקות.')) return;
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/banks/import-branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      const s = json.summary;
      alert(
        `✓ הייבוא הושלם\n\n` +
          `נמשכו: ${s.fetched}\n` +
          `עודכנו: ${s.upserted}\n` +
          (s.errors?.length ? `שגיאות: ${s.errors.slice(0, 3).join(', ')}` : '')
      );
      await loadStats();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setImporting(false);
    }
  };

  const formatDT = (iso: string | null) => {
    if (!iso) return 'אף פעם';
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">🏦 ייבוא סניפי בנקים</h3>
        <p className="text-sm text-gray-600 mb-4">
          ייבוא נתוני הסניפים (שם, כתובת, טלפון) מ-Bank of Israel open data.
          מעדכן ~13,000 סניפים. נעזר בזה כדי להציג אוטומטית את שם הסניף כשמקישים
          את מספרו בטופסי התלמיד.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-600">סניפים במערכת</p>
            <p className="text-3xl font-bold text-blue-700">
              {count !== null ? count.toLocaleString('he-IL') : '...'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-600">עדכון אחרון</p>
            <p className="text-sm font-bold text-gray-700 mt-2">{formatDT(lastImported)}</p>
          </div>
        </div>
        <Button onClick={handleImport} disabled={importing}>
          {importing ? '⏳ מייבא... (1-2 דקות)' : '📥 ייבוא/עדכון סניפים'}
        </Button>
        <p className="text-xs text-gray-500 mt-3">
          מומלץ לרענן פעם בחודש-חודשיים. הפעולה לא מוחקת סניפים ישנים, רק מעדכנת.
        </p>
      </div>
    </div>
  );
}
