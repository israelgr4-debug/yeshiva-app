'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNeighborhoods } from '@/hooks/useNeighborhoods';

export function NeighborhoodsTab() {
  const { neighborhoods, loading, create, remove, rename } = useNeighborhoods();
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingCode, setEditingCode] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = neighborhoods.slice().sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!q) return list;
    return list.filter((n) => n.name.includes(q) || (n.city_name || '').includes(q));
  }, [neighborhoods, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      // city_name is required by the schema, default to '-' since we're decoupling.
      // It still travels with the row so older data can be cleaned up gradually.
      await create('-', name);
      setNewName('');
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
          רשימת שכונות לסימון בכרטיסי משפחות (לארגון הסעות וקבוצות).
          בעריכת תלמיד תופיע רשימה נפתחת של כל השכונות.
        </p>

        {/* Add form */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
            הוספת שכונה
          </h3>
          <form onSubmit={handleAdd} className="flex gap-2 items-end">
            <div className="flex-1">
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
              {busy ? 'מוסיף...' : '＋ הוסף'}
            </Button>
          </form>
        </div>

        {/* List + search */}
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
            כל השכונות ({filtered.length})
          </h3>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="w-48"
          />
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">טוען...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-3xl mb-2 opacity-40">🗺️</p>
            <p className="text-slate-500 text-sm">אין שכונות עדיין</p>
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
      </CardContent>
    </Card>
  );
}
