'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSystemSettings } from '@/hooks/useSystemSettings';

// One image stored in the `signatures` bucket and referenced by a system setting
// (used for the certificate stamp — separate from the signature image).

export function ImageSettingUpload({ settingKey, title, hint, tone = 'blue' }: {
  settingKey: string;
  title: string;
  hint: string;
  tone?: 'blue' | 'purple';
}) {
  const { getSetting, setSetting } = useSystemSettings();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getSetting<string>(settingKey, '').then(setUrl); }, [getSetting, settingKey]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${settingKey.replace(/_url$/, '').replace(/_/g, '-')}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('signatures').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path);
      await setSetting(settingKey, pub.publicUrl);
      setUrl(pub.publicUrl);
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const remove = async () => {
    if (!confirm(`להסיר את ${title}?`)) return;
    await setSetting(settingKey, '');
    setUrl('');
  };

  const c = tone === 'purple'
    ? { box: 'border-purple-300 bg-purple-50', empty: 'border-purple-300 text-purple-400', btn: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200' }
    : { box: 'border-blue-300 bg-blue-50', empty: 'border-blue-300 text-blue-400', btn: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h4 className="font-semibold text-gray-800 mb-1">{title}</h4>
      <p className="text-sm text-gray-500 mb-3">{hint}</p>
      <div className="flex items-center gap-4">
        {url ? (
          <div className={`border rounded-lg p-2 ${c.box}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={title} className="h-20 max-w-xs object-contain" />
          </div>
        ) : (
          <div className={`w-48 h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-sm ${c.empty}`}>לא הועלה</div>
        )}
        <div className="flex flex-col gap-2">
          <label className={`inline-block cursor-pointer px-4 py-2 rounded-lg text-sm font-medium border text-center ${c.btn}`}>
            {busy ? 'מעלה...' : url ? 'החלף' : 'העלה'}
            <input type="file" accept="image/png,image/jpeg" onChange={upload} disabled={busy} className="hidden" />
          </label>
          {url && <button type="button" onClick={remove} className="text-sm text-red-600 hover:text-red-800 underline">הסר</button>}
        </div>
      </div>
    </div>
  );
}
