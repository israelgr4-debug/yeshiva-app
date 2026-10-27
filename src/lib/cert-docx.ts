// Native .docx generator for certificates (אישורים) — reproduces the layout of the
// yeshiva's original Word certificates (C:\yeshiva\Ishurim) exactly:
//   big top gap for the pre-printed letterhead · בס"ד on the right · Hebrew + Gregorian
//   date on the left · centered underlined "אישור" · recipient · body (right, indented)
//   · signer block on the left. A4, David 12pt (Arial for Latin), navy text.
// Every paragraph is a real RTL (bidi) paragraph and every Hebrew run is marked RTL, so
// punctuation, quotes (ה"ה, תשפ"ג), numbers and parentheses come out right in Word and
// the file stays fully editable.
//
// Pure string building (no DOM) — runs in the browser and in Node (for tests).

// ---------------------------------------------------------------- model

export interface DocRun {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  sz?: number;          // half-points (24 = 12pt)
  color?: string;       // hex without #
  font?: string;        // complex-script (Hebrew) font override
}

export type Align = 'start' | 'center' | 'end' | 'both';

export interface DocPara {
  runs: DocRun[];
  align?: Align;
  before?: number;      // twips
  after?: number;       // twips
  indStart?: number;    // twips from the right edge (RTL start)
  indEnd?: number;      // twips from the left edge
}

export interface DocTable {
  rows: { cells: { paras: DocPara[]; header?: boolean }[] }[];
}

export type DocBlock = { para: DocPara } | { table: DocTable };

// ---------------------------------------------------------------- page constants (from the originals)

const PAGE = { w: 11907, h: 16839, top: 357, right: 1418, bottom: 697, left: 1418 };
const TEXT_WIDTH = PAGE.w - PAGE.left - PAGE.right; // 9071
const NAVY = '10253F';
const BLACK = '000000';
const BASE_SZ = 24;

// In an RTL (bidi) paragraph Word reads jc / ind left-right as logical start-end:
// jc="left" = aligned to the RIGHT edge, w:left indent = from the right. (Verified by
// rendering the generated files in Word.)
const JC: Record<Align, string> = { start: 'left', end: 'right', center: 'center', both: 'both' };

