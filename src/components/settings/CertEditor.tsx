'use client';

// Word-like rich text editing for certificates (TipTap / ProseMirror):
// font, size (pt), bold/italic/underline, colour, real alignment (right/center/left/justify),
// bullet + numbered lists, tables, undo/redo, placeholders. One toolbar drives whichever
// editor on the page has focus. Output HTML is what lib/cert-docx.ts and the print
// preview understand (inline styles: text-align, font-size, font-family, color).

import React, { useEffect, useReducer } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';

/** Old templates are plain text with \n, or <div> lines — turn them into paragraphs. */
export function normalizeCertHtml(v: string | null | undefined): string {
  const s = v || '';
  if (!s.trim()) return '<p></p>';
  if (!/<[a-z][\s\S]*>/i.test(s)) {
    return s.split('\n').map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || ''}</p>`).join('');
  }
  let h = s.replace(/<div(\s[^>]*)?>/gi, (_m, a) => `<p${a || ''}>`).replace(/<\/div>/gi, '</p>');
  // text lines + inline HTML without block tags (e.g. "...\n{{payments_html}}")
  if (!/<(p|li|h[1-6]|table)[\s>/]/i.test(h)) h = h.split('\n').map((l) => `<p>${l}</p>`).join('');
  return h;
}

export function useCertEditor(opts: { content: string; onChange: (html: string) => void; onFocus?: (e: Editor) => void; placeholderHint?: string }) {
  return useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['right', 'center', 'left', 'justify'] }),
      TextStyleKit,
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: normalizeCertHtml(opts.content),
    editorProps: { attributes: { dir: 'rtl', class: 'cert-pm' } },
    onUpdate: ({ editor }) => opts.onChange(editor.getHTML()),
    onFocus: ({ editor }) => opts.onFocus?.(editor),
  });
}

export function CertEditorArea({ editor, minHeight }: { editor: Editor | null; minHeight?: string }) {
  return <EditorContent editor={editor} style={{ minHeight }} />;
}

// ---------------------------------------------------------------- toolbar

const FONTS = [
  { v: '', label: 'גופן ברירת מחדל (David)' },
  { v: 'David', label: 'David' },
  { v: 'Arial', label: 'Arial' },
  { v: 'Frank Ruhl Libre', label: 'Frank Ruhl' },
  { v: 'Miriam', label: 'Miriam' },
  { v: 'Narkisim', label: 'Narkisim' },
  { v: 'Times New Roman', label: 'Times New Roman' },
];
const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36];

function Btn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection in the editor
      onClick={onClick}
      className={`h-8 min-w-8 px-1.5 rounded text-sm flex items-center justify-center transition-colors disabled:opacity-30 ${on ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' : 'hover:bg-slate-200 text-slate-700'}`}>
      {children}
    </button>
  );
}
const Sep = () => <span className="w-px h-6 bg-slate-300 mx-1" />;

