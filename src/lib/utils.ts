export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}.${month}.${year}`;
}

export function formatCurrency(amount: number, currency: string = 'ILS'): string {
  const formatter = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'occupied':
    case 'collected':
      return 'bg-green-100 text-green-800';
    case 'inactive':
    case 'available':
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'graduated':
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

// ===== Hebrew date helpers =====
// Convert number 1-999 to Hebrew letters (gematria). E.g., 26 → כ״ו, 785 → תשפ״ה
function numToHebrewLetters(num: number, withGershayim = true): string {
  if (num <= 0 || num >= 1000) return String(num);
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const o = num % 10;

  let tensPart = tens[t];
  let onesPart = ones[o];
  // 15 → טו, 16 → טז
  if (t === 1 && o === 5) { tensPart = ''; onesPart = 'טו'; }
  else if (t === 1 && o === 6) { tensPart = ''; onesPart = 'טז'; }

  const result = hundreds[h] + tensPart + onesPart;
  if (!withGershayim) return result;
  if (result.length > 1) return result.slice(0, -1) + '״' + result.slice(-1);
  if (result.length === 1) return result + '׳';
  return result;
}

// Convert Gregorian date to Hebrew date string in gematria form.
// Example: 2007-02-19 → 'ד׳ אדר תשס״ז'  (day month year)
export function toHebrewDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(d);

    const dayStr = parts.find((p) => p.type === 'day')?.value || '';
    let monthStr = parts.find((p) => p.type === 'month')?.value || '';
    const yearStr = parts.find((p) => p.type === 'year')?.value || '';

    // Strip leading ב (e.g. "בשבט" → "שבט")
    if (monthStr.startsWith('ב') && monthStr.length > 1) {
      monthStr = monthStr.slice(1);
    }

    const dayNum = parseInt(dayStr, 10);
    const yearNum = parseInt(yearStr, 10);
    const dayHe = numToHebrewLetters(dayNum);
    // Year: strip thousands digit (5785 → 785)
    const yearHe = numToHebrewLetters(yearNum % 1000);

    return `${dayHe} ${monthStr} ${yearHe}`;
  } catch {
    return '';
  }
}

// Short Hebrew date (day + month only): 'ד׳ אדר'
export function toHebrewDateShort(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
    }).formatToParts(d);
    const dayStr = parts.find((p) => p.type === 'day')?.value || '';
    let monthStr = parts.find((p) => p.type === 'month')?.value || '';
    if (monthStr.startsWith('ב') && monthStr.length > 1) monthStr = monthStr.slice(1);
    const dayNum = parseInt(dayStr, 10);
    return `${numToHebrewLetters(dayNum)} ${monthStr}`;
  } catch {
    return '';
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'פעיל',
    inactive: 'לא פעיל',
    graduated: 'סיים',
    chizuk: 'חיזוק',
    occupied: 'תפוס',
    available: 'פנוי',
    maintenance: 'תחזוקה',
    collected: 'גבוה',
    pending: 'ממתין',
    committed: 'מתחייב',
    cancelled: 'בוטל',
  };
  return labels[status] || status;
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}

export function parseFormData(formData: FormData): Record<string, any> {
  const data: Record<string, any> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  return data;
}
