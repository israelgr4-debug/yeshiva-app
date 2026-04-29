'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight rich-text editor for certificate body.
 * Supports B/I/U, alignment (right/center/left), font size.
 * Stores HTML in `value`. Designed to be safe-on-display when sanitized.
 */
interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Triggered after user clicks anywhere - parent uses this to know "current selection" for placeholder insertion */
  onSelectionChange?: () => void;
  /** Called when the editor's underlying div is created (for parent to manage focus / insertion) */
  onEditorReady?: (el: HTMLDivElement | null) => void;
}

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '14px', label: 'קטן' },
  { value: '18px', label: 'רגיל' },
  { value: '22px', label: 'גדול' },
  { value: '28px', label: 'ענק' },
  { value: '34px', label: 'כותרת' },
];

export function RichTextEditor({ value, onChange, onSelectionChange, onEditorReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceText, setSourceText] = useState(value);

  // Sync external value when it changes from outside (e.g. switching templates)
  useEffect(() => {
    if (showSource) {
      setSourceText(value);
      return;
    }
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value, showSource]);

  useEffect(() => {
    onEditorReady?.(ref.current);
  }, [onEditorReady]);

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (ref.current) {
      onChange(ref.current.innerHTML);
      ref.current.focus();
    }
  };

  const setSize = (size: string) => {
    if (!size) return;
    // Wrap selection in span with font-size
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.style.fontSize = size;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertHtml = (html: string) => {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand('insertHTML', false, html);
    onChange(ref.current.innerHTML);
  };

  // Expose insertHtml for parent placeholder buttons via custom event
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ html: string }>;
      insertHtml(ce.detail.html);
    };
    el.addEventListener('certEditor:insert', handler as EventListener);
    return () => {
      el.removeEventListener('certEditor:insert', handler as EventListener);
    };
  }, []);

  const Btn = ({
    cmd,
    arg,
    label,
    title,
  }: {
    cmd: string;
    arg?: string;
    label: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => exec(cmd, arg)}
      className="px-2 py-1 text-sm rounded hover:bg-slate-200 active:bg-slate-300 transition-colors"
      title={title}
    >
      {label}
    </button>
  );

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="bg-slate-50 border-b border-slate-200 px-2 py-1.5 flex flex-wrap items-center gap-0.5 text-slate-700">
        <Btn cmd="bold" label={<span className="font-bold">B</span>} title="מודגש (Ctrl+B)" />
        <Btn cmd="italic" label={<span className="italic">I</span>} title="נטוי (Ctrl+I)" />
        <Btn cmd="underline" label={<span className="underline">U</span>} title="קו תחתון (Ctrl+U)" />
        <span className="w-px h-5 bg-slate-300 mx-1" />
        {/* RTL note: in Hebrew documents, right=start. Provide all 3. */}
        <Btn cmd="justifyRight" label="⫷" title="ישור לימין" />
        <Btn cmd="justifyCenter" label="≡" title="מרכז" />
        <Btn cmd="justifyLeft" label="⫸" title="ישור לשמאל" />
        <span className="w-px h-5 bg-slate-300 mx-1" />
        <select
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => {
            setSize(e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
          className="text-sm bg-transparent border border-slate-200 rounded px-1 py-0.5"
          title="גודל גופן (סמן טקסט קודם)"
        >
          <option value="" disabled>גודל</option>
          {SIZE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Btn cmd="removeFormat" label="✕" title="נקה עיצוב" />
        <span className="ms-auto" />
        <button
          type="button"
          onClick={() => {
            if (showSource) {
              // Switching back from source - apply
              onChange(sourceText);
              if (ref.current) ref.current.innerHTML = sourceText;
            } else {
              setSourceText(ref.current?.innerHTML || value);
            }
            setShowSource((v) => !v);
          }}
          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded"
          title="צפה ב-HTML גולמי"
        >
          {showSource ? '👁 חזרה' : '< / >'}
        </button>
      </div>

      {showSource ? (
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={14}
          className="w-full p-3 font-mono text-xs leading-relaxed border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          dir="ltr"
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          dir="rtl"
          onInput={() => {
            if (ref.current) onChange(ref.current.innerHTML);
          }}
          onKeyUp={onSelectionChange}
          onMouseUp={onSelectionChange}
          className="min-h-[280px] p-4 text-base leading-relaxed focus:outline-none"
          style={{ fontFamily: "'Heebo', system-ui, sans-serif" }}
        />
      )}
    </div>
  );
}
