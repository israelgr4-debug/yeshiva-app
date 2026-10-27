'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { YemotRecording } from '@/lib/yemot-recordings';

// Recordings are streamed through our API (the ימות token stays on the server), so the
// <audio> element gets a blob: URL fetched with the user's session.

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ''}` };
}

export async function fetchRecordings(from?: string, to?: string): Promise<YemotRecording[]> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const r = await fetch(`/api/scholarships/yemot-recordings?${qs}`, { headers: await authHeader() });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'שגיאה בטעינת ההקלטות');
  return j.items as YemotRecording[];
}

/** ▶️ button that turns into a player once loaded. */
export function RecordingPlayer({ what, compact }: { what: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const load = async () => {
    setState('loading');
    try {
      const r = await fetch(`/api/scholarships/yemot-recordings?file=${encodeURIComponent(what)}`, { headers: await authHeader() });
      if (!r.ok) throw new Error();
      const u = URL.createObjectURL(await r.blob());
      urlRef.current = u;
      setUrl(u);
      setState('idle');
    } catch { setState('error'); }
  };

  if (url) return <audio src={url} controls autoPlay className={compact ? 'h-8 w-56 max-w-full' : 'h-9 w-72 max-w-full'} />;
  return (
    <button type="button" onClick={load} disabled={state === 'loading'}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-60"
      title="השמע הקלטה">
      {state === 'loading' ? '⏳' : state === 'error' ? '⚠️ נסה שוב' : '▶️ הקלטה'}
    </button>
  );
}
