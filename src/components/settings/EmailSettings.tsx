'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { supabase } from '@/lib/supabase';

export function EmailSettings() {
  const { getSetting, setSetting } = useSystemSettings();

  const [enabled, setEnabled] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [uploadingSig, setUploadingSig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEnabled(await getSetting<boolean>('email_enabled', false));
    setFromEmail(await getSetting<string>('email_from', ''));
    setDisplayName(await getSetting<string>('email_display_name', 'ישיבת מיר מודיעין עילית'));
    setAppPassword(await getSetting<string>('email_app_password', ''));
    setSignatureUrl(await getSetting<string>('signature_url', ''));
  }, [getSetting]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const results = await Promise.all([
      setSetting('email_enabled', enabled),
      setSetting('email_from', fromEmail.trim()),
      setSetting('email_display_name', displayName.trim()),
      setSetting('email_app_password', appPassword.trim()),
    ]);
    if (results.every(Boolean)) setStatus('✅ נשמר בהצלחה');
    else setStatus('❌ שגיאה בשמירה');
    setSaving(false);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSig(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `signature-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('signatures')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path);
      const url = pub.publicUrl;
      await setSetting('signature_url', url);
      setSignatureUrl(url);
      alert('חתימה הועלתה בהצלחה');
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    } finally {
      setUploadingSig(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!confirm('להסיר את החתימה?')) return;
    await setSetting('signature_url', '');
    setSignatureUrl('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">שליחת מיילים (Gmail)</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">{enabled ? 'מופעל' : 'כבוי'}</span>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          הגדרות לשליחת אישורים ודוחות דרך Gmail. דורש <strong>סיסמת אפליקציה</strong> מהחשבון שלך
          (לא הסיסמה הרגילה - <a
            href="https://support.google.com/accounts/answer/185833"
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >מדריך</a>).
        </p>

        <div className="space-y-4">
          <Input
            label="כתובת Gmail"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="yeshiva@gmail.com"
          />

          <Input
            label="שם המוצג (From)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="ישיבת מיר מודיעין עילית"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סיסמת אפליקציה (16 תווים)
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="abcd efgh ijkl mnop"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono"
              />
              <Button type="button" variant="secondary" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? 'הסתר' : 'הצג'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ניתן להכניס עם רווחים (abcd efgh) - הרווחים מוסרים אוטומטית.
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
          {status && <span className="text-sm">{status}</span>}
          <Button onClick={handleSave} disabled={saving} className="mr-auto">
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </Button>
        </div>

        {/* Signature upload */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h4 className="text-md font-semibold mb-2">חתימה לאישורים (PNG)</h4>
          <p className="text-sm text-gray-600 mb-4">
            החתימה תופיע רק באישורים שנשלחים במייל. בהדפסה לא - תחתום ידנית.
          </p>

          <div className="flex items-center gap-4">
            {signatureUrl ? (
              <div className="border border-gray-300 rounded-lg p-2 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureUrl} alt="חתימה" className="h-20 max-w-xs object-contain" />
              </div>
            ) : (
              <div className="w-48 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                אין חתימה
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="inline-block cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium border border-blue-200 text-center">
                {uploadingSig ? 'מעלה...' : signatureUrl ? 'החלף חתימה' : 'העלה חתימה'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleSignatureUpload}
                  disabled={uploadingSig}
                  className="hidden"
                />
              </label>
              {signatureUrl && (
                <button
                  type="button"
                  onClick={handleRemoveSignature}
                  className="text-sm text-red-600 hover:text-red-800 underline"
                >
                  הסר חתימה
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
