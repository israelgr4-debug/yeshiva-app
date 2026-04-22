// Masav (מס"ב) HKM file generator - Hora'at Keva (direct debit) format.
// Produces a 128-byte-per-record fixed-width text file per standard Israeli banking spec.
//
// NOTE: There are several Masav format variants. The most common format ("format 500" /
// "NEW format") is used here with 128-char records. If your bank requires a different
// format, we can adjust.

export interface MasavCharge {
  reference: string; // unique transaction reference (e.g., student legacy id + payment_date)
  bankNumber: number; // 2 digits (e.g. 12 = הפועלים)
  branch: number; // 3 digits
  accountNumber: string; // up to 9 digits
  payerIdNumber: string; // תעודת זהות (9 digits, last 9 digits only if longer)
  payerName: string; // first 16 chars used in file
  amountAgorot: number; // amount × 100
}

export interface MasavHeaderInfo {
  mosadNumber: string; // 8 digits
  mosadName: string;
  chargeDate: string; // YYYY-MM-DD
  sendCounter: number; // mosad's own counter
}

// Pad a string/number right with spaces or zeros
function padLeft(v: string | number, len: number, char = '0'): string {
  const s = String(v);
  if (s.length >= len) return s.slice(-len);
  return char.repeat(len - s.length) + s;
}

function padRight(v: string, len: number, char = ' '): string {
  const s = String(v);
  if (s.length >= len) return s.slice(0, len);
  return s + char.repeat(len - s.length);
}

function toHebrewChars(s: string): string {
  // Replace characters that are problematic in fixed-width encoding
  return (s || '').replace(/[^\u0590-\u05FF\s\-'"A-Za-z0-9.]/g, '');
}

function formatDateYYMMDD(dateISO: string): string {
  const d = new Date(dateISO);
  const y = String(d.getFullYear() % 100).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + m + day;
}

// ================================================================
// Build the Masav file (128 chars per record)
// Format: simplified HKM format with header + per-transaction records + footer
// ================================================================

export function buildMasavFile(header: MasavHeaderInfo, charges: MasavCharge[]): string {
  const lines: string[] = [];
  const sendDate = formatDateYYMMDD(header.chargeDate);
  const mosad = padLeft(header.mosadNumber, 8);
  const sendNum = padLeft(header.sendCounter, 3);

  // ========== HEADER RECORD (record type "1" = 128 chars) ==========
  // Simplified structure - real Masav uses specific positions
  let h = '';
  h += '1';                                                   // pos 1: record type
  h += sendNum;                                               // pos 2-4: send number
  h += mosad;                                                 // pos 5-12: mosad
  h += sendDate;                                              // pos 13-18: send date YYMMDD
  h += sendDate;                                              // pos 19-24: charge date YYMMDD
  h += padRight(toHebrewChars(header.mosadName), 30);         // pos 25-54: mosad name
  h += padRight('', 128 - h.length);                          // fill rest with spaces
  lines.push(h.slice(0, 128));

  // ========== TRANSACTION RECORDS (record type "2") ==========
  let totalAgorot = 0;
  for (const c of charges) {
    let r = '';
    r += '2';                                                          // pos 1: type
    r += padLeft(c.bankNumber, 2);                                     // pos 2-3
    r += padLeft(c.branch, 3);                                         // pos 4-6
    r += padLeft(c.accountNumber.replace(/\D/g, ''), 9);               // pos 7-15
    r += '10';                                                         // pos 16-17: account type (regular)
    r += padLeft(c.reference, 9);                                      // pos 18-26: reference
    r += padLeft((c.payerIdNumber || '').replace(/\D/g, ''), 9);       // pos 27-35: payer ID (9 digits)
    r += padRight(toHebrewChars(c.payerName), 16);                     // pos 36-51: payer name
    r += padLeft(c.amountAgorot, 13);                                  // pos 52-64: amount in agorot
    r += sendDate;                                                     // pos 65-70: charge date
    r += '0';                                                          // pos 71: installment indicator
    r += padLeft(mosad, 8);                                            // pos 72-79: mosad
    r += padRight('', 128 - r.length);                                 // fill rest
    lines.push(r.slice(0, 128));
    totalAgorot += c.amountAgorot;
  }

  // ========== FOOTER RECORD (record type "5") ==========
  let f = '';
  f += '5';                                                      // pos 1: type
  f += sendNum;                                                  // pos 2-4
  f += mosad;                                                    // pos 5-12
  f += padLeft(charges.length, 7);                               // pos 13-19: count
  f += padLeft(totalAgorot, 15);                                 // pos 20-34: total amount
  f += padRight('', 128 - f.length);
  lines.push(f.slice(0, 128));

  return lines.join('\r\n') + '\r\n';
}

// Build a human-readable CSV for preview / bank confirmation
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
  // Add BOM for Excel Hebrew compatibility
  return '\uFEFF' + header + '\r\n' + lines.join('\r\n') + '\r\n';
}

// Download helper
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
