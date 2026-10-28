'use client';

import React, { useRef } from 'react';
import { SignLayout, ImgPos, hasExplicitAlign } from '@/lib/cert-layout';

// The signer block ("בכבוד רב, / name / ID / title") + the stamp and signature images,
// positioned in mm relative to the block. Used by the certificate preview (print / email)
// AND by the certificate editor, where the images can be dragged — so what you place in
// the editor is exactly where it prints.

const MM = 96 / 25.4; // px per mm at 100%

interface Props {
  html: string;                       // rendered signer HTML (placeholders already filled)
  stampUrl?: string | null;
  signatureUrl?: string | null;
  layout: SignLayout;
  /** editor only: drag the images, report the new layout */
  onLayoutChange?: (l: SignLayout) => void;
  /** editor only: the HTML area is an editable element instead of static HTML */
  children?: React.ReactNode;
}

export function SignerBlock({ html, stampUrl, signatureUrl, layout, onLayoutChange, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  // no alignment chosen anywhere → the classic block on the left side (like the originals)
  const classic = !hasExplicitAlign(html);
  const classicStyle: React.CSSProperties | undefined = classic ? { width: '42%', marginInlineStart: 'auto', textAlign: 'center' } : undefined;

  const startDrag = (which: keyof SignLayout) => (e: React.PointerEvent<HTMLImageElement>) => {
    if (!onLayoutChange || !boxRef.current) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, pos: layout[which] };
    // the box may be scaled on screen — measure the real px per mm
    const scale = boxRef.current.getBoundingClientRect().width / boxRef.current.offsetWidth || 1;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / (MM * scale);
      const dy = (ev.clientY - start.y) / (MM * scale);
      onLayoutChange({ ...layout, [which]: { ...start.pos, x: Math.round((start.pos.x + dx) * 2) / 2, y: Math.round((start.pos.y + dy) * 2) / 2 } });
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const resize = (which: keyof SignLayout, delta: number) => {
    if (!onLayoutChange) return;
    const p = layout[which];
    onLayoutChange({ ...layout, [which]: { ...p, h: Math.max(6, Math.min(60, p.h + delta)) } });
  };

  const img = (which: keyof SignLayout, url: string, label: string, z: number) => {
    const p: ImgPos = layout[which];
    return (
      <div style={{ position: 'absolute', top: `${p.y}mm`, left: `calc(50% + ${p.x}mm)`, transform: 'translateX(-50%)', zIndex: z }}
        className={onLayoutChange ? 'group' : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} draggable={false} onPointerDown={startDrag(which)}
          style={{ height: `${p.h}mm`, width: 'auto', display: 'block', cursor: onLayoutChange ? 'move' : undefined, touchAction: 'none' }}
          className={onLayoutChange ? 'outline-dashed outline-1 outline-transparent hover:outline-blue-400' : undefined} />
        {onLayoutChange && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-1 text-[11px] bg-white/95 rounded shadow px-1 no-print">
            <span className="px-1 text-slate-500">{label}</span>
            <button type="button" className="px-1 hover:bg-slate-100 rounded" onClick={() => resize(which, -2)}>−</button>
            <button type="button" className="px-1 hover:bg-slate-100 rounded" onClick={() => resize(which, 2)}>+</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={boxRef} className="certificate-signature" style={{ position: 'relative', marginTop: '18mm', minHeight: '34mm', lineHeight: 1.8 }}>
      {children
        ? <div style={classicStyle}>{children}</div>
        : <div style={classicStyle} dangerouslySetInnerHTML={{ __html: html }} />}
      {stampUrl && img('stamp', stampUrl, 'חותמת', 2)}
      {signatureUrl && img('signature', signatureUrl, 'חתימה', 3)}
    </div>
  );
}
