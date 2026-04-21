'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useYearAdvance, AdvancePreview } from '@/hooks/useYearAdvance';
import { useSystemSettings, SystemSettings, DEFAULT_SETTINGS } from '@/hooks/useSystemSettings';
import { formatMachzorName } from '@/lib/shiurim';

export default function ActionsPage() {
  const { previewAdvance, executeAdvance } = useYearAdvance();
  const { getAllSettings, setSetting } = useSystemSettings();

  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [preview, setPreview] = useState<AdvancePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [editingYear, setEditingYear] = useState('');
  const [editingBase, setEditingBase] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const s = await getAllSettings();
    setSettings(s);
    setEditingYear(s.current_school_year);
    setEditingBase(s.base_machzor_for_shiur_alef);
    const p = await previewAdvance();
    setPreview(p);
    setLoading(false);
  }, [getAllSettings, previewAdvance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async () => {
    const ok1 = await setSetting('current_school_year', editingYear);
    const ok2 = await setSetting('base_machzor_for_shiur_alef', editingBase);
    if (ok1 && ok2) {
      alert('ההגדרות נשמרו בהצלחה');
      loadData();
    } else {
      alert('שגיאה בשמירת ההגדרות');
    }
  };

  const handleAdvance = async () => {
    setShowConfirm(false);
    setExecuting(true);
    setLastResult(null);

    const result = await executeAdvance();

    if (result.success) {
      setLastResult(`✅ עודכנו ${result.updatedCount} תלמידים בהצלחה`);
      // Auto-increment settings for next year
      const newBase = settings.base_machzor_for_shiur_alef + 1;
      await setSetting('base_machzor_for_shiur_alef', newBase);
      // Try to update year too (simple pattern - user can edit manually)
      loadData();
    } else {
      setLastResult(`❌ שגיאה: ${result.error || 'בעיה לא ידועה'} (עודכנו ${result.updatedCount})`);
    }

    setExecuting(false);
  };

  return (
    <>
      <Header title="פעולות" subtitle="פעולות ניהול מערכתיות" />

      <div className="p-8 space-y-6">
        {/* הגדרות בסיס */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-bold text-gray-900">הגדרות בסיס</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  שנת לימודים נוכחית
                </label>
                <input
                  type="text"
                  value={editingYear}
                  onChange={(e) => setEditingYear(e.target.value)}
                  placeholder='תשפ"ו'
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  מספר מחזור לשיעור א׳ (מתווסף אוטומטית לפי שיעור)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={editingBase}
                    onChange={(e) => setEditingBase(parseInt(e.target.value) || 0)}
                    className="w-28 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="flex items-center text-sm text-gray-600 px-2">
                    ← {formatMachzorName(editingBase)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveSettings}>שמור הגדרות</Button>
            </div>

            {/* Mapping preview */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">מיפוי נוכחי:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא'].map((letter, idx) => (
                  <div
                    key={letter}
                    className="bg-gray-50 rounded px-3 py-2 flex justify-between"
                  >
                    <span className="text-gray-600">שיעור {letter}</span>
                    <span className="font-medium text-blue-700">
                      {formatMachzorName(editingBase + idx)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* העלאת שיעור שנתית */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">העלאת שיעור שנתית</h2>
              <span className="text-sm text-gray-500">
                שנת לימודים: {settings.current_school_year}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              פעולה זו מעלה את כל התלמידים הפעילים שיעור אחד קדימה.
              שיעור יא ← קיבוץ. המחזור של כל תלמיד <strong>נשאר ללא שינוי</strong>.
            </p>

            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען נתונים...</div>
            ) : preview && preview.byShiur.length > 0 ? (
              <>
                {/* Preview table */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-blue-900 mb-3">
                    תצוגה מקדימה של השינוי:
                  </h3>
                  <div className="space-y-1 text-sm">
                    {preview.byShiur.map((row) => (
                      <div
                        key={row.fromShiur}
                        className="flex items-center gap-3 bg-white rounded px-3 py-2"
                      >
                        <span className="font-medium text-gray-700 w-24">
                          {row.fromShiur}
                        </span>
                        <span className="text-gray-400">←</span>
                        <span className="font-medium text-green-700 w-24">
                          {row.toShiur}
                        </span>
                        <span className="mr-auto bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs">
                          {row.count} תלמידים
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-blue-700 mt-3">
                    סה"כ תלמידים פעילים במערכת: {preview.totalActive}
                  </p>
                </div>

                {!showConfirm ? (
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={executing}
                    size="lg"
                    className="w-full"
                  >
                    {executing ? 'מעלה שיעורים...' : 'העלה כולם שיעור'}
                  </Button>
                ) : (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                    <p className="text-red-900 font-bold mb-1">
                      ⚠️ אישור סופי
                    </p>
                    <p className="text-sm text-red-800 mb-4">
                      פעולה זו תעלה את {preview.totalActive} תלמידים שיעור אחד קדימה.
                      הפעולה לא הפיכה. להמשיך?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAdvance}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        כן, העלה את כולם
                      </Button>
                      <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                        ביטול
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                אין תלמידים פעילים במערכת
              </div>
            )}

            {/* Result message */}
            {lastResult && (
              <div
                className={`mt-4 rounded-lg p-4 text-sm ${
                  lastResult.startsWith('✅')
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {lastResult}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
