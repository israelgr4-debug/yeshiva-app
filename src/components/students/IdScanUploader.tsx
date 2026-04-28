'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

interface Props {
  studentId: string;
  /** Existing storage path on the student record */
  initialPath: string | null;
  initialUploadedAt: string | null;
  /** Called after successful upload/clear so the parent can update its student state */
  onChange: (path: string | null, uploadedAt: string | null) => void;
}

const BUCKET = 'student-id-scans';

export function IdScanUploader({ studentId, initialPath, initialUploadedAt, onChange }: Props) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [uploadedAt, setUploadedAt] = useState<string | null>(initialUploadedAt);
  const [busy, setBusy] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const newPath = `${studentId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Best-effort: remove old file
      if (path && path !== newPath) {
        try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
      }

      const now = new Date().toISOString();
      const { error: dbErr } = await supabase
        .from('students')
        .update({ id_scan_path: newPath, id_scan_uploaded_at: now })
        .eq('id', studentId);
      if (dbErr) throw dbErr;

      setPath(newPath);
      setUploadedAt(now);
      onChange(newPath, now);
    } catch (err: any) {
      alert('שגיאה בהעלאה: ' + (err?.message || err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleView = async () => {
    if (!path) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30); // 30 min
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (err: any) {
      alert('שגיאה בצפייה: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!path) return;
    if (!confirm('למחוק את צילום תעודת הזהות?')) return;
    setBusy(true);
    try {
      try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
      await supabase
        .from('students')
        .update({ id_scan_path: null, id_scan_uploaded_at: null })
        .eq('id', studentId);
      setPath(null);
      setUploadedAt(null);
      onChange(null, null);
    } catch (err: any) {
      alert('שגיאה במחיקה: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
            צילום תעודת זהות / דרכון
          </p>
          {path ? (
            <p className="text-xs text-emerald-700 mt-1">
              ✓ קיים{uploadedAt ? ` · ${new Date(uploadedAt).toLocaleDateString('he-IL')}` : ''}
            </p>
          ) : (
            <p className="text-xs text-amber-700 mt-1">⚠️ אין צילום במערכת</p>
          )}
        </div>
        <div className="flex gap-2">
          {path && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={handleView} disabled={busy}>
                👁 צפה
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy}>
                🗑️
              </Button>
            </>
          )}
          <label
            className={`inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-3 py-1.5 text-sm transition-all border cursor-pointer ${
              path
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                : 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
            } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
          >
            {busy ? 'מעלה...' : path ? '🔄 החלף' : '📤 העלה'}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleUpload}
              disabled={busy}
              className="hidden"
            />
          </label>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-2">
        🔒 אזור פרטי - הקובץ מוצפן ולא חשוף ציבורית. נדרש לחיצה על &quot;צפה&quot; לפתיחה זמנית (30 דק׳).
      </p>
    </div>
  );
}
