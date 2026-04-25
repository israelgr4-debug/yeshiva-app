'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ConfirmDelete } from '@/components/ui/ConfirmDelete';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { AppUser, UserRole } from '@/lib/auth';

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'admin', label: 'מנהל ראשי', description: 'הכל + מחיקה + ניהול משתמשים' },
  { value: 'secretary', label: 'מזכירה', description: 'עריכה והוספה (ללא מחיקה), הפקת מס״ב' },
  { value: 'manager', label: 'מנהל', description: 'צפייה + הפקת דוחות ואישורים' },
  { value: 'viewer', label: 'צפיה בלבד', description: 'רק קריאה' },
  { value: 'graduates_only', label: 'בוגרים בלבד', description: 'גישה רק לאזור הבוגרים, ללא שאר המערכת' },
];

async function apiCall(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function UsersManagementPage() {
  const { user: currentUser, permissions } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall('/api/users');
      setUsers(data);
    } catch (err: any) {
      alert('שגיאה בטעינת משתמשים: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permissions.canManageUsers) loadUsers();
  }, [permissions.canManageUsers, loadUsers]);

  if (!permissions.canManageUsers) {
    return (
      <>
        <Header title="ניהול משתמשים" />
        <div className="p-8 text-center text-gray-500">אין לך הרשאה לגשת לעמוד זה</div>
      </>
    );
  }

  const roleLabel = (r: UserRole) => ROLES.find((x) => x.value === r)?.label || r;

  const handleDelete = async (u: AppUser) => {
    try {
      await apiCall(`/api/users/${u.id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err: any) {
      alert('שגיאה: ' + err.message);
    }
  };

  return (
    <>
      <Header title="ניהול משתמשים" subtitle="הוספה, עריכה ומחיקה של משתמשי המערכת" />

      <div className="p-4 md:p-8 space-y-4">
        {/* Create button */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">משתמשים ({users.length})</h2>
          <Button onClick={() => setShowCreate(true)}>+ הוסף משתמש</Button>
        </div>

        {/* Users table */}
        <Card>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">טוען...</div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-gray-500">אין משתמשים</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-start">שם</th>
                      <th className="px-3 py-2 text-start">דוא״ל</th>
                      <th className="px-3 py-2 text-start">תפקיד</th>
                      <th className="px-3 py-2 text-start">סטטוס</th>
                      <th className="px-3 py-2 text-start">נוצר</th>
                      <th className="px-3 py-2 text-start">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{u.full_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{u.email}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            u.role === 'admin' ? 'bg-red-50 text-red-700' :
                            u.role === 'secretary' ? 'bg-blue-50 text-blue-700' :
                            u.role === 'manager' ? 'bg-purple-50 text-purple-700' :
                            u.role === 'graduates_only' ? 'bg-indigo-50 text-indigo-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {roleLabel(u.role)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {u.is_active ? (
                            <span className="text-green-700 text-xs">✓ פעיל</span>
                          ) : (
                            <span className="text-red-700 text-xs">✗ חסום</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : ''}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => setEditingUser(u)}>
                              ערוך
                            </Button>
                            {u.id !== currentUser?.id && (
                              <ConfirmDelete
                                trigger={(open) => (
                                  <Button size="sm" variant="danger" onClick={open}>מחק</Button>
                                )}
                                itemDescription={`המשתמש ${u.full_name || u.email} (${roleLabel(u.role)})`}
                                consequences="המשתמש לא יוכל יותר להיכנס למערכת. הפעולה לא הפיכה."
                                onConfirm={() => handleDelete(u)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role reference */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">הסבר תפקידים</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {ROLES.map((r) => (
                <div key={r.value} className="border border-gray-200 rounded p-3">
                  <p className="font-semibold">{r.label}</p>
                  <p className="text-gray-600 text-xs mt-1">{r.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await loadUsers();
          }}
        />
      )}

      {/* Edit modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={async () => {
            setEditingUser(null);
            await loadUsers();
          }}
        />
      )}
    </>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiCall('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      });
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold">הוסף משתמש חדש</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="שם מלא"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">דוא״ל (שם משתמש)*</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">סיסמה ראשונית*</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
              required
              minLength={8}
              placeholder="לפחות 8 תווים"
            />
            <p className="text-xs text-gray-500 mt-1">המשתמש יוכל לשנות את הסיסמה אחרי הכניסה</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">תפקיד*</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{ROLES.find((r) => r.value === role)?.description}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'יוצר...' : 'צור משתמש'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
              ביטול
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: any = {
        full_name: fullName,
        role,
        is_active: isActive,
      };
      if (newPassword.trim()) body.password = newPassword.trim();

      await apiCall(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold">עריכת משתמש</h3>
          <p className="text-sm text-gray-600 mt-1">{user.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">תפקיד</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">משתמש פעיל (יכול להתחבר)</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1">איפוס סיסמה (אופציונלי)</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
              placeholder="השאר ריק אם לא משנה"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'שומר...' : 'שמור'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
              ביטול
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
