'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useNeighborhoods } from '@/hooks/useNeighborhoods';

export function NeighborhoodsTab() {
  const { neighborhoods, loading, cities, create, remove, rename } = useNeighborhoods();
  const [selectedCity, setSelectedCity] = useState<string>('ירושלים');
  const [newCity, setNewCity] = useState('');
  const [newName, setNewName] = useState('');
  const [showAddCity, setShowAddCity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingCode, setEditingCode] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Ensure selected city is in dropdown options even if just-typed for new city
  const cityOptions = useMemo(() => {
    const opts = cities.map((c) => ({ value: c, label: c }));
    if (selectedCity && !cities.includes(selectedCity)) {
      opts.unshift({ value: selectedCity, label: selectedCity });
    }
    return opts;
  }, [cities, selectedCity]);

  const filtered = useMemo(
    () =>
      neighborhoods
        .filter((n) => n.city_name === selectedCity)
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [neighborhoods, selectedCity]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const city = (showAddCity ? newCity : selectedCity).trim();
    const name = newName.trim();
    if (!city) return alert('יש לבחור או להזין עיר');
    if (!name) return alert('יש להזין שם שכונה');
    setBusy(true);
    try {
      await create(city, name);
      setNewName('');
      if (showAddCity) {
        setSelectedCity(city);
        setNewCity('');
        setShowAddCity(false);
      }
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (code: number, name: string) => {
    if (!confirm(`למחוק את השכונה "${name}"?\n\nאם יש משפחות עם השכונה הזו - הקוד יישאר אצלן אך לא יזוהה.`))
      return;
    try {
      await remove(code);
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    }
  };

  const handleRename = async (code: number) => {
    const v = editValue.trim();
    if (!v) {
      setEditingCode(null);
      return;
    }
    try {
      await rename(code, v);
      setEditingCode(null);
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
          🗺️ שכונות
        </h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 mb-4">
          ניהול רשימת שכונות לכל עיר. השכונות מופיעות כרשימה נפתחת בעריכת משפחה
          וברשימה זו רואים אילו תלמידים מאיזו שכונה (חשוב לארגון הסעות).
        </p>

        {/* Add form */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
            הוספת שכונה
          </h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                עיר
              </label>
              {showAddCity ? (
                <div className="flex gap-1">
                  <Input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="עיר חדשה"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowAddCity(false); setNewCity(''); }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Select
                    options={cityOptions}
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddCity(true)}
                    title="הוסף עיר חדשה"
                  >
                    ＋
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                שם השכונה
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: רמות, גאולה..."
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'מוסיף...' : '＋ הוסף שכונה'}
            </Button>
          </form>
        </div>

        {/* List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
              שכונות ב{selectedCity || '—'}
            </h3>
            {!showAddCity && cities.length > 1 && (
              <Select
                options={cityOptions}
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-40"
              />
            )}
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">טוען...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-3xl mb-2 opacity-40">🗺️</p>
              <p className="text-slate-500 text-sm">אין שכונות לעיר זו עדיין</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {filtered.map((n) => (
                <div
                  key={n.code}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2 hover:border-slate-300 transition-colors group"
                >
                  {editingCode === n.code ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRename(n.code)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(n.code);
                        if (e.key === 'Escape') setEditingCode(null);
                      }}
                      className="flex-1 px-2 py-1 border border-blue-400 rounded text-sm"
                    />
                  ) : (
                    <>
                      <span className="text-sm text-slate-800 flex-1 truncate">{n.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => { setEditingCode(n.code); setEditValue(n.name); }}
                          className="text-slate-400 hover:text-blue-600 text-xs px-1"
                          title="ערוך"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(n.code, n.name)}
                          className="text-slate-400 hover:text-red-600 text-xs px-1"
                          title="מחק"
                        >
                          🗑️
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
