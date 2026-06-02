'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface GraduateData {
  id: string;
  first_name: string;
  last_name: string;
  machzor_name: string | null;
  street: string | null;
  building_number: string | null;
  apartment: string | null;
  entrance: string | null;
  neighborhood: string | null;
  city: string | null;
  temp_address: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  marital_status: string | null;
  spouse_name: string | null;
  marriage_date_text: string | null;
  spouse_father_name: string | null;
  spouse_father_phone: string | null;
  spouse_mother_name: string | null;
  spouse_mother_phone: string | null;
  spouse_father_city: string | null;
}

const EMPTY = (v: any) => (v == null ? '' : String(v));

export default function GraduateSelfUpdatePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graduate, setGraduate] = useState<GraduateData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notesToAdmin, setNotesToAdmin] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/g/update/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || (data.error === 'expired' ? 'תוקף הקישור פג' : 'הקישור אינו תקין'));
        } else {
          setGraduate(data.graduate);
          if (data.alreadySubmitted) setDone(true);
          const init: Record<string, string> = {};
          for (const k of Object.keys(data.graduate)) {
            if (!['id', 'first_name', 'last_name', 'machzor_name'].includes(k)) {
              init[k] = EMPTY(data.graduate[k]);
            }
          }
          setForm(init);
        }
      } catch (e: any) {
        setError('שגיאת רשת. בדוק חיבור ונסה שוב.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/g/update/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: form, notes_to_admin: notesToAdmin || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'שמירה נכשלה');
      } else {
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e: any) {
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="card center">
          <div className="spinner" />
          <p>טוען...</p>
        </div>
        <Styles />
      </div>
    );
  }

  if (error && !graduate) {
    return (
      <div className="page">
        <div className="card center">
          <h1>😕 {error}</h1>
          <p className="muted">אם נראה לך שזו טעות, ניתן ליצור קשר עם משרד הישיבה.</p>
        </div>
        <Styles />
      </div>
    );
  }

  if (done) {
    return (
      <div className="page">
        <div className="card center">
          <div className="check">✓</div>
          <h1>תודה רבה!</h1>
          <p>הפרטים נשמרו בהצלחה. אין צורך בפעולה נוספת.</p>
          <p className="muted">ניתן לסגור את החלון.</p>
        </div>
        <Styles />
      </div>
    );
  }

  if (!graduate) return null;

  return (
    <div className="page">
      <div className="card">
        <header className="head">
          <h1>שלום ר&apos; {graduate.first_name} 👋</h1>
          <p className="sub">
            עדכון פרטים אישיים{graduate.machzor_name ? ` · מחזור ${graduate.machzor_name}` : ''}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="form">
          <Section title="📍 כתובת">
            <Row>
              <Field label="רחוב" value={form.street} onChange={(v) => update('street', v)} />
              <Field label="מספר בית" value={form.building_number} onChange={(v) => update('building_number', v)} small />
            </Row>
            <Row>
              <Field label="כניסה" value={form.entrance} onChange={(v) => update('entrance', v)} small />
              <Field label="דירה" value={form.apartment} onChange={(v) => update('apartment', v)} small />
            </Row>
            <Row>
              <Field label="שכונה" value={form.neighborhood} onChange={(v) => update('neighborhood', v)} />
              <Field label="עיר" value={form.city} onChange={(v) => update('city', v)} />
            </Row>
            <Field
              label="כתובת זמנית (אם רלוונטי)"
              value={form.temp_address}
              onChange={(v) => update('temp_address', v)}
            />
          </Section>

          <Section title="📞 ליצירת קשר">
            <Row>
              <Field label="נייד" type="tel" value={form.mobile} onChange={(v) => update('mobile', v)} />
              <Field label="טלפון נוסף" type="tel" value={form.phone} onChange={(v) => update('phone', v)} />
            </Row>
            <Field label="אימייל" type="email" value={form.email} onChange={(v) => update('email', v)} />
          </Section>

          <Section title="💍 מצב משפחתי">
            <label className="lbl">מצב</label>
            <select
              className="inp"
              value={form.marital_status || ''}
              onChange={(e) => update('marital_status', e.target.value)}
            >
              <option value="">—</option>
              <option value="רווק">רווק</option>
              <option value="מאורס">מאורס</option>
              <option value="נשוי">נשוי</option>
            </select>

            {(form.marital_status === 'מאורס' || form.marital_status === 'נשוי') && (
              <>
                <Row>
                  <Field label="שם הרעיה" value={form.spouse_name} onChange={(v) => update('spouse_name', v)} />
                  <Field label="תאריך נישואין" value={form.marriage_date_text} onChange={(v) => update('marriage_date_text', v)} />
                </Row>
                <h4 className="sub-h">פרטי חמיו</h4>
                <Row>
                  <Field label="שם החותן" value={form.spouse_father_name} onChange={(v) => update('spouse_father_name', v)} />
                  <Field label="נייד חותן" type="tel" value={form.spouse_father_phone} onChange={(v) => update('spouse_father_phone', v)} />
                </Row>
                <Row>
                  <Field label="שם החותנת" value={form.spouse_mother_name} onChange={(v) => update('spouse_mother_name', v)} />
                  <Field label="נייד חותנת" type="tel" value={form.spouse_mother_phone} onChange={(v) => update('spouse_mother_phone', v)} />
                </Row>
                <Field label="עיר המחותנים" value={form.spouse_father_city} onChange={(v) => update('spouse_father_city', v)} />
              </>
            )}
          </Section>

          <Section title="💬 הערה לישיבה (אופציונלי)">
            <textarea
              className="inp"
              rows={3}
              maxLength={2000}
              value={notesToAdmin}
              onChange={(e) => setNotesToAdmin(e.target.value)}
              placeholder="אם יש משהו שתרצה לכתוב לנו..."
            />
          </Section>

          {error && <div className="err">{error}</div>}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'שומר...' : '✓ שמור פרטים'}
          </button>

          <p className="footnote">
            הפרטים נשמרים ישירות במערכת. אין צורך להתחבר.
          </p>
        </form>
      </div>
      <Styles />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="row">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  small,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  type?: string;
  small?: boolean;
}) {
  return (
    <div className={`field ${small ? 'small' : ''}`}>
      <label className="lbl">{label}</label>
      <input
        className="inp"
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      html, body { background: #f5f7fb; }
      .page {
        direction: rtl;
        font-family: 'Heebo', system-ui, -apple-system, Arial, sans-serif;
        min-height: 100vh;
        padding: 16px 12px 48px;
        display: flex;
        justify-content: center;
        color: #1f2937;
      }
      .card {
        width: 100%;
        max-width: 560px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        padding: 20px 18px;
      }
      .card.center { text-align: center; padding: 40px 20px; }
      .head { text-align: center; margin-bottom: 8px; }
      .head h1 { font-size: 22px; margin: 0 0 6px; color: #0b3c7a; }
      .sub { color: #6b7280; font-size: 14px; margin: 0; }
      .sec { margin-top: 22px; padding-top: 16px; border-top: 1px solid #eef0f4; }
      .sec h3 { font-size: 16px; margin: 0 0 12px; color: #0b3c7a; }
      .sub-h { font-size: 14px; margin: 16px 0 8px; color: #4b5563; }
      .row { display: flex; gap: 10px; }
      .row > .field { flex: 1; }
      .row > .field.small { flex: 0 0 30%; }
      .field { margin-bottom: 12px; }
      .lbl { display: block; font-size: 13px; color: #4b5563; margin-bottom: 4px; }
      .inp {
        width: 100%;
        padding: 11px 12px;
        font-size: 16px;
        border: 1px solid #d1d5db;
        border-radius: 10px;
        background: #fafbfc;
        font-family: inherit;
        box-sizing: border-box;
      }
      .inp:focus { outline: none; border-color: #2563eb; background: white; }
      textarea.inp { resize: vertical; min-height: 70px; }
      .btn-primary {
        width: 100%;
        margin-top: 20px;
        padding: 14px;
        font-size: 17px;
        font-weight: 600;
        color: white;
        background: #0b3c7a;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-primary:disabled { opacity: 0.6; cursor: wait; }
      .btn-primary:hover:not(:disabled) { background: #0a3268; }
      .footnote { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 12px; }
      .err {
        background: #fee2e2;
        color: #991b1b;
        padding: 10px 12px;
        border-radius: 8px;
        margin-top: 16px;
        text-align: center;
      }
      .muted { color: #6b7280; }
      .check {
        width: 64px; height: 64px; border-radius: 50%;
        background: #10b981; color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 36px; margin: 0 auto 16px;
      }
      .spinner {
        width: 32px; height: 32px;
        border: 3px solid #e5e7eb; border-top-color: #2563eb;
        border-radius: 50%; margin: 0 auto 16px;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 480px) {
        .row { flex-direction: column; gap: 0; }
        .row > .field.small { flex: 1; }
      }
    `}</style>
  );
}
