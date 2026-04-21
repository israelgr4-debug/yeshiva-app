// Nedarim Plus API integration layer
// Nedarim Plus (https://www.matara.pro / https://nedarimplus.com) is an Israeli
// recurring donation / tuition collection platform used by yeshivot.
//
// This module provides a thin wrapper around their API. Credentials are
// stored in system_settings (nedarim_plus_mosad_id, nedarim_plus_api_password,
// nedarim_plus_api_url) and loaded at runtime.
//
// All calls are routed through /api/nedarim-plus/* server-side endpoints,
// so the API password is never exposed to the browser.

export type NedarimPaymentMethod = 'credit_card' | 'direct_debit';

export interface NedarimChargeRequest {
  familyId: string; // internal family id for tracking
  payerName: string; // שם המשלם (לרוב האב)
  payerIdNumber?: string; // תז המשלם
  payerPhone?: string;
  payerEmail?: string;
  amount: number; // סכום חודשי
  startDate: string; // YYYY-MM-DD
  totalPayments?: number; // מספר תשלומים (null = infinite recurring)
  dayOfMonth: number; // יום הגביה בחודש
  purposeDescription?: string; // למטרת
  studentsDescription?: string; // פירוט התלמידים
}

export interface NedarimChargeResponse {
  success: boolean;
  externalChargeId?: string; // המזהה שנדרים מחזיר
  error?: string;
  rawResponse?: unknown;
}

export interface NedarimCancelRequest {
  externalChargeId: string;
  reason?: string;
}

export interface NedarimCancelResponse {
  success: boolean;
  error?: string;
}

export interface NedarimPaymentNotification {
  externalChargeId: string;
  paymentDate: string;
  amount: number;
  status: 'success' | 'failed';
  failureReason?: string;
  transactionId?: string;
}

// ============================================================================
// Client-side wrappers (call our /api/nedarim-plus/* server routes)
// ============================================================================

const BASE_PATH = '/api/nedarim-plus';

export async function createRecurringCharge(
  req: NedarimChargeRequest
): Promise<NedarimChargeResponse> {
  try {
    const res = await fetch(`${BASE_PATH}/create-charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    return (await res.json()) as NedarimChargeResponse;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function cancelRecurringCharge(
  req: NedarimCancelRequest
): Promise<NedarimCancelResponse> {
  try {
    const res = await fetch(`${BASE_PATH}/cancel-charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    return (await res.json()) as NedarimCancelResponse;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

// Pull payments that Nedarim Plus has collected since a given date
export async function fetchCollectedPayments(
  fromDate: string
): Promise<NedarimPaymentNotification[]> {
  try {
    const res = await fetch(
      `${BASE_PATH}/collected?from=${encodeURIComponent(fromDate)}`
    );
    if (!res.ok) return [];
    return (await res.json()) as NedarimPaymentNotification[];
  } catch {
    return [];
  }
}
