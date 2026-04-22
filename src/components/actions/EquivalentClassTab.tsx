'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';

export function EquivalentClassTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shiurFilter, setShiurFilter] = useState<string>('שיעור א');
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  const loadStudents = async () => {
    if (!shiurFilter) return;
    setLoading(true);
    const all: Student[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase
        .from('students')
        .select('id,first_name,last_name,shiur,equivalent_year,status')
        .eq('status', 'active')
        .eq('shiur', shiurFilter)
        .order('last_name')
        .range(from, to);
      if (!data || data.length === 0) break;
      all.push(...(data as Student[]));
      if (data.length < 1000) break;
    }
    setStudents(all);
    // Reset new values - start from current values so user sees existing assignments
    const initial: Record<string, string> = {};
    for (const s of all) {
      initial[s.id] = s.equivalent_year ? String(s.equivalent_year) : '';
    }
    setNewValues(initial);
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
  }, [shiurFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingChanges = useMemo(() => {
    return students.filter((s) => {
      const current = s.equivalent_year ? String(s.equivalent_year) : '';
      const next = (newValues[s.id] || '').trim();
      return current !== next;
    });
  }, [students, newValues]);

  const handleSave = async () => {
    if (pendingChanges.length === 0) {
      alert('אין שינויים לביצוע');
      return;
    }
    if (!confirm(`לעדכן ${pendingChanges.length} תלמידים?`)) return;

    setSaving(true);
    let updated = 0;
    let errors = 0;
    for (const s of pendingChanges) {
      const next = (newValues[s.id] || '').trim();
      try {
        const { error } = await supabase
          .from('students')
          .update({ equivalent_year: next || null })
          .eq('id', s.id);
        if (error) errors++;
        else updated++;
      } catch {
        errors++;
      }
    }
    setSaving(false);
    alert(`עודכנו ${updated} תלמידים${errors > 0 ? `, ${errors} שגיאות` : ''}`);
    await loadStudents();
  };

  const handleClearAll = () => {
    if (!confirm('לנקות את כל השינויים (חוזר לערכים המקוריים)?')) return;
    const initial: Record<string, string> = {};
    for (const s of students) {
      initial[s.id] = s.equivalent_year ? String(s.equivalent_year) : '';
    }
    setNewValues(initial);
  };

  const shiurOptions = SHIURIM.map((s) => ({ value: s.name, label: s.name }));

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-900">שיבוץ כתה מקבילה</h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          בחר שיעור, ואז מלא לכל תלמיד את מספר הכתה המקבילה. לחץ &quot;בצע&quot; לעדכון המוני.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שיעור</label>
            <select
              value={shiurFilter}
              onChange={(e) => setShiurFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {shiurOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end text-sm text-gray-600">
            {loading ? 'טוען...' : `${students.length} תלמידים פעילים`}
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={handleClearAll} disabled={saving}>
              איפוס
            </Button>
            <Button onClick={handleSave} disabled={saving || pendingChanges.length === 0}>
              {saving ? 'מבצע...' : `✓ בצע ${pendingChanges.length > 0 ? `(${pendingChanges.length})` : ''}`}
            </Button>
          </div>
        </div>

        {/* Bulk paste helper */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
          💡 <strong>טיפ:</strong> אפשר למלא עמודה שלמה מהר בלחיצה על Tab בין השדות
        </div>

        {students.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">שם משפחה</th>
                  <th className="px-3 py-2 text-start font-semibold">שם פרטי</th>
                  <th className="px-3 py-2 text-start font-semibold">שיעור</th>
                  <th className="px-3 py-2 text-start font-semibold">כתה נוכחית</th>
                  <th className="px-3 py-2 text-start font-semibold">כתה מקבילה חדשה</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const current = s.equivalent_year ? String(s.equivalent_year) : '';
                  const next = newValues[s.id] || '';
                  const changed = current !== next;
                  return (
                    <tr key={s.id} className={`border-t border-gray-100 ${changed ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-3 py-2 font-medium">{s.last_name}</td>
                      <td className="px-3 py-2">{s.first_name}</td>
                      <td className="px-3 py-2 text-gray-600">{s.shiur}</td>
                      <td className="px-3 py-2 text-gray-500">{current || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={next}
                          onChange={(e) => setNewValues((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          className={`w-20 px-2 py-1 border rounded text-center font-medium ${
                            changed ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                          }`}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