// ---------------------------------------------------------------- XML helpers

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LRM = '\u200E';
const HEB = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
// a Latin stretch (English name, "COHEN MOSHE (Cohen)") stays one LTR run incl. inner
// spaces/parentheses, so the bidi algorithm can't scramble it
const LATIN_WORDS = /(\(?[A-Za-z][A-Za-z0-9 .,'()\-]*[A-Za-z0-9.)]|[A-Za-z])/g;

function runXml(r: DocRun): string {
  if (!r.text) return '';
  // Latin-only stretches go in their own LTR run; everything else (Hebrew, digits,
  // punctuation) is an RTL run so the bidi algorithm orders it like Word does natively.
  const parts: { t: string; rtl: boolean }[] = [];
  if (HEB.test(r.text)) {
    let last = 0;
    for (const m of r.text.matchAll(LATIN_WORDS)) {
      if (m.index! > last) parts.push({ t: r.text.slice(last, m.index), rtl: true });
      // invisible LRM marks pin edge punctuation ("(Cohen)") to the Latin run
      const t = m[0];
      parts.push({ t: (/^[^A-Za-z0-9]/.test(t) ? LRM : '') + t + (/[^A-Za-z0-9]$/.test(t) ? LRM : ''), rtl: false });
      last = m.index! + m[0].length;
    }
    if (last < r.text.length) parts.push({ t: r.text.slice(last), rtl: true });
  } else {
    parts.push({ t: r.text, rtl: !/[A-Za-z]/.test(r.text) });
  }
  const sz = r.sz || BASE_SZ;
  const cs = r.font || 'David';
  return parts.filter((p) => p.t).map((p) => {
    const rPr =
      `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="${esc(cs)}"/>` +
      (r.b ? '<w:b/><w:bCs/>' : '') +
      (r.i ? '<w:i/><w:iCs/>' : '') +
      `<w:color w:val="${r.color || NAVY}"/>` +
      `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
      (r.u ? '<w:u w:val="single"/>' : '') +
      (p.rtl ? '<w:rtl/>' : '<w:rtl w:val="0"/>') + // explicit LTR — Normal style defaults runs to RTL
      '<w:lang w:val="en-US" w:bidi="he-IL"/>';
    // tabs inside text → real tab elements
    const chunks = p.t.split('\t');
    const body = chunks.map((c, i) => (i ? '<w:tab/>' : '') + (c ? `<w:t xml:space="preserve">${esc(c)}</w:t>` : '')).join('');
    return `<w:r><w:rPr>${rPr}</w:rPr>${body}</w:r>`;
  }).join('');
}

function paraXml(p: DocPara): string {
  const ind = p.indStart || p.indEnd ? `<w:ind w:left="${p.indStart || 0}" w:right="${p.indEnd || 0}"/>` : '';
  const pPr =
    '<w:pPr><w:bidi/>' +
    `<w:spacing w:before="${p.before ?? 0}" w:after="${p.after ?? 0}" w:line="240" w:lineRule="auto"/>` +
    ind +
    `<w:jc w:val="${JC[p.align || 'start']}"/>` +
    '<w:rPr><w:rtl/></w:rPr></w:pPr>';
  return `<w:p>${pPr}${p.runs.map(runXml).join('')}</w:p>`;
}

function tableXml(t: DocTable): string {
  const cols = Math.max(1, ...t.rows.map((r) => r.cells.length));
  const width = Math.round(TEXT_WIDTH * 0.85);
  const colW = Math.floor(width / cols);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const tblPr =
    '<w:tblPr><w:bidiVisual/>' +
    `<w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>';
  const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`;
  const rows = t.rows.map((r) => {
    const cells = r.cells.map((c) => {
      const tcPr = `<w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${c.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>`;
      const paras = (c.paras.length ? c.paras : [{ runs: [] }]).map((p) => paraXml({ ...p, before: 0, after: 0, runs: p.runs.map((x) => ({ ...x, b: x.b || c.header })) }));
      return `<w:tc>${tcPr}${paras.join('')}</w:tc>`;
    });
    for (let i = r.cells.length; i < cols; i++) cells.push(`<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
    return `<w:tr>${cells.join('')}</w:tr>`;
  });
  return tblPr ? `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>` : '';
}

// ---------------------------------------------------------------- tiny HTML → blocks

interface Style { b?: boolean; i?: boolean; u?: boolean; sz?: number; align?: Align }

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'header', 'footer']);
const HEADING_SZ: Record<string, number> = { h1: 32, h2: 30, h3: 28, h4: 26, h5: 24, h6: 24 };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, '\u00A0').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

function styleFrom(tag: string, attrs: string, parent: Style): Style {
  const s: Style = { ...parent };
  if (tag === 'b' || tag === 'strong') s.b = true;
  if (tag === 'i' || tag === 'em') s.i = true;
  if (tag === 'u' || tag === 'ins') s.u = true;
  if (HEADING_SZ[tag]) { s.b = true; s.sz = HEADING_SZ[tag]; }
  if (tag === 'th') s.b = true;
  const css = attr(attrs, 'style') || '';
  const fs = css.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)?/i);
  if (fs) s.sz = Math.round(Number(fs[1]) * (fs[2]?.toLowerCase() === 'pt' ? 2 : 1.5)); // px → half-points (×0.75×2)
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(css)) s.b = true;
  if (/font-weight\s*:\s*(normal|[1-4]00)/i.test(css)) s.b = false;
  if (/font-style\s*:\s*italic/i.test(css)) s.i = true;
  if (/text-decoration[^;]*underline/i.test(css)) s.u = true;
  const ta = (css.match(/text-align\s*:\s*(\w+)/i)?.[1] || attr(attrs, 'align') || '').toLowerCase();
  if (ta) s.align = ta === 'center' ? 'center' : ta === 'left' ? 'end' : ta === 'justify' ? 'both' : 'start';
  if (tag === 'font') {
    const size = Number(attr(attrs, 'size'));
    if (size) s.sz = [0, 16, 20, 24, 28, 36, 48, 72][Math.min(7, Math.max(1, size))];
  }
  return s;
}

