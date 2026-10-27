'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// ימות המשיח (מלגות "שבתות" etc.). The API token itself is the YEMOT_API_TOKEN env var
// in Vercel — never stored here, because system_settings is readable by every user.

export function YemotSettings() {
  const { getSetting, setSetting } = useSystemSettings();
  const [path, setPath] = useState('ivr2:/11/ApprovalAll.ymgr');
  const [systemNumber, setSystemNumber] = useState('');
  const [auto, setAuto] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [lastPull, setLastPull] = useState<{ at: string; inserted: number; total: number; auto: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [breakdown, setBreakdown] = useState<{ byExt: Record<string, { count: number; first: string | null; last: string | null }>; used: string[] } | null>(null);

  const load = useCallback(async () => {
    setPath(await getSetting<string>('yemot_ymgr_path', 'ivr2:/11/ApprovalAll.ymgr'));
    setSystemNumber(await getSetting<string>('yemot_system_number', ''));
    setAuto(await getSetting<boolean>('yemot_auto_enabled', false));
    setLastPull(await getSetting<any>('yemot_last_pull', null));
    fetch('/api/scholarships/yemot-import').then((r) => r.json()).then((j) => setTokenConfigured(!!j.tokenConfigured)).catch(() => setTokenConfigured(null));
  }, [getSetting]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    const ok = (await Promise.all([
      setSetting('yemot_ymgr_path', path.trim()),
      setSetting('yemot_system_number', systemNumber.trim()),
      setSetting('yemot_auto_enabled', auto),
    ])).every(Boolean);
    setStatus(ok ? '✅ נשמר' : '❌ שגיאה בשמירה');
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setStatus('⏳ בודק חיבור…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/scholarships/yemot-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json();
      if (!j.ok) { setStatus(`❌ ${j.error}`); setBreakdown(null); }
      else {
        setStatus(`✅ מחובר (${j.path}): ${j.totalRecords} רשומות בקובץ · ${j.relevant} נקלטות (שלוחות ${(j.extensions || []).join(', ') || '—'})${j.lastCall ? ` · שיחה אחרונה ${new Date(j.lastCall).toLocaleString('he-IL')}` : ''}`);
        setBreakdown({ byExt: j.byExt || {}, used: j.extensions || [] });
      }
    } catch (e: any) { setStatus('❌ ' + e.message); }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">📞 ימות המשיח (מלגות)</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className={`text-sm rounded-lg px-3 py-2 ${tokenConfigured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {tokenConfigured === null ? 'בודק…' : tokenConfigured
              ? '✅ טוקן ה-API מוגדר ב-Vercel (YEMOT_API_TOKEN)'
              : '⚠️ חסר משתנה הסביבה YEMOT_API_TOKEN ב-Vercel (Settings → Environment Variables), ואחריו Redeploy'}
          </div>
          <Input label="נתיב קובץ הנתונים בימות" value={path} onChange={(e) => setPath(e.target.value)} dir="ltr" />
          <Input label="מספר מערכת (לתצוגה בלבד)" value={systemNumber} onChange={(e) => setSystemNumber(e.target.value)} dir="ltr" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            משיכה אוטומטית יומית (רק שומרת שיחות חדשות כממתינות — לא יוצרת חיובים)
          </label>
          {lastPull && (
            <p className="text-xs text-slate-500">משיכה אחרונה: {new Date(lastPull.at).toLocaleString('he-IL')} · {lastPull.inserted} חדשות מתוך {lastPull.total}{lastPull.auto ? ' (אוטומטית)' : ''}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>שמור</Button>
            <Button variant="secondary" onClick={test} disabled={busy}>בדוק חיבור</Button>
          </div>
          {status && <p className="text-sm">{status}</p>}
          {breakdown && (
            <table className="text-xs border border-slate-200 rounded-lg">
              <thead><tr className="bg-slate-50"><th className="px-2 py-1 text-start">שלוחה בקובץ</th><th className="px-2 py-1">רשומות</th><th className="px-2 py-1">מתאריך</th><th className="px-2 py-1">עד תאריך</th><th className="px-2 py-1">נקלט?</th></tr></thead>
              <tbody>
                {Object.entries(breakdown.byExt).sort((a, b) => (b[1].last || '').localeCompare(a[1].last || '')).map(([ext, b]) => (
                  <tr key={ext} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-semibold" dir="ltr">{ext}</td>
                    <td className="px-2 py-1 text-center tabular-nums">{b.count}</td>
                    <td className="px-2 py-1 tabular-nums">{b.first ? new Date(b.first).toLocaleDateString('he-IL') : '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{b.last ? new Date(b.last).toLocaleDateString('he-IL') : '—'}</td>
                    <td className="px-2 py-1 text-center">{breakdown.used.includes(ext) ? '✅' : '— מתעלם'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
