// Layout settings shared by every certificate output (screen preview, print, email PDF,
// Word): the header (בס"ד + dates + title) and where the stamp / signature images sit.
// The header is CONFIG, not free HTML — free HTML with flex rows "jumped" in the editor.

import { toHebrewDate } from './utils';

export type HAlign = 'right' | 'center' | 'left';

export interface CertHeaderConfig {
  showBsd: boolean;
  bsdAlign: HAlign;
  datesAlign: HAlign;
  /** stacked = Hebrew date and Gregorian date on separate lines */
  datesLayout: 'stacked' | 'inline';
  showHebrewDate: boolean;
  showWeekday: boolean;
  showGregorianDate: boolean;
  /** short = 28/10/26 (as in the original Word certificates), long = 28/10/2026 */
  gregorianFormat: 'short' | 'long';
  title: string;
}

export const DEFAULT_HEADER: CertHeaderConfig = {
  showBsd: true,
  bsdAlign: 'right',
  datesAlign: 'left',
  datesLayout: 'stacked',
  showHebrewDate: true,
  showWeekday: true,
  showGregorianDate: true,
  gregorianFormat: 'short',
  title: 'אישור',
};

/** Merge a stored config over the defaults; legacy templates take the title from header_html <h1>. */
export function headerConfigOf(raw: any, legacyHeaderHtml?: string | null): CertHeaderConfig {
  const cfg: CertHeaderConfig = { ...DEFAULT_HEADER, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!raw && legacyHeaderHtml) {
    const m = legacyHeaderHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const t = m ? m[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim() : '';
    if (t && !/\{\{/.test(t)) cfg.title = t;
  }
  return cfg;
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** The two date strings exactly as the header shows them. */
export function certDates(cfg: CertHeaderConfig, now = new Date()): { hebrew: string; gregorian: string } {
  const heb = toHebrewDate(now);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return {
    hebrew: cfg.showHebrewDate ? (cfg.showWeekday ? `יום ${WEEKDAYS[now.getDay()]} ${heb}` : heb) : '',
    gregorian: cfg.showGregorianDate ? `${dd}/${mm}/${cfg.gregorianFormat === 'long' ? yyyy : yyyy.slice(2)}` : '',
  };
}

// ---------------------------------------------------------------- stamp / signature

/** Position of an image relative to the signer block (full text width): x = mm from the
 *  block's horizontal centre to the image centre (negative = left, positive = right),
 *  y = mm from the block's top, h = image height in mm. */
export interface ImgPos { x: number; y: number; h: number }
export interface SignLayout { stamp: ImgPos; signature: ImgPos }

// default: beside the classic signer block on the left side of the page
export const DEFAULT_SIGN_LAYOUT: SignLayout = {
  stamp: { x: -20, y: 4, h: 26 },
  signature: { x: -20, y: 12, h: 16 },
};

export function signLayoutOf(raw: any): SignLayout {
  const ok = (p: any, d: ImgPos): ImgPos => ({
    x: Number.isFinite(Number(p?.x)) ? Number(p.x) : d.x,
    y: Number.isFinite(Number(p?.y)) ? Number(p.y) : d.y,
    h: Number(p?.h) > 4 ? Number(p.h) : d.h,
  });
  return { stamp: ok(raw?.stamp, DEFAULT_SIGN_LAYOUT.stamp), signature: ok(raw?.signature, DEFAULT_SIGN_LAYOUT.signature) };
}

/** Does this HTML set its own alignment anywhere? (signer block: none → classic left block) */
export const hasExplicitAlign = (html: string | null | undefined) => /text-align\s*:|align\s*=/i.test(html || '');