/**
 * Convert template HTML (or plain text with \n) into blocks. `emphasize` = values to
 * render in bold wherever they appear (student name / ID / dates — as in the originals).
 */
export function htmlToBlocks(input: string, opts: { emphasize?: string[]; baseSz?: number; lineBefore?: number } = {}): DocBlock[] {
  const lineBefore = opts.lineBefore ?? 120;
  let html = input || '';
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    html = html.split('\n').map((l) => `<p>${esc(l)}</p>`).join('');
  } else if (!/<(p|div|br|li|h[1-6])[\s>/]/i.test(html)) {
    // text lines + inline HTML (e.g. a payments <table>) without block tags: keep the line breaks
    html = html.replace(/\n/g, '<br>');
  }
  const emph = (opts.emphasize || []).filter((v) => v && v.trim().length > 1).sort((a, b) => b.length - a.length);

  const blocks: DocBlock[] = [];
  let cur: DocPara | null = null;
  const stack: { tag: string; style: Style }[] = [{ tag: '#root', style: { sz: opts.baseSz } }];
  let table: DocTable | null = null;
  let row: DocTable['rows'][number] | null = null;
  let cell: { paras: DocPara[]; header?: boolean } | null = null;

  const style = () => stack[stack.length - 1].style;
  const target = (p: DocPara) => { if (cell) cell.paras.push(p); else blocks.push({ para: p }); };
  const newPara = () => {
    cur = { runs: [], align: style().align, before: lineBefore };
    target(cur);
  };
  const ensurePara = () => { if (!cur) newPara(); return cur!; };
  const closePara = () => { cur = null; };

  const pushText = (raw: string) => {
    const text = decodeEntities(raw).replace(/[\r\n]+/g, ' ');
    if (!text) return;
    if (!cur && !text.trim()) return; // whitespace between blocks
    const p = ensurePara();
    const st = style();
    // split around emphasized values → bold
    let pieces: { t: string; b: boolean }[] = [{ t: text, b: false }];
    for (const v of emph) {
      pieces = pieces.flatMap((pc) => {
        if (pc.b || !pc.t.includes(v)) return [pc];
        const out: { t: string; b: boolean }[] = [];
        pc.t.split(v).forEach((seg, i, arr) => {
          if (seg) out.push({ t: seg, b: false });
          if (i < arr.length - 1) out.push({ t: v, b: true });
        });
        return out;
      });
    }
    for (const pc of pieces) p.runs.push({ text: pc.t, b: st.b || pc.b, i: st.i, u: st.u, sz: st.sz });
  };

  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*?)(\/?)\s*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) { pushText(m[5]); continue; }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClosing = m[4] === '/' || tag === 'br' || tag === 'hr' || tag === 'img';

    if (tag === 'br') { if (cur) closePara(); else newPara(), closePara(); continue; }
    if (tag === 'table') {
      if (!closing) { closePara(); table = { rows: [] }; } else if (table) { blocks.push({ table }); table = null; closePara(); }
      continue;
    }
    if (tag === 'tr') { if (!closing && table) { row = { cells: [] }; table.rows.push(row); } else row = null; continue; }
    if (tag === 'td' || tag === 'th') {
      if (!closing && row) {
        cell = { paras: [], header: tag === 'th' };
        row.cells.push(cell);
        stack.push({ tag, style: styleFrom(tag, attrs, style()) });
        closePara();
      } else if (closing) {
        cell = null; closePara();
        while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop();
        if (stack.length > 1) stack.pop();
      }
      continue;
    }
    if (['thead', 'tbody', 'tfoot', 'colgroup', 'col', 'caption'].includes(tag)) continue;

    if (closing) {
      // pop to the matching tag
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag) i--;
      if (i > 0) stack.length = i;
      if (BLOCK_TAGS.has(tag)) {
        // an empty block (e.g. <p></p> or <p><br></p>) = blank line
        closePara();
      }
      continue;
    }
    if (selfClosing) continue;
    const st = styleFrom(tag, attrs, style());
    stack.push({ tag, style: st });
    if (BLOCK_TAGS.has(tag)) {
      newPara();
      if (tag === 'li') cur!.runs.push({ text: '• ', sz: st.sz });
    }
  }

  // blank lines (empty paragraphs) → extra spacing on the next line instead of empty paras
  const out: DocBlock[] = [];
  let extra = 0;
  for (const b of blocks) {
    if ('para' in b && b.para.runs.every((r) => !r.text.trim())) { extra += 240; continue; }
    if ('para' in b && extra) b.para.before = (b.para.before || 0) + extra;
    extra = 0;
    out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------- document assembly

function documentXml(blocks: DocBlock[]): string {
  const body = blocks.map((b) => ('para' in b ? paraXml(b.para) : tableXml(b.table))).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}" w:code="9"/>` +
    `<w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="720" w:footer="720" w:gutter="0"/>` +
    '<w:cols w:space="720"/><w:bidi/><w:docGrid w:linePitch="299"/></w:sectPr>' +
    '</w:body></w:document>';
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="David"/>' +
  `<w:sz w:val="${BASE_SZ}"/><w:szCs w:val="${BASE_SZ}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="he-IL"/></w:rPr></w:rPrDefault>` +
  '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>' +
  '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:bidiVisual/><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '</w:styles>';

const SETTINGS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>' +
  '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
  '<w:themeFontLang w:val="en-US" w:bidi="he-IL"/>' +
  '</w:settings>';

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '</Types>';

const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

const DOC_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  '</Relationships>';

/** All package parts (path → XML) for the given blocks. */
export function docxParts(blocks: DocBlock[]): Record<string, string> {
  return {
    '[Content_Types].xml': CONTENT_TYPES_XML,
    '_rels/.rels': RELS_XML,
    'word/document.xml': documentXml(blocks),
    'word/_rels/document.xml.rels': DOC_RELS_XML,
    'word/styles.xml': STYLES_XML,
    'word/settings.xml': SETTINGS_XML,
  };
}

// ---------------------------------------------------------------- certificate / receipt layouts

export interface CertificateModel {
  hebrewDate: string;        // "יום שלישי ט"ז חשון תשפ"ז"
  gregorianDate: string;     // "27/10/26"
  title: string;             // "אישור"
  recipient: string;
  bodyHtml: string;          // rendered body (HTML or plain text)
  signerHtml?: string | null; // rendered signer block (HTML) — or use signerLines
  signerLines?: string[];
  emphasize?: string[];
}

/** Signer block sits centred around x≈4.3cm from the left edge, like the originals. */
const SIGNER_IND_START = 4300;

export function certificateBlocks(m: CertificateModel): DocBlock[] {
  const blocks: DocBlock[] = [];
  const P = (p: DocPara) => blocks.push({ para: p });

  // header — positions taken from the originals
  P({ before: 3795, indStart: 340, runs: [{ text: 'בס"ד', color: BLACK }] });
  P({ before: 120, align: 'end', runs: [{ text: m.hebrewDate, color: BLACK }] });
  P({ before: 120, align: 'end', runs: [{ text: m.gregorianDate }] });
  P({ before: 782, align: 'center', runs: [{ text: m.title || 'אישור', b: true, u: true, sz: 32 }] });
  if (m.recipient?.trim()) {
    const rb = htmlToBlocks(m.recipient, { lineBefore: 0 });
    rb.forEach((b, i) => {
      if ('para' in b) { b.para.before = i === 0 ? 351 : 0; b.para.indStart = 340; }
      blocks.push(b);
    });
  }

  // body
  const body = htmlToBlocks(m.bodyHtml, { emphasize: m.emphasize, lineBefore: 120 });
  body.forEach((b, i) => {
    if ('para' in b) {
      b.para.indStart = (b.para.indStart || 0) + 340;
      if (i === 0) b.para.before = Math.max(b.para.before || 0, 600);
    }
    blocks.push(b);
  });

  // signer
  const signerBlocks = m.signerHtml
    ? htmlToBlocks(m.signerHtml, { lineBefore: 0 })
    : (m.signerLines || []).filter(Boolean).map((t) => ({ para: { runs: [{ text: t }] } as DocPara }));
  signerBlocks.forEach((b, i) => {
    if ('para' in b) {
      b.para.align = b.para.align === 'start' || !b.para.align ? 'center' : b.para.align;
      b.para.indStart = SIGNER_IND_START;
      b.para.before = i === 0 ? 1092 : (b.para.before || 0) + 60;
    }
    blocks.push(b);
  });
  return blocks;
}

export interface ReceiptModel {
  donorName: string; donorId: string; donorAddress: string; donorCity: string;
  amount: string; amountWords: string; paymentMethod: string; receiptNumber: string;
  gregorianDate: string;   // dd/MM/yyyy
  hebrewDateShort: string; // ט"ז חשון תשפ"ז
}

/** קבלה סעיף 46 — layout of the original receipt (Guttman fonts). */
export function receiptBlocks(r: ReceiptModel): DocBlock[] {
  const H = 'Guttman Mantova', A = 'Guttman-Aram';
  const blocks: DocBlock[] = [];
  const P = (p: DocPara) => blocks.push({ para: p });
  const t = (text: string, extra: Partial<DocRun> = {}): DocRun => ({ text, font: A, color: BLACK, sz: 24, ...extra });
  P({ before: 3500, runs: [t('לכבוד', { font: H, b: true })] });
  P({ before: 120, runs: [t(`${r.donorName || '___'}${r.donorId ? ` ע"ר ${r.donorId}` : ''}`, { font: H, b: true })] });
  if (r.donorAddress) P({ before: 120, runs: [t(r.donorAddress, { font: H, b: true })] });
  if (r.donorCity) P({ before: 120, runs: [t(r.donorCity, { font: H, b: true })] });
  P({ before: 480, runs: [t('שלומים מרובים')] });
  P({ before: 600, align: 'both', runs: [t('בשם הנהלת ישיבת מיר מודיעין עילית, ראשיה, ותלמידיה, הננו להביע מעומק הלב רגשי תודה וההערכה למע"כ, על תרומתכם הנדיבה.')] });
  P({ before: 200, align: 'both', runs: [t('בתרומה זו הנכם שותפים נאמנים בהחזקתו של מבצר התורה הגדול.')] });
  P({ before: 200, align: 'both', runs: [t('יהי רצון שזכות לימוד התורה של תלמידי הישיבה, תעמוד לכם ולמשפחתכם, שלא תמוש התורה מפיכם ומפי זרעכם עד עולם. ותזכו לשפע של ברכה והצלחה, ברוחניות ובגשמיות.')] });
  P({ before: 200, align: 'center', runs: [t('בברכת התורה')] });
  P({ before: 200, align: 'center', runs: [t('ישיבת מיר מודיעין עילית')] });
  P({ before: 900, align: 'center', runs: [t(`קבלה מספר ${r.receiptNumber || '___'}`)] });
  P({ before: 400, indStart: 700, runs: [t('מקור – תרומה')] });
  P({ before: 120, indStart: 700, runs: [t(r.gregorianDate)] });
  P({ before: 400, align: 'end', runs: [t(r.hebrewDateShort)] });
  P({ before: 400, indStart: 700, runs: [t(`נתקבל בברכה מאת ${r.donorName || '___'}${r.donorAddress ? `, ${r.donorAddress}` : ''}${r.donorCity ? ` ${r.donorCity}` : ''}`)] });
  P({ before: 200, indStart: 700, runs: [t(`סך ${r.amount || '___'} (${r.amountWords || '___'}) שח`)] });
  P({ before: 200, indStart: 700, runs: [t(`שולם ב${r.paymentMethod || '___'}`)] });
  P({ before: 900, runs: [t('למוסד אישור מס הכנסה לענין תרומות פי סעיף 46 לפקודה.', { font: 'David' })] });
  return blocks;
}

// ---------------------------------------------------------------- dates (as in the originals)

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "יום שלישי" for a date */
export const hebrewWeekday = (d: Date) => `יום ${WEEKDAYS[d.getDay()]}`;

/** "27/10/26" */
export function shortGregorian(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
