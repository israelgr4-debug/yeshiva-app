// מס"ב (MASAV) direct-debit "חיובים עפ"י הרשאה" file generator.
// Implements the OFFICIAL spec (mifrat_hiuvim_msv): 128-byte fixed-width records,
// header ('K' … 'KOT'), transaction ('1'), total ('5'), then a final all-9's record.
// Each record is terminated by CR+LF (positions 129-130). Numeric (N) fields are
// digits only, right-justified with leading zeros. Text (X) fields are left-justified
// with trailing spaces (except the institution/customer name — right-justified).
//
// CRITICAL: the file must be a SINGLE-BYTE Hebrew encoding (Windows-1255) so every
// record is exactly 128 bytes. UTF-8 Hebrew is 2 bytes/char and breaks the record
// length — a common reason מס"ב rejects a file. Use downloadMasavFile() to write the
// correctly-encoded bytes.

export interface MasavCharge {
  reference: string;   // asmachta — right-justified, leading zeros; rightmost 6 numeric, ≥1 non-zero, stable per הרשאה
  bankNumber: number;  // 2 digits
  branch: number;      // 3 digits
  accountNumber: string; // up to 9 digits
  payerIdNumber: string; // ת"ז (9 digits)
  payerName: string;   // up to 16 chars in the file
  amountAgorot: number; // amount × 100, must be > 0
}

export interface MasavHeaderInfo {
  mosadNumber: string;   // מוסד/נושא — 8 digits (given by מס"ב)
  senderNumber: string;  // מוסד שולח — 5 digits (given by מס"ב)
  mosadName: string;     // institution name (printed on the record)
  chargeDate: string;    // YYYY-MM-DD — value date (תאריך חיוב)
  sendCounter: number;   // serial (מספר סידורי) — 3 digits
  creationDate?: string; // YYYY-MM-DD — file creation date; defaults to today
}

