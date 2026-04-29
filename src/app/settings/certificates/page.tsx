'use client';

import { useState, useMemo, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  useCertificateTemplates,
  CertificateTemplate,
  PLACEHOLDER_CATALOG,
  renderTemplateBody,
} from '@/hooks/useCertificateTemplates';
import { ExtraField } from '@/lib/certificates';
import { RichTextEditor } from '@/components/settings/RichTextEditor';
import Link from 'next/link';

export default function CertificateEditorPage() {
  const { permissions, loading: authLoading } = useAuth();
  const { templates, loading, upsert } = useCertificateTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CertificateTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<'header' | 'body' | 'signer'>('body');
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
  const [signerEl, setSignerEl] = useState<HTMLDivElement | null>(null);

  // Default-select first template
  useEffect(() => {
    if (!selectedId && templates.length > 0) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  // Sync draft when selection changes
  useEffect(() => {
    const current = templates.find((t) => t.id === selectedId) || null;
    setDraft(current ? { ...current } : null);
  }, [selectedId, templates]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await upsert(draft);
      alert('נשמר בהצלחה');
    } catch (e: any) {
      alert('שגיאה בשמירה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    const current = templates.find((t) => t.id === selectedId) || null;
    setDraft(current ? { ...current } : null);
  };

  const insertPlaceholder = (key: string) => {
    if (!draft) return;
    const targetEl =
      activeSection === 'header' ? headerEl :
      activeSection === 'signer' ? signerEl :
      editorEl;
    if (targetEl) {
      targetEl.dispatchEvent(
        new CustomEvent('certEditor:insert', { detail: { html: `{{${key}}}` } })
      );
    }
  };

  const updateExtraField = (idx: number, patch: Partial<ExtraField>) => {
    if (!draft) return;
    const fields = [...(draft.extra_fields || [])];
    fields[idx] = { ...fields[idx], ...patch };
    setDraft({ ...draft, extra_fields: fields });
  };

  const addExtraField = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      extra_fields: [
        ...(draft.extra_fields || []),
        { key: 'new_field', label: 'שדה חדש', type: 'text' },
      ],
    });
  };

  const removeExtraField = (idx: number) => {
    if (!draft) return;
    const fields = [...(draft.extra_fields || [])];
    fields.splice(idx, 1);
    setDraft({ ...draft, extra_fields: fields });
  };

  // Live preview - resolve with sample data
  const sampleSigner = useMemo(() => ({
    name: draft?.signer_name || 'יוסף לוי',
    title: draft?.signer_title || 'מזכיר',
    idNumber: draft?.signer_id_number || '56618556',
  }), [draft]);

  const sampleStudent: any = {
    first_name: 'יוסף',
    last_name: 'כהן',
    id_number: '123456789',
    passport_number: 'A1234567',
    shiur: 'שיעור ז',
    admission_date: '01/09/2024',
    date_of_birth: '15/03/2008',
  };

  const sampleExtras = useMemo(() => {
    const o: Record<string, string> = {};
    for (const f of draft?.extra_fields || []) {
      o[f.key] = f.placeholder || `[${f.label}]`;
    }
    return o;
  }, [draft?.extra_fields]);

  const previewBody = useMemo(
    () => draft ? renderTemplateBody(draft.body, sampleStudent, 'תשפ"ו', sampleExtras, sampleSigner) : '',
    [draft, sampleExtras, sampleSigner]
  );
  const previewHeader = useMemo(
    () => draft?.header_html
      ? renderTemplateBody(draft.header_html, sampleStudent, 'תשפ"ו', sampleExtras, sampleSigner)
      : '',
    [draft?.header_html, sampleExtras, sampleSigner]
  );
  const previewSigner = useMemo(
    () => draft?.signer_html
      ? renderTemplateBody(draft.signer_html, sampleStudent, 'תשפ"ו', sampleExtras, sampleSigner)
      : '',
    [draft?.signer_html, sampleExtras, sampleSigner]
  );

  if (authLoading) return null;
  if (!permissions.isAdmin) {
    return (
      <div className="p-8">
        <p className="text-slate-500">העמוד הזה זמין רק למנהלים.</p>
        <Link href="/settings" className="text-blue-600 hover:underline">חזרה להגדרות</Link>
      </div>
    );
  }

  return (
    <>
      <Header
        title="עורך אישורים"
        subtitle="עריכת נוסח האישורים שהמערכת מפיקה"
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {loading ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען תבניות...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Templates list */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <Input
                  placeholder="חיפוש..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                {filteredTemplates.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-start px-3 py-2.5 transition-colors ${
                        active ? 'bg-blue-50 border-s-4 border-blue-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-sm ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-800'}`}>
                        {t.name}
                      </p>
                      {!t.is_active && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 rounded mt-1 inline-block">
                          לא פעיל
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editor */}
            <div className="lg:col-span-5">
              {draft ? (
                <div className="bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                    <h2 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
                      {draft.name}
                    </h2>
                  </div>
                  <div className="p-4 space-y-4">
                    <Input
                      label="שם האישור"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                    <Input
                      label="לכבוד (נמען)"
                      value={draft.recipient || ''}
                      onChange={(e) => setDraft({ ...draft, recipient: e.target.value })}
                    />

                    {/* Section selector: header / body / signer */}
                    <div>
                      <div className="flex gap-1 mb-2 border-b border-slate-200">
                        {[
                          { id: 'header' as const, label: '🏷 כותרת (בס״ד + תאריך)' },
                          { id: 'body' as const, label: '📝 גוף האישור' },
                          { id: 'signer' as const, label: '✍ חתימה' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setActiveSection(s.id)}
                            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                              activeSection === s.id
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      <p className="text-xs text-slate-500 mb-2">
                        {activeSection === 'header' &&
                          'הכותרת בראש האישור (בס"ד, תאריכים, "אישור"). אם תשאיר ריק - יוצג כברירת מחדל.'}
                        {activeSection === 'body' &&
                          'גוף האישור - הטקסט המרכזי. השתמש ב-toolbar לעיצוב.'}
                        {activeSection === 'signer' &&
                          'בלוק החתימה בסוף האישור. בתלמידי חינוך הבלוק הזה לא יוצג (תוצג רק תמונת חתימת חינוך).'}
                      </p>

                      {activeSection === 'header' && (
                        <RichTextEditor
                          value={draft.header_html || ''}
                          onChange={(html) => setDraft({ ...draft, header_html: html })}
                          onEditorReady={setHeaderEl}
                        />
                      )}
                      {activeSection === 'body' && (
                        <RichTextEditor
                          value={draft.body}
                          onChange={(html) => setDraft({ ...draft, body: html })}
                          onEditorReady={setEditorEl}
                        />
                      )}
                      {activeSection === 'signer' && (
                        <RichTextEditor
                          value={draft.signer_html || ''}
                          onChange={(html) => setDraft({ ...draft, signer_html: html })}
                          onEditorReady={setSignerEl}
                        />
                      )}
                    </div>

                    {/* Extra fields */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-slate-700">
                          שדות נוספים (יוזנו בעת הפקת האישור)
                        </label>
                        <Button type="button" size="sm" variant="ghost" onClick={addExtraField}>
                          ＋ הוסף שדה
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {(draft.extra_fields || []).map((f, i) => (
                          <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-lg p-2">
                            <input
                              value={f.key}
                              onChange={(e) => updateExtraField(i, { key: e.target.value })}
                              placeholder="key"
                              className="w-28 px-2 py-1 border border-slate-200 rounded text-xs font-mono"
                            />
                            <input
                              value={f.label}
                              onChange={(e) => updateExtraField(i, { label: e.target.value })}
                              placeholder="תווית"
                              className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm"
                            />
                            <select
                              value={f.type}
                              onChange={(e) => updateExtraField(i, { type: e.target.value as any })}
                              className="px-2 py-1 border border-slate-200 rounded text-sm"
                            >
                              <option value="text">טקסט</option>
                              <option value="number">מספר</option>
                              <option value="date">תאריך</option>
                              <option value="textarea">טקסט ארוך</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeExtraField(i)}
                              className="text-red-600 hover:bg-red-50 w-7 h-7 rounded"
                              title="מחק"
                            >
                              🗑
                            </button>
                          </div>
                        ))}
                        {(!draft.extra_fields || draft.extra_fields.length === 0) && (
                          <p className="text-xs text-slate-400 italic">אין שדות נוספים</p>
                        )}
                      </div>
                    </div>

                    {/* Signer override */}
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        חתימה (אופציונלי - השאר ריק לחתימה כללית)
                      </summary>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                        <Input
                          label="שם"
                          value={draft.signer_name || ''}
                          onChange={(e) => setDraft({ ...draft, signer_name: e.target.value })}
                        />
                        <Input
                          label="ת״ז"
                          value={draft.signer_id_number || ''}
                          onChange={(e) => setDraft({ ...draft, signer_id_number: e.target.value })}
                        />
                        <Input
                          label="תפקיד"
                          value={draft.signer_title || ''}
                          onChange={(e) => setDraft({ ...draft, signer_title: e.target.value })}
                        />
                      </div>
                    </details>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                        />
                        פעיל (יופיע ברשימת האישורים)
                      </label>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={handleRevert}>
                          בטל שינויים
                        </Button>
                        <Button type="button" onClick={handleSave} disabled={saving}>
                          {saving ? 'שומר...' : '💾 שמור'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
                  בחר תבנית מהרשימה
                </div>
              )}
            </div>

            {/* Placeholders + Preview */}
            <div className="lg:col-span-4 space-y-4">
              {/* Placeholders */}
              <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full" />
                  שדות לשתילה
                </h3>
                <p className="text-xs text-slate-500 mb-2">
                  לחץ על שדה כדי להכניס אותו במיקום הסמן בגוף האישור.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDER_CATALOG.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="px-2 py-1 rounded-md text-xs bg-blue-50 text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100"
                      title={`{{${p.key}}}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {draft && draft.extra_fields && draft.extra_fields.length > 0 && (
                  <>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-3 mb-1.5">
                      שדות מותאמים
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.extra_fields.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => insertPlaceholder(f.key)}
                          className="px-2 py-1 rounded-md text-xs bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                          title={`{{${f.key}}}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Preview */}
              <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-violet-500 to-purple-600 rounded-full" />
                  תצוגה מקדימה (נתוני דוגמה)
                </h3>
                {draft && (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-800 border border-slate-200 space-y-3">
                    {previewHeader && (
                      <div dangerouslySetInnerHTML={{ __html: previewHeader }} />
                    )}
                    {draft.recipient && (
                      <p className="font-semibold">{draft.recipient}</p>
                    )}
                    {previewBody ? (
                      /<[a-z]/.test(previewBody) ? (
                        <div dangerouslySetInnerHTML={{ __html: previewBody }} />
                      ) : (
                        <div className="whitespace-pre-line">{previewBody}</div>
                      )
                    ) : (
                      <span className="text-slate-400 italic">אישור ריק</span>
                    )}
                    {previewSigner && (
                      <div className="pt-2 border-t border-slate-200" dangerouslySetInnerHTML={{ __html: previewSigner }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
