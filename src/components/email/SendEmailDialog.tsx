'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultSubject: string;
  buildHtml: () => string | Promise<string>; // returns HTML body
  attachments?: Array<{ filename: string; content: string; contentType: string }>; // base64 content
  defaultRecipient?: string;
}

export function SendEmailDialog({ isOpen, onClose, defaultSubject, buildHtml, attachments, defaultRecipient }: Props) {
  const [to, setTo] = useState(defaultRecipient || '');
  const [subject, setSubject] = useState(defaultSubject);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!to.trim()) {
      setResult('❌ יש להזין כתובת דוא״ל');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const baseHtml = await buildHtml();
      const finalHtml = note
        ? `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 16px; background: #f5f5f5; margin-bottom: 20px; border-right: 3px solid #3b82f6;">${escapeHtml(note).replace(/\n/g, '<br>')}</div>${baseHtml}`
        : baseHtml;

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim() || defaultSubject,
          html: finalHtml,
          attachments,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בשליחה');

      setResult('✅ המייל נשלח בהצלחה');
      setTimeout(() => {
        onClose();
        setResult(null);
        setNote('');
      }, 1500);
    } catch (err: any) {
      setResult('❌ ' + (err?.message || 'שגיאה'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold">שלח במייל</h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">נמען (דוא״ל)*</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="name@example.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">נושא</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">הודעה אישית (אופציונלי)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="טקסט שיופיע בראש המייל"
            />
          </div>

          {result && (
            <div
              className={`rounded p-3 text-sm ${
                result.startsWith('✅')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {result}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <Button onClick={handleSend} disabled={sending || !to.trim()} className="flex-1">
            {sending ? 'שולח...' : '📧 שלח'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={sending} className="flex-1">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
