'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { SHIURIM_SECTIONS, KIBBUTZ_SECTIONS } from '@/lib/dorm-map';

// Storage key in system_settings
const SETTING_KEY = 'dormitory_layout';

interface LayoutSection {
  id: string;
  title: string;
  category: 'shiurim' | 'kibbutz';
  rows: (number | string)[][];
}

function toEditText(rows: (number | string)[][]): string {
  // Each row on a line, comma-separated; empty cells = --
  return rows
    .map((row) => row.map((c) => (c === '' || c === null || c === undefined ? '--' : String(c))).join(', '))
    .join('\n');
}

function fromEditText(text: string): (number | string)[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line.split(',').map((part) => {
        const t = part.trim();
        if (t === '--' || t === '') return '';
        const num = parseInt(t, 10);
        return isNaN(num) ? t : num;
      })
    );
}

const DEFAULTS: LayoutSection[] = [
  ...SHIURIM_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    rows: [...(s.rows as any), ...((s.extraRooms || []) as any)],
  })),
  ...KIBBUTZ_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    rows: [...(s.rows as any)],
  })),
];

export default function DormitoryEditPage() {
  const { getSetting, setSetting } = useSystemSettings();
  const [sections, setSections] = useState<LayoutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const saved = await getSetting<LayoutSection[] | null>(SETTING_KEY, null);
      setSections(saved && Array.isArray(saved) && saved.length > 0 ? saved : DEFAULTS);
      setLoading(false);
    }
    load();
  }, [getSetting]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const ok = await setSetting(SETTING_KEY, sections);
    setStatus(ok ? '✅ נשמר בהצלחה' : '❌ שגיאה בשמירה');
    setSaving(false);
  };

  const handleResetToDefault = () => {
    if (!confirm('לאפס את כל העריכות ולחזור לברירת המחדל?')) return;
    setSections(DEFAULTS);
  };

  const addSection = (category: 'shiurim' | 'kibbutz') => {
    const id = `new-${Date.now()}`;
    setSections((prev) => [...prev, { id, title: 'קומה חדשה', category, rows: [[101, 102, 103]] }]);
  };

  const updateSection = (idx: number, patch: Partial<LayoutSection>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const deleteSection = (idx: number) => {
    if (!confirm('למחוק את הסקציה?')) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const copy = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= copy.length) return copy;
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  if (loading) return <div className="p-8">טוען...</div>;

  return (
    <>
      <Header title="עריכת מפת הפנימייה" subtitle="בנה פעם אחת ושמור - יוצג במפה" />

      <div className="p-4 md:p-8 space-y-6">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <p className="font-semibold mb-2">הוראות:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>כל סקציה = קומה / איזור (למשל &quot;קומה 2 - צפון&quot;)</li>
            <li>כל שורה בתיבת העריכה = שורה ויזואלית של חדרים</li>
            <li>מפרידים את המספרים בפסיקים: <code>211, 212, 213, 224, 225, 226</code></li>
            <li>תא ריק (להזחה): <code>--</code></li>
            <li>תא עם טקסט (כגון &quot;דירת רה״י&quot;): פשוט כתוב את הטקסט</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? 'שומר...' : '💾 שמור'}
          </Button>
          <Button variant="secondary" onClick={handleResetToDefault}>
            אפס לברירת מחדל
          </Button>
          <Button variant="secondary" onClick={() => addSection('shiurim')}>
            + הוסף סקציה (שיעורים)
          </Button>
          <Button variant="secondary" onClick={() => addSection('kibbutz')}>
            + הוסף סקציה (קיבוץ)
          </Button>
          {status && <span className="text-sm">{status}</span>}
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={section.id + idx} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  section.category === 'shiurim' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {section.category === 'shiurim' ? 'שיעורים' : 'קיבוץ'}
                </span>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateSection(idx, { title: e.target.value })}
                  className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg font-bold"
                  placeholder="כותרת הסקציה"
                />
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => moveSection(idx, -1)} disabled={idx === 0}>↑</Button>
                  <Button size="sm" variant="secondary" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1}>↓</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteSection(idx)}>🗑️</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Editor */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">שורות (כל שורה = שורה במפה)</label>
                  <textarea
                    value={toEditText(section.rows)}
                    onChange={(e) => updateSection(idx, { rows: fromEditText(e.target.value) })}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                    placeholder="111, 112, 113, 124, 125, 126"
                  />
                </div>
                {/* Preview */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">תצוגה מקדימה</label>
                  <div className="border border-gray-300 rounded-lg p-2 bg-gray-50">
                    {section.rows.map((row, ri) => (
                      <div key={ri} className="flex gap-1 justify-center mb-1">
                        {row.map((cell, ci) => (
                          <div
                            key={ci}
                            className={`w-16 h-12 border rounded flex items-center justify-center text-xs ${
                              cell === '' ? 'border-transparent' : 'border-gray-400 bg-white'
                            }`}
                          >
                            {typeof cell === 'string' && cell !== '' ? (
                              <span className="text-[10px] text-center">{cell}</span>
                            ) : (
                              <span className="text-gray-600">{cell}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? 'שומר...' : '💾 שמור'}
          </Button>
          {status && <span className="text-sm flex items-center">{status}</span>}
        </div>
      </div>
    </>
  );
}
