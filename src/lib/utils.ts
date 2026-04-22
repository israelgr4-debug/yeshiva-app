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

// Convert a Gregorian date (YYYY-MM-DD or Date) to a Hebrew date string.
// Example: '2007-02-19' → 'ב׳ אדר תשס״ז'
export function toHebrewDate(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  try {
    const fmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return fmt.format(d);
  } catch {
    return '';
  }
}

// Short Hebrew date (day + month only, no year): 'ב׳ אדר'
export function toHebrewDateShort(input: string | Date | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  try {
    const fmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
    });
    return fmt.format(d);
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