// --- padding -----------------------------------------------------------------
function zeros(v: string | number, len: number): string {
  const s = String(v).replace(/[^\d]/g, '');
  if (s.length >= len) return s.slice(-len); // keep the rightmost `len` digits
  return '0'.repeat(len - s.length) + s;
}
function padRightText(v: string, len: number): string {
  const s = String(v || '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}
function padLeftText(v: string, len: number): string {
  const s = String(v || '');
  return s.length >= len ? s.slice(0, len) : ' '.repeat(len - s.length) + s;
}

// Keep only characters expressible in Windows-1255 (Hebrew letters, ASCII, basic punct).
function cleanName(s: string): string {
  return (s || '').replace(/[^א-ת\s\-'".A-Za-z0-9]/g, '').trim();
}

// YYYY-MM-DD → YYMMDD (parsed manually to avoid timezone shifts).
function yymmdd(dateISO: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(dateISO || '');
  if (!m) return '000000';
  return m[1].slice(2) + m[2] + m[3];
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Right-justified asmachta (20), leading zeros. Ensure the 6 rightmost are numeric
// with at least one non-zero (spec requirement).
function formatReference(ref: string): string {
  let digits = String(ref || '').replace(/[^\d]/g, '');
  if (!digits || /^0+$/.test(digits)) digits = '000001';
  return zeros(digits, 20);
}

// =============================================================================
// Build the מס"ב file (128 chars per record; Hebrew still as single chars — the
// byte encoding to Windows-1255 happens in downloadMasavFile).
// =============================================================================
export function buildMasavFile(header: MasavHeaderInfo, charges: MasavCharge[]): string {
  const mosad = zeros(header.mosadNumber, 8);
  const sender = zeros(header.senderNumber || '0', 5);
  const serial = zeros(header.sendCounter, 3);
  const chargeDate = yymmdd(header.chargeDate);
  const creationDate = yymmdd(header.creationDate || todayISO());
  const CURRENCY = '00';

  const recs: string[] = [];

  // ---- HEADER (רשומת כותרת) ----
  let h = '';
  h += 'K';                              // 1    (1)  זיהוי רשומה
  h += mosad;                            // 2-9  (8)  מוסד/נושא
  h += CURRENCY;                         // 10-11(2)  מטבע
  h += chargeDate;                       // 12-17(6)  תאריך החיוב YYMMDD
  h += '0';                              // 18   (1)  FILLER
  h += serial;                           // 19-21(3)  מספר סידורי
  h += '0';                              // 22   (1)  FILLER
  h += creationDate;                     // 23-28(6)  תאריך יצירת הסרט YYMMDD
  h += sender;                           // 29-33(5)  מוסד שולח
  h += '000000';                         // 34-39(6)  FILLER
  h += padLeftText(cleanName(header.mosadName), 30); // 40-69 (30) שם המוסד — צמוד לימין
  h += ' '.repeat(56);                   // 70-125(56) FILLER
  h += 'KOT';                            // 126-128(3) זיהוי כותרת
  recs.push(h);

  // ---- TRANSACTIONS (רשומת תנועה) ----
  let totalAgorot = 0;
  for (const c of charges) {
    let r = '';
    r += '1';                            // 1     (1)  זיהוי רשומה
    r += mosad;                          // 2-9   (8)  מוסד/נושא
    r += CURRENCY;                       // 10-11 (2)  מטבע
    r += '000000';                       // 12-17 (6)  FILLER
    r += zeros(c.bankNumber, 2);         // 18-19 (2)  קוד בנק
    r += zeros(c.branch, 3);             // 20-22 (3)  מספר סניף
    r += '0000';                         // 23-26 (4)  סוג חשבון — אפסים
    r += zeros(c.accountNumber, 9);      // 27-35 (9)  מספר חשבון
    r += '0';                            // 36    (1)  FILLER
    r += zeros(c.payerIdNumber, 9);      // 37-45 (9)  מס' זיהוי הלקוח (ת"ז)
    r += padRightText(cleanName(c.payerName), 16); // 46-61 (16) שם הלקוח
    r += zeros(c.amountAgorot, 13);      // 62-74 (13) סכום לחיוב (11 ש"ח + 2 אג')
    r += formatReference(c.reference);   // 75-94 (20) אסמכתא
    r += '00000000';                     // 95-102(8)  תקופת החיוב — אפסים
    r += '000';                          // 103-105(3) קוד מלל
    r += '504';                          // 106-108(3) סוג תנועה — חיוב רגיל
    r += '0'.repeat(18);                 // 109-126(18) FILLER
    r += '  ';                           // 127-128(2) FILLER
    recs.push(r);
    totalAgorot += c.amountAgorot;
  }

  // ---- TOTAL (רשומת סה"כ) ----
  let f = '';
  f += '5';                              // 1     (1)  זיהוי רשומה
  f += mosad;                            // 2-9   (8)  מוסד/נושא
  f += CURRENCY;                         // 10-11 (2)  מטבע
  f += chargeDate;                       // 12-17 (6)  תאריך החיוב
  f += '0';                              // 18    (1)  FILLER
  f += serial;                           // 19-21 (3)  מספר סידורי
  f += '0'.repeat(15);                   // 22-36 (15) FILLER
  f += zeros(totalAgorot, 15);           // 37-51 (15) סכום התנועות
  f += '0'.repeat(7);                    // 52-58 (7)  FILLER
  f += zeros(charges.length, 7);         // 59-65 (7)  מספר התנועות
  f += ' '.repeat(63);                   // 66-128(63) FILLER
  recs.push(f);

  // ---- Trailing all-9's record (after the last logical file) ----
  recs.push('9'.repeat(128));

  // Every record MUST be exactly 128 chars.
  const normalized = recs.map((r) => (r.length > 128 ? r.slice(0, 128) : r + ' '.repeat(128 - r.length)));
  return normalized.join('\r\n') + '\r\n';
}

// --- Windows-1255 (Hebrew) single-byte encoder -------------------------------
// Maps ASCII 0x20-0x7E as-is, Hebrew alef..tav (U+05D0..U+05EA) → 0xE0..0xFA,
// everything else → space. Guarantees 1 byte per record char → 128-byte records.
function encodeWin1255(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x0d || code === 0x0a) out[i] = code;            // CR / LF
    else if (code >= 0x20 && code <= 0x7e) out[i] = code;          // ASCII
    else if (code >= 0x05d0 && code <= 0x05ea) out[i] = 0xe0 + (code - 0x05d0); // Hebrew
    else out[i] = 0x20;                                            // fallback: space
  }
  return out;
}

// Download the מס"ב file as correctly-encoded Windows-1255 bytes.
export function downloadMasavFile(filename: string, content: string) {
  const bytes = encodeWin1255(content);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Human-readable CSV for preview / bank confirmation (UTF-8 with BOM for Excel).
export function buildMasavCsv(charges: MasavCharge[]): string {
  const header = ['תאריך', 'בנק', 'סניף', 'מספר חשבון', 'ת.ז.', 'שם', 'סכום (₪)', 'אסמכתא'].join(',');
  const lines = charges.map((c) =>
    [
      '',
      c.bankNumber,
      c.branch,
      c.accountNumber,
      c.payerIdNumber,
      `"${c.payerName.replace(/"/g, '""')}"`,
      (c.amountAgorot / 100).toFixed(2),
      c.reference,
    ].join(',')
  );
  return '﻿' + header + '\r\n' + lines.join('\r\n') + '\r\n';
}

// Generic text download (used by the CSV preview and elsewhere).
export function downloadFile(filename: string, content: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