export function CertToolbar({ editor, placeholders }: {
  editor: Editor | null;
  placeholders?: { key: string; label: string }[];
}) {
  // re-render on every editor change so buttons show the current state
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', force);
    editor.on('focus', force);
    return () => { editor.off('transaction', force); editor.off('focus', force); };
  }, [editor]);

  const dis = !editor;
  const e = editor;
  const attrs = (e?.getAttributes('textStyle') || {}) as { fontSize?: string; fontFamily?: string; color?: string };
  const curSize = attrs.fontSize ? String(parseFloat(attrs.fontSize)) : '';
  const align = (a: string) => !!e?.isActive({ textAlign: a });
  const inTable = !!e?.isActive('table');

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl" dir="rtl">
      <Btn title="בטל (Ctrl+Z)" disabled={dis || !e!.can().undo()} onClick={() => e!.chain().focus().undo().run()}>↶</Btn>
      <Btn title="בצע שוב (Ctrl+Y)" disabled={dis || !e!.can().redo()} onClick={() => e!.chain().focus().redo().run()}>↷</Btn>
      <Sep />
      <select disabled={dis} title="גופן" value={attrs.fontFamily || ''}
        onChange={(ev) => { const v = ev.target.value; if (v) e!.chain().focus().setFontFamily(v).run(); else e!.chain().focus().unsetFontFamily().run(); }}
        className="h-8 text-sm border border-slate-300 rounded px-1 bg-white max-w-[9rem]">
        {FONTS.map((f) => <option key={f.v} value={f.v} style={{ fontFamily: f.v || 'David' }}>{f.label}</option>)}
      </select>
      <select disabled={dis} title="גודל גופן (נקודות, כמו בוורד)" value={curSize}
        onChange={(ev) => { const v = ev.target.value; if (v) e!.chain().focus().setFontSize(`${v}pt`).run(); else e!.chain().focus().unsetFontSize().run(); }}
        className="h-8 text-sm border border-slate-300 rounded px-1 bg-white w-[4.5rem]">
        <option value="">12</option>
        {SIZES.map((s) => <option key={s} value={String(s)}>{s}</option>)}
      </select>
      <Btn title="הגדל גופן" disabled={dis} onClick={() => { const cur = parseFloat(curSize || '12'); const next = SIZES.find((s) => s > cur) || cur; e!.chain().focus().setFontSize(`${next}pt`).run(); }}>A<sup>+</sup></Btn>
      <Btn title="הקטן גופן" disabled={dis} onClick={() => { const cur = parseFloat(curSize || '12'); const next = [...SIZES].reverse().find((s) => s < cur) || cur; e!.chain().focus().setFontSize(`${next}pt`).run(); }}>A<sup>−</sup></Btn>
      <Sep />
      <Btn title="מודגש (Ctrl+B)" on={e?.isActive('bold')} disabled={dis} onClick={() => e!.chain().focus().toggleBold().run()}><b>B</b></Btn>
      <Btn title="נטוי (Ctrl+I)" on={e?.isActive('italic')} disabled={dis} onClick={() => e!.chain().focus().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="קו תחתון (Ctrl+U)" on={e?.isActive('underline')} disabled={dis} onClick={() => e!.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
      <label title="צבע טקסט" className={`h-8 px-1.5 rounded flex items-center gap-1 text-sm ${dis ? 'opacity-30' : 'hover:bg-slate-200 cursor-pointer'}`}>
        <span style={{ color: attrs.color || '#10253F' }} className="font-bold">A</span>
        <input type="color" disabled={dis} value={attrs.color && attrs.color.startsWith('#') ? attrs.color : '#10253f'}
          onChange={(ev) => e!.chain().focus().setColor(ev.target.value).run()} className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer" />
      </label>
      <Sep />
      <Btn title="יישור לימין" on={align('right')} disabled={dis} onClick={() => e!.chain().focus().setTextAlign('right').run()}>
        <AlignIcon kind="right" />
      </Btn>
      <Btn title="מרכז" on={align('center')} disabled={dis} onClick={() => e!.chain().focus().setTextAlign('center').run()}>
        <AlignIcon kind="center" />
      </Btn>
      <Btn title="יישור לשמאל" on={align('left')} disabled={dis} onClick={() => e!.chain().focus().setTextAlign('left').run()}>
        <AlignIcon kind="left" />
      </Btn>
      <Btn title="יישור לשני הצדדים" on={align('justify')} disabled={dis} onClick={() => e!.chain().focus().setTextAlign('justify').run()}>
        <AlignIcon kind="justify" />
      </Btn>
      <Sep />
      <Btn title="רשימת תבליטים" on={e?.isActive('bulletList')} disabled={dis} onClick={() => e!.chain().focus().toggleBulletList().run()}>•≡</Btn>
      <Btn title="רשימה ממוספרת" on={e?.isActive('orderedList')} disabled={dis} onClick={() => e!.chain().focus().toggleOrderedList().run()}>1≡</Btn>
      <Sep />
      <Btn title="הוסף טבלה (3×3)" disabled={dis} onClick={() => e!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</Btn>
      {inTable && (
        <>
          <Btn title="הוסף שורה" disabled={dis} onClick={() => e!.chain().focus().addRowAfter().run()}>+שורה</Btn>
          <Btn title="הוסף עמודה" disabled={dis} onClick={() => e!.chain().focus().addColumnAfter().run()}>+עמודה</Btn>
          <Btn title="מחק שורה" disabled={dis} onClick={() => e!.chain().focus().deleteRow().run()}>−שורה</Btn>
          <Btn title="מחק עמודה" disabled={dis} onClick={() => e!.chain().focus().deleteColumn().run()}>−עמודה</Btn>
          <Btn title="מחק טבלה" disabled={dis} onClick={() => e!.chain().focus().deleteTable().run()}>✕▦</Btn>
        </>
      )}
      <Sep />
      <Btn title="נקה עיצוב" disabled={dis} onClick={() => e!.chain().focus().unsetAllMarks().unsetTextAlign().run()}>⌫A</Btn>
      {placeholders && placeholders.length > 0 && (
        <select disabled={dis} value="" title="הכנס שדה (שם התלמיד, ת״ז, שנה…)"
          onChange={(ev) => { const k = ev.target.value; if (k) e!.chain().focus().insertContent(`{{${k}}}`).run(); }}
          className="h-8 text-sm border border-blue-300 text-blue-800 rounded px-1 bg-blue-50 ms-1">
          <option value="">➕ הכנס שדה…</option>
          {placeholders.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      )}
    </div>
  );
}

function AlignIcon({ kind }: { kind: 'right' | 'center' | 'left' | 'justify' }) {
  const rows = [14, 9, 14, 9];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      {rows.map((w, i) => {
        const width = kind === 'justify' ? 14 : w;
        const x = kind === 'right' ? 15 - width : kind === 'left' ? 1 : (16 - width) / 2;
        return <rect key={i} x={x} y={1 + i * 3.4} width={width} height={1.6} rx={0.8} fill="currentColor" />;
      })}
    </svg>
  );
}

/** Styles for the editable areas (look like the printed certificate). */
export const CERT_PM_CSS = `
  .cert-pm { outline: none; font-family: 'David', 'Miriam', Arial, sans-serif; font-size: 12pt; line-height: 1.9; color: #10253f; }
  .cert-pm p { margin: 0; min-height: 1.9em; }
  .cert-pm ul, .cert-pm ol { padding-right: 1.6em; padding-left: 0; margin: 0; }
  .cert-pm ul { list-style: disc; } .cert-pm ol { list-style: decimal; }
  .cert-pm table { border-collapse: collapse; margin: 6px auto; width: 85%; }
  .cert-pm th, .cert-pm td { border: 1px solid #888; padding: 2px 8px; vertical-align: top; }
  .cert-pm th { background: #f2f2f2; font-weight: bold; }
  .cert-pm .selectedCell { background: #dbeafe; }
  .cert-pm:focus-visible { outline: none; }
`;
