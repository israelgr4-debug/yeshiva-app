'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError('שם משתמש או סיסמה שגויים');
        return;
      }

      // Verify user is in app_users (is_active)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('שגיאה בכניסה');
        return;
      }

      const { data: appUser } = await supabase
        .from('app_users')
        .select('is_active')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!appUser || !appUser.is_active) {
        await supabase.auth.signOut();
        setError('המשתמש אינו מורשה להיכנס למערכת. פנה למנהל.');
        return;
      }

      router.push('/');
    } catch (err: any) {
      setError(err?.message || 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-800 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ישיבת מיר מודיעין עילית</h1>
          <p className="text-gray-600 mt-2">כניסה למערכת הניהול</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש (דוא״ל)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="name@example.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'מתחבר...' : 'התחבר'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6">
          אם אינך מורשה - פנה למנהל המערכת
        </p>
      </div>
    </div>
  );
}
