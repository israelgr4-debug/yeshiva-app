'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function NedarimPlusSettings() {
  const { getSetting, setSetting } = useSystemSettings();

  const [enabled, setEnabled] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [mosadId, setMosadId] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setEnabled(await getSetting<boolean>('nedarim_plus_enabled', false));
    setApiUrl(await getSetting<string>('nedarim_plus_api_url', ''));
    setMosadId(await getSetting<string>('nedarim_plus_mosad_id', ''));
    setApiPassword(await getSetting<string>('nedarim_plus_api_password', ''));
  }, [getSetting]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const results = await Promise.all([
      setSetting('nedarim_plus_enabled', enabled),
      setSetting('nedarim_plus_api_url', apiUrl.trim()),
      setSetting('nedarim_plus_mosad_id', mosadId.trim()),
      setSetting('nedarim_plus_api_password', apiPassword.trim()),
    ]);
    if (results.every(Boolean)) {
      setStatus('✅ ההגדרות נשמרו בהצלחה');
    } else {
      setStatus('❌ שגיאה בשמירת ההגדרות');
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">נדרים פלוס (גביה באשראי)</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">
              {enabled ? 'מופעל' : 'כבוי'}
            </span>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          הגדרות ליצירה וביטול אוטומטיים של הוראות קבע באשראי דרך נדרים פלוס.
          האישורים נשמרים בצד השרת ולא נחשפים בדפדפן.
        </p>

        <div className="space-y-4">
          <Input
            label="כתובת API"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://www.matara.pro/nedarimplus/..."
          />

          <Input
            label="מזהה מוסד"
            value={mosadId}
            onChange={(e) => setMosadId(e.target.value)}
            placeholder="מספר המוסד במערכת נדרים פלוס"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סיסמת API
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={apiPassword}
                onChange={(e) => setApiPassword(e.target.value)}
                placeholder="••••••••••••"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPassword((p) => !p)}
              >
                {showPassword ? 'הסתר' : 'הצג'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mt-6">
          {status && <span className="text-sm">{status}</span>}
          <Button onClick={handleSave} disabled={saving} className="mr-auto">
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </Button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <p className="font-semibold mb-1">אינטגרציה:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>בעת יצירת גביה חודשית באשראי - תיווצר הוראת קבע בנדרים פלוס</li>
            <li>בעת שינוי סטטוס תלמיד ל"עזב/סיים/חיזוק" - הגביה תבוטל אוטומטית</li>
            <li>בעת קבלת עדכון תשלום - המערכת תסמן אוטומטית את החודש כגבוה</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
