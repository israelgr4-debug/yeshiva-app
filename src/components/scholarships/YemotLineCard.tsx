'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { SectionCard } from './shared';

// The ימות line is open only between enter_after_time and enter_foldar_end_time in the
// entry extension's ext.ini (see /api/scholarships/yemot-line). Shows the state and lets
// admin/secretary change the window, open now, or close now.

interface LineState { ok: boolean; error?: string; path?: string; openAt: string | null; closeAt: string | null; now: string; isOpen: boolean; redirect: string | null }

const fmt = (v: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}` : '—');

async function call(method: 'GET' | 'POST', body?: any): Promise<LineState> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch('/api/scholarships/yemot-line', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export function YemotLineCard({ canWrite }: { canWrite: boolean }) {
  const [st, setSt] = useState<LineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await call('GET');
      setSt(s);
      if (s.ok) { setOpenAt(s.openAt || ''); setCloseAt(s.closeAt || ''); }
    } catch (e: any) { setSt({ ok: false, error: e.message } as LineState); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (body: any, question: string) => {
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const s = await call('POST', body);
      if (!s.ok) alert('❌ ' + s.error);
      else { setSt(s); setOpenAt(s.openAt || ''); setCloseAt(s.closeAt || ''); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <SectionCard title="📞 מצב הקו בימות" accent="from-blue-500 to-indigo-600"
      actions={<button type="button" className="text-xs text-blue-600 hover:underline" onClick={load} disabled={loading}>🔄 רענן</button>}>
      {loading ? <div className="text-sm text-slate-400">בודק מול ימות…</div> : !st?.ok ? (
        <div className="text-sm text-red-700">❌ {st?.error || 'שגיאה'}</div>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-xl px-3 py-2 text-sm font-medium ${st.isOpen ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {st.isOpen
              ? <>🟢 הקו <b>פתוח</b> — ייסגר ב-{fmt(st.closeAt)}</>
              : st.openAt && st.now < st.openAt
                ? <>🔴 הקו <b>סגור</b> — ייפתח ב-{fmt(st.openAt)} ועד {fmt(st.closeAt)}</>
                : <>🔴 הקו <b>סגור</b> — נסגר ב-{fmt(st.closeAt)}</>}
            <span className="text-xs font-normal text-slate-500 ms-2">({st.path}{st.redirect ? ` → שלוחה ${st.redirect}` : ''})</span>
          </div>

          {canWrite && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-600 flex flex-col">נפתח ב-
                  <input type="datetime-local" className={input} value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
                </label>
                <label className="text-xs text-slate-600 flex flex-col">נסגר ב-
                  <input type="datetime-local" className={input} value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
                </label>
                <Button size="sm" disabled={busy || !openAt || !closeAt}
                  onClick={() => apply({ open_at: openAt, close_at: closeAt }, `לקבוע שהקו ייפתח ב-${fmt(openAt)} וייסגר ב-${fmt(closeAt)}?`)}>
                  💾 שמור חלון זמנים
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {!st.isOpen && (
                  <Button size="sm" variant="secondary" disabled={busy || !closeAt || closeAt <= st.now}
                    title={!closeAt || closeAt <= st.now ? 'קבע קודם "נסגר ב-" עתידי' : ''}
                    onClick={() => apply({ action: 'open_now', close_at: closeAt }, `לפתוח את הקו עכשיו, עד ${fmt(closeAt)}?`)}>
                    🟢 פתח עכשיו (עד {fmt(closeAt)})
                  </Button>
                )}
                {st.isOpen && (
                  <Button size="sm" variant="danger" disabled={busy}
                    onClick={() => apply({ action: 'close_now' }, 'לסגור את הקו עכשיו? מתקשרים ישמעו הודעת סגירה.')}>
                    🔴 סגור עכשיו
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">משנה רק את שני מועדי הפתיחה והסגירה בקובץ השלוחה; לפני כל שינוי נשמר עותק של הקובץ הקודם.</p>
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
