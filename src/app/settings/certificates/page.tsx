'use client';

// Certificate editor — works like a Word page: the whole certificate is edited on an A4
// sheet (header settings, title, recipient, body, signer block), one toolbar drives the
// focused area, stamp / signature are dragged into place on the page. What you see here is
// what print, email and the Word export produce (same header settings, same alignment).

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Editor } from '@tiptap/react';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import {
  useCertificateTemplates,
  CertificateTemplate,
  PLACEHOLDER_CATALOG,
  templateToReportType,
} from '@/hooks/useCertificateTemplates';
import { ExtraField } from '@/lib/certificates';
import { exportCertificateToWord } from '@/lib/cert-to-word';
import {
  CertHeaderConfig, HAlign, headerConfigOf, certDates, SignLayout, DEFAULT_SIGN_LAYOUT, signLayoutOf,
} from '@/lib/cert-layout';
import { useCertEditor, CertEditorArea, CertToolbar, CERT_PM_CSS } from '@/components/settings/CertEditor';
import { SignerBlock } from '@/components/reports/SignerBlock';
import { CertificatePreview } from '@/components/reports/CertificatePreview';

const DEFAULT_SIGNER_HTML = '<p>בכבוד רב,</p><p><strong>{{signer_name}}</strong></p><p>{{signer_id_number}}</p><p>{{signer_title}}</p>';

const SAMPLE_STUDENT: any = {
  first_name: 'יוסף', last_name: 'כהן', id_number: '123456789', passport_number: 'A1234567',
  shiur: 'שיעור ז', admission_date: '2024-09-01', date_of_birth: '2008-03-15', is_chinuch: false,
};

export default function CertificateEditorPage() {
  const { permissions, loading: authLoading } = useAuth();
  const { templates, loading, upsert, remove } = useCertificateTemplates();
  const { getSetting, setSetting } = useSystemSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CertificateTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'general' | 'header' | 'fields' | 'stamp'>('general');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // stamp / signature (global, from Settings) + their position (dragged here)
  const [stampUrl, setStampUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [layout, setLayout] = useState<SignLayout>(DEFAULT_SIGN_LAYOUT);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [showSignature, setShowSignature] = useState(true);

  useEffect(() => {
    getSetting<string>('stamp_url', '').then(setStampUrl);
    getSetting<string>('signature_url', '').then(setSignatureUrl);
    getSetting<any>('cert_sign_layout', null).then((v) => setLayout(signLayoutOf(v)));
  }, [getSetting]);

  useEffect(() => {
    if (!selectedId && templates.length > 0) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  useEffect(() => {
    const current = templates.find((t) => t.id === selectedId) || null;
    setDraft(current ? { ...current, signer_html: current.signer_html || (current.is_receipt ? null : DEFAULT_SIGNER_HTML) } : null);
  }, [selectedId, templates]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  }, [templates, search]);

  const hcfg: CertHeaderConfig = useMemo(() => headerConfigOf(draft?.header_config, draft?.header_html), [draft?.header_config, draft?.header_html]);
  const setHeader = (patch: Partial<CertHeaderConfig>) => draft && setDraft({ ...draft, header_config: { ...hcfg, ...patch } });

  const sampleSigner = useMemo(() => ({
    name: draft?.signer_name || 'יוסף לוי',
    title: draft?.signer_title || 'מזכיר',
    idNumber: draft?.signer_id_number || '56618556',
  }), [draft?.signer_name, draft?.signer_title, draft?.signer_id_number]);

  const sampleExtras = useMemo(() => {
    const o: Record<string, string> = {};
    for (const f of draft?.extra_fields || []) o[f.key] = f.placeholder || `[${f.label}]`;
    return o;
  }, [draft?.extra_fields]);

  // ---------- actions ----------
  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await upsert(draft);
      if (layoutDirty) { await setSetting('cert_sign_layout', layout); setLayoutDirty(false); }
      alert('נשמר בהצלחה');
    } catch (e: any) {
      const msg = e?.message || String(e);
      alert('שגיאה בשמירה: ' + (/header_config/.test(msg) ? 'יש להריץ את מיגרציה 059 (הגדרות כותרת)' : msg));
    } finally { setSaving(false); }
  };

  const handleRevert = () => {
    const current = templates.find((t) => t.id === selectedId) || null;
    setDraft(current ? { ...current, signer_html: current.signer_html || DEFAULT_SIGNER_HTML } : null);
    getSetting<any>('cert_sign_layout', null).then((v) => { setLayout(signLayoutOf(v)); setLayoutDirty(false); });
  };

  const handleWordPreview = async () => {
    if (!draft) return;
    try {
      await exportCertificateToWord(SAMPLE_STUDENT, templateToReportType(draft), 'תשפ"ו', sampleExtras, sampleSigner, false);
    } catch (e: any) { alert('שגיאה ביצירת Word: ' + (e?.message || e)); }
  };

  const handleDuplicate = async () => {
    const base = draft || templates[0];
    const name = prompt('שם האישור החדש:', base ? `${base.name} (עותק)` : 'אישור חדש');
    if (!name?.trim()) return;
    const id = `custom_${Date.now().toString(36)}`;
    const maxOrder = templates.reduce((m, t) => Math.max(m, t.display_order || 0), 0);
    try {
      await upsert({
        id, name: name.trim(),
        recipient: base?.recipient ?? 'לכל המעונין:',
        header_html: base?.header_html ?? null,
        header_config: base?.header_config ?? null,
        body: base?.body ?? 'הננו לאשר בזאת כי ה"ה  {{full_name_with_id}}',
        signer_html: base?.signer_html ?? null,
        extra_fields: base?.extra_fields ?? [],
        signer_name: base?.signer_name ?? null, signer_title: base?.signer_title ?? null, signer_id_number: base?.signer_id_number ?? null,
        is_receipt: false, is_active: true, display_order: maxOrder + 10,
      });
      setSelectedId(id);
    } catch (e: any) { alert('שגיאה ביצירה: ' + (e?.message || e)); }
  };

  const handleDelete = async () => {
    if (!draft) return;
    if (!confirm(`למחוק לצמיתות את "${draft.name}"?\nאפשר במקום זה לבטל את הסימון "פעיל" כדי להסתיר אותו.`)) return;
    try { await remove(draft.id); setSelectedId(null); } catch (e: any) { alert('שגיאה במחיקה: ' + (e?.message || e)); }
  };

  const updateExtraField = (idx: number, patch: Partial<ExtraField>) => {
    if (!draft) return;
    const fields = [...(draft.extra_fields || [])];
    fields[idx] = { ...fields[idx], ...patch };
    setDraft({ ...draft, extra_fields: fields });
  };

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
    <PageGuard requires="admin" message="עמוד זה דורש הרשאת admin בלבד.">
    <>
      <Header title="עורך אישורים" subtitle="עריכת האישורים על דף A4 — כמו בוורד" />
      <style dangerouslySetInnerHTML={{ __html: CERT_PM_CSS }} />

      <div className="p-4 md:p-6 space-y-3">
        {loading ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען תבניות...</p>
          </div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-4 items-start">
            {/* templates list */}
            <aside className="w-full xl:w-56 shrink-0 bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
              <div className="p-3 border-b border-slate-100 space-y-2">
                <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={handleDuplicate}>➕ אישור חדש</Button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                {filteredTemplates.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                      className={`w-full text-start px-3 py-2.5 transition-colors ${active ? 'bg-blue-50 border-s-4 border-blue-600' : 'hover:bg-slate-50'}`}>
                      <p className={`text-sm ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-800'}`}>{t.name}</p>
                      {!t.is_active && <span className="text-[10px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 rounded mt-1 inline-block">לא פעיל</span>}
                    </button>
                  );
                })}
              </div>
            </aside>

            {draft ? (
              <>
                {/* the page */}
                <main className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-sm">
                      <button type="button" onClick={() => setMode('edit')} className={`px-3 py-1.5 ${mode === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>✏️ עריכה</button>
                      <button type="button" onClick={() => setMode('preview')} className={`px-3 py-1.5 ${mode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>👁 תצוגה עם נתוני דוגמה</button>
                    </div>
                    <div className="flex-1" />
                    <Button type="button" variant="ghost" size="sm" onClick={handleDelete} title="מחיקה לצמיתות">🗑️</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={handleWordPreview} title="קובץ Word לדוגמה מהנוסח הנוכחי (גם לפני שמירה)">📝 בדיקה בוורד</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={handleRevert}>בטל שינויים</Button>
                    <Button type="button" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'שומר...' : '💾 שמור'}</Button>
                  </div>

                  {draft.is_receipt ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
                      🧾 הקבלה (סעיף 46) בנויה בפריסה קבועה לפי המקור — אין בה טקסט לעריכה. אפשר לערוך את השדות שלה בצד.
                    </div>
                  ) : mode === 'preview' ? (
                    <div className="overflow-x-auto bg-slate-100 rounded-2xl p-3">
                      <CertificatePreview student={SAMPLE_STUDENT} reportType={templateToReportType(draft)} year='תשפ"ו'
                        extras={sampleExtras} signer={sampleSigner} reserveLetterheadSpace
                        stampUrl={stampUrl || null} signatureUrl={showSignature ? signatureUrl || null : null} signLayout={layout} />
                    </div>
                  ) : (
                    <PageEditor key={draft.id} draft={draft} setDraft={setDraft} hcfg={hcfg} onHeaderClick={() => setPanel('header')}
                      stampUrl={stampUrl} signatureUrl={showSignature ? signatureUrl : ''} layout={layout}
                      onLayoutChange={(l) => { setLayout(l); setLayoutDirty(true); }} />
                  )}
                </main>

                {/* side panel */}
                <aside className="w-full xl:w-80 shrink-0 bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
                  <div className="grid grid-cols-4 text-xs border-b border-slate-100">
                    {([['general', 'כללי'], ['header', 'כותרת'], ['fields', 'שדות'], ['stamp', 'חותמת']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setPanel(id)}
                        className={`py-2.5 font-medium border-b-2 ${panel === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                    ))}
                  </div>
                  <div className="p-4 space-y-3">
                    {panel === 'general' && (
                      <>
                        <Input label="שם האישור" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                          פעיל (מופיע ברשימת האישורים)
                        </label>
                        <div className="pt-2 border-t border-slate-100">
                          <div className="text-sm font-semibold text-slate-700 mb-1">החותם</div>
                          <p className="text-xs text-slate-500 mb-2">ריק = החותם הכללי (יוסף לוי, מזכיר). השדות זמינים בגוף החתימה כ״שם החותם״ וכו׳.</p>
                          <div className="space-y-2">
                            <Input label="שם" value={draft.signer_name || ''} onChange={(e) => setDraft({ ...draft, signer_name: e.target.value })} />
                            <Input label="ת״ז" value={draft.signer_id_number || ''} onChange={(e) => setDraft({ ...draft, signer_id_number: e.target.value })} />
                            <Input label="תפקיד" value={draft.signer_title || ''} onChange={(e) => setDraft({ ...draft, signer_title: e.target.value })} />
                          </div>
                        </div>
                      </>
                    )}

                    {panel === 'header' && (
                      <HeaderPanel cfg={hcfg} onChange={setHeader} />
                    )}

                    {panel === 'fields' && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-700">שדות שממלאים בהפקה</span>
                          <Button type="button" size="sm" variant="ghost"
                            onClick={() => setDraft({ ...draft, extra_fields: [...(draft.extra_fields || []), { key: `field_${(draft.extra_fields || []).length + 1}`, label: 'שדה חדש', type: 'text' }] })}>＋ הוסף</Button>
                        </div>
                        <p className="text-xs text-slate-500">שדה שמופיע כאן נכנס לטקסט דרך ״➕ הכנס שדה״ בסרגל הכלים.</p>
                        <div className="space-y-2">
                          {(draft.extra_fields || []).map((f, i) => (
                            <div key={i} className="bg-slate-50 rounded-lg p-2 space-y-1.5">
                              <div className="flex gap-1.5">
                                <input value={f.label} onChange={(e) => updateExtraField(i, { label: e.target.value })} placeholder="תווית"
                                  className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm" />
                                <button type="button" title="מחק" className="text-red-600 hover:bg-red-50 w-7 rounded"
                                  onClick={() => { const fs = [...(draft.extra_fields || [])]; fs.splice(i, 1); setDraft({ ...draft, extra_fields: fs }); }}>🗑</button>
                              </div>
                              <div className="flex gap-1.5">
                                <input value={f.key} onChange={(e) => updateExtraField(i, { key: e.target.value.replace(/[^\w]/g, '') })} placeholder="key" dir="ltr"
                                  className="w-28 px-2 py-1 border border-slate-200 rounded text-xs font-mono" />
                                <select value={f.type} onChange={(e) => updateExtraField(i, { type: e.target.value as any })}
                                  className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm">
                                  <option value="text">טקסט</option><option value="number">מספר</option>
                                  <option value="date">תאריך</option><option value="textarea">טקסט ארוך</option>
                                </select>
                              </div>
                            </div>
                          ))}
                          {(!draft.extra_fields || draft.extra_fields.length === 0) && <p className="text-xs text-slate-400 italic">אין שדות נוספים</p>}
                        </div>
                      </>
                    )}

                    {panel === 'stamp' && (
                      <>
                        <p className="text-sm text-slate-600">גרור את החותמת והחתימה על הדף למקום הרצוי. ריחוף מעל תמונה מציג −/+ לשינוי גודל. המיקום משותף לכל האישורים ונשמר עם ״שמור״.</p>
                        <ul className="text-xs text-slate-500 space-y-1 list-disc ps-4">
                          <li>הדפסה: חותמת בלבד (חותמים ביד).</li>
                          <li>מייל: חותמת + חתימה.</li>
                        </ul>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} /> הצג גם את החתימה (כמו במייל)
                        </label>
                        {!stampUrl && <p className="text-xs text-amber-700">⚠️ לא הועלתה חותמת — <Link href="/settings" className="underline">הגדרות → חותמת הישיבה</Link></p>}
                        {!signatureUrl && <p className="text-xs text-amber-700">⚠️ לא הועלתה חתימה — הגדרות</p>}
                        <div className="text-xs text-slate-500 tabular-nums">
                          חותמת: {layout.stamp.x}/{layout.stamp.y} מ״מ, גובה {layout.stamp.h} · חתימה: {layout.signature.x}/{layout.signature.y}, גובה {layout.signature.h}
                        </div>
                        <Button type="button" size="sm" variant="secondary" onClick={() => { setLayout(DEFAULT_SIGN_LAYOUT); setLayoutDirty(true); }}>החזר למיקום ברירת מחדל</Button>
                        {layoutDirty && <p className="text-xs text-blue-700">המיקום השתנה — לחץ ״שמור״.</p>}
                      </>
                    )}
                  </div>
                </aside>
              </>
            ) : (
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">בחר תבנית מהרשימה</div>
            )}
          </div>
        )}
      </div>
    </>
    </PageGuard>
  );
}

// ---------------------------------------------------------------- the A4 page

function PageEditor({ draft, setDraft, hcfg, onHeaderClick, stampUrl, signatureUrl, layout, onLayoutChange }: {
  draft: CertificateTemplate;
  setDraft: (d: CertificateTemplate) => void;
  hcfg: CertHeaderConfig;
  onHeaderClick: () => void;
  stampUrl: string;
  signatureUrl: string;
  layout: SignLayout;
  onLayoutChange: (l: SignLayout) => void;
}) {
  const [active, setActive] = useState<Editor | null>(null);
  // keep the latest draft for the editors' onChange callbacks
  const [latest] = useState<{ d: CertificateTemplate }>({ d: draft });
  latest.d = draft;
  const patch = useCallback((p: Partial<CertificateTemplate>) => setDraft({ ...latest.d, ...p }), [setDraft, latest]);

  const recipient = useCertEditor({ content: draft.recipient || '', onChange: (h) => patch({ recipient: h === '<p></p>' ? '' : h }), onFocus: setActive });
  const body = useCertEditor({ content: draft.body, onChange: (h) => patch({ body: h }), onFocus: setActive });
  const signer = useCertEditor({ content: draft.signer_html || DEFAULT_SIGNER_HTML, onChange: (h) => patch({ signer_html: h }), onFocus: setActive });

  useEffect(() => { if (!active && body) setActive(body); }, [body, active]);

  const placeholders = [
    ...PLACEHOLDER_CATALOG.map((p) => ({ key: p.key, label: p.label })),
    ...(draft.extra_fields || []).map((f) => ({ key: f.key, label: `${f.label} (שדה)` })),
  ];
  const dates = certDates(hcfg);
  const al = (a: HAlign) => ({ textAlign: a });

  return (
    <div className="space-y-2">
      <div className="sticky top-2 z-20"><CertToolbar editor={active} placeholders={placeholders} /></div>
      <div className="overflow-x-auto bg-slate-100 rounded-2xl p-4">
        <div className="mx-auto bg-white shadow-lg" dir="rtl"
          style={{ width: '210mm', minHeight: '297mm', padding: '20mm 25mm', fontFamily: "'David', 'Miriam', Arial, sans-serif", fontSize: '12pt', color: '#10253f' }}>
          <div className="border-2 border-dashed border-slate-200 rounded text-slate-300 text-xs flex items-center justify-center" style={{ height: '28mm' }}>
            מקום לבלאנק (נייר מכתבים)
          </div>

          {/* header: click to change its settings */}
          <button type="button" onClick={onHeaderClick} title="לחץ לשינוי מיקום בס״ד והתאריכים"
            className="block w-full text-start mt-3 rounded hover:bg-blue-50/60 hover:ring-1 hover:ring-blue-200 cursor-pointer" style={{ lineHeight: 1.7, color: '#000' }}>
            {hcfg.showBsd && <div style={al(hcfg.bsdAlign)}>בס&quot;ד</div>}
            {hcfg.datesLayout === 'inline'
              ? <div style={al(hcfg.datesAlign)}>{[dates.hebrew, dates.gregorian].filter(Boolean).join('    ')}</div>
              : <div style={al(hcfg.datesAlign)}>{dates.hebrew && <div>{dates.hebrew}</div>}{dates.gregorian && <div>{dates.gregorian}</div>}</div>}
          </button>

          <TitleEditor cfg={hcfg} onChange={(p) => setDraft({ ...draft, header_config: { ...hcfg, ...p } })} />

          <Region label="נמען"><CertEditorArea editor={recipient} /></Region>
          <Region label="גוף האישור" className="mt-5"><CertEditorArea editor={body} minHeight="40mm" /></Region>

          <SignerBlock html={draft.signer_html || ''} stampUrl={stampUrl || null} signatureUrl={signatureUrl || null}
            layout={layout} onLayoutChange={onLayoutChange}>
            <Region label="חתימה"><CertEditorArea editor={signer} /></Region>
          </SignerBlock>
        </div>
      </div>
    </div>
  );
}

const TITLE_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36];

/** "אישור" — edited on the page, with its own size / bold / underline controls. */
function TitleEditor({ cfg, onChange }: { cfg: CertHeaderConfig; onChange: (p: Partial<CertHeaderConfig>) => void }) {
  const size = cfg.titleSize || 16;
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? TITLE_SIZES.find((s) => s > size) : [...TITLE_SIZES].reverse().find((s) => s < size);
    if (next) onChange({ titleSize: next });
  };
  const btn = 'h-7 min-w-7 px-1.5 rounded text-xs hover:bg-slate-200';
  return (
    <div className="relative group mt-6 mb-4">
      <input value={cfg.title} onChange={(e) => onChange({ title: e.target.value })} title="כותרת האישור"
        className="block w-full text-center bg-transparent outline-none hover:bg-blue-50/60 focus:bg-blue-50/60 rounded"
        style={{
          fontSize: `${size}pt`, fontFamily: 'inherit', color: 'inherit',
          fontWeight: cfg.titleBold === false ? 'normal' : 'bold',
          textDecoration: cfg.titleUnderline === false ? 'none' : 'underline',
        }} />
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex group-focus-within:flex items-center gap-0.5 bg-white rounded-lg shadow ring-1 ring-slate-200 px-1 py-0.5 z-10">
        <button type="button" className={btn} title="הקטן" onClick={() => step(-1)}>A<sup>−</sup></button>
        <select value={size} onChange={(e) => onChange({ titleSize: Number(e.target.value) })} className="h-7 text-xs border border-slate-300 rounded px-0.5" title="גודל (נקודות)">
          {TITLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className={btn} title="הגדל" onClick={() => step(1)}>A<sup>+</sup></button>
        <button type="button" className={`${btn} ${cfg.titleBold !== false ? 'bg-blue-100 text-blue-800' : ''}`} title="מודגש" onClick={() => onChange({ titleBold: cfg.titleBold === false })}><b>B</b></button>
        <button type="button" className={`${btn} ${cfg.titleUnderline !== false ? 'bg-blue-100 text-blue-800' : ''}`} title="קו תחתון" onClick={() => onChange({ titleUnderline: cfg.titleUnderline === false })}><u>U</u></button>
      </div>
    </div>
  );
}

function Region({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative group rounded ring-1 ring-transparent hover:ring-slate-200 focus-within:ring-blue-300 ${className}`}>
      <span className="absolute -top-2.5 right-1 text-[10px] px-1 rounded bg-white text-slate-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none">{label}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- header settings

function HeaderPanel({ cfg, onChange }: { cfg: CertHeaderConfig; onChange: (p: Partial<CertHeaderConfig>) => void }) {
  const AlignPick = ({ value, set }: { value: HAlign; set: (v: HAlign) => void }) => (
    <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
      {([['right', 'ימין'], ['center', 'מרכז'], ['left', 'שמאל']] as const).map(([v, l]) => (
        <button key={v} type="button" onClick={() => set(v)} className={`flex-1 py-1.5 ${value === v ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'}`}>{l}</button>
      ))}
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.showBsd} onChange={(e) => onChange({ showBsd: e.target.checked })} /> הצג בס״ד</label>
      {cfg.showBsd && <div><div className="text-xs text-slate-500 mb-1">מיקום בס״ד</div><AlignPick value={cfg.bsdAlign} set={(v) => onChange({ bsdAlign: v })} /></div>}

      <div className="pt-2 border-t border-slate-100 space-y-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.showHebrewDate} onChange={(e) => onChange({ showHebrewDate: e.target.checked })} /> תאריך עברי</label>
        {cfg.showHebrewDate && <label className="flex items-center gap-2 ps-5"><input type="checkbox" checked={cfg.showWeekday} onChange={(e) => onChange({ showWeekday: e.target.checked })} /> כולל יום בשבוע</label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.showGregorianDate} onChange={(e) => onChange({ showGregorianDate: e.target.checked })} /> תאריך לועזי</label>
        {cfg.showGregorianDate && (
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs ms-5">
            {([['short', '28/10/26'], ['long', '28/10/2026']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => onChange({ gregorianFormat: v })} className={`flex-1 py-1.5 tabular-nums ${cfg.gregorianFormat === v ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
        )}
        <div><div className="text-xs text-slate-500 mb-1">מיקום התאריכים</div><AlignPick value={cfg.datesAlign} set={(v) => onChange({ datesAlign: v })} /></div>
        <div>
          <div className="text-xs text-slate-500 mb-1">סידור</div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
            {([['stacked', 'שורה אחר שורה'], ['inline', 'באותה שורה']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => onChange({ datesLayout: v })} className={`flex-1 py-1.5 ${cfg.datesLayout === v ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">את כותרת האישור (״אישור״) עורכים ישירות על הדף. ההגדרות חלות על ההדפסה, המייל וה-Word.</p>
    </div>
  );
}
