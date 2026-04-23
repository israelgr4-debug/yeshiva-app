/**
 * Nedarim Plus API client (server-side only).
 * Docs: https://matara.pro/nedarimplus/ApiDocumentation.html
 *
 * Credentials come from env:
 *   NEDARIM_MOSAD_ID
 *   NEDARIM_API_PASSWORD
 *
 * NEVER import this from client code - the password must not leak.
 */

const MANAGE_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx';
const MASAV_URL = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx';

function creds() {
  const MosadId = process.env.NEDARIM_MOSAD_ID;
  const ApiPassword = process.env.NEDARIM_API_PASSWORD;
  if (!MosadId || !ApiPassword) {
    throw new Error('NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD env vars are missing');
  }
  return { MosadId, ApiPassword };
}

async function postForm(url: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// =============================================================================
// Credit card standing orders (הוראת קבע אשראי)
// =============================================================================

export interface NedarimCreditKeva {
  KevaId?: string;
  DT_RowId?: string;
  Zeout?: string;
  ClientName?: string;
  Adresse?: string;
  City?: string;
  Phone?: string;
  Mail?: string;
  Amount?: string | number;
  Currency?: string | number;
  Itra?: string | number;         // remaining charges
  Success?: string | number;      // successful charges count
  LastNum?: string;
  CreationDate?: string;
  NextDate?: string;
  ErrorText?: string;
  Groupe?: string;
  Comments?: string;
  Tokef?: string;
  Enabled?: string | number;      // 1 = active, 0 = frozen
}

export async function getCreditKevaList(): Promise<NedarimCreditKeva[]> {
  const { MosadId, ApiPassword } = creds();
  let all: NedarimCreditKeva[] = [];
  let lastId = '';
  // Rate-limit safe: max 20 requests per hour, 2000 items per request
  for (let i = 0; i < 10; i++) {
    const res = await postForm(MANAGE_URL, {
      Action: 'GetKevaJson',
      MosadId,
      ApiPassword,
      LastId: lastId,
      MaxId: '2000',
    });
    const items: NedarimCreditKeva[] = Array.isArray(res) ? res : res?.data || [];
    if (!items.length) break;
    all = all.concat(items);
    if (items.length < 2000) break;
    const last = items[items.length - 1] as any;
    lastId = last.KevaId || last.DT_RowId || '';
    if (!lastId) break;
  }
  return all;
}

export interface NedarimCreditKevaDetail extends NedarimCreditKeva {
  KevaStatus?: string | number; // 1=active, 2=frozen, 3=deleted
  KevaZeout?: string;
  KevaName?: string;
  KevaAdresse?: string;
  KevaCity?: string;
  KevaPhone?: string;
  KevaMail?: string;
  KevaGroupe?: string;
  KevaAvour?: string;
  KevaAmount?: string | number;
  KevaCurrency?: string | number;
  KevaTashlumim?: string | number;
  KevaSuccess?: string | number;
  CreatedDate?: string;
  KevaAsToremCard?: string | number;
  KevaObservation?: string;
  KevaNextDate?: string;
  KevaFrequency?: string | number;
  KevaLastNum?: string;
  KevaTokef?: string;
  TotalHistoryAmount?: string | number;
  HistoryCount?: string | number;
  HistoryData?: Array<{
    ID: string | number;             // 1=success, 2=refused, 3=cancelled
    Amount?: string | number;
    Date?: string;
    Name?: string;
    LastNum?: string;
    TransactionId?: string;
  }>;
}

export async function getCreditKevaDetail(kevaId: string): Promise<NedarimCreditKevaDetail> {
  const { MosadId, ApiPassword } = creds();
  return postForm(MANAGE_URL, {
    Action: 'GetKevaId',
    MosadId,
    ApiPassword,
    KevaId: kevaId,
  });
}

export async function disableCreditKeva(kevaId: string) {
  const { MosadId, ApiPassword } = creds();
  return postForm(MANAGE_URL, {
    Action: 'DisableKeva',
    MosadNumber: MosadId,
    ApiPassword,
    KevaId: kevaId,
  });
}

export async function enableCreditKeva(kevaId: string) {
  const { MosadId, ApiPassword } = creds();
  return postForm(MANAGE_URL, {
    Action: 'EnableKevaNew',
    MosadNumber: MosadId,
    ApiPassword,
    KevaId: kevaId,
  });
}

export async function deleteCreditKeva(kevaId: string) {
  const { MosadId, ApiPassword } = creds();
  return postForm(MANAGE_URL, {
    Action: 'DeleteKeva',
    MosadNumber: MosadId,
    ApiPassword,
    KevaId: kevaId,
  });
}

// =============================================================================
// Credit transactions history
// =============================================================================

export interface NedarimCreditTransaction {
  Shovar?: string;
  Zeout?: string;
  ClientName?: string;
  Adresse?: string;
  Phone?: string;
  Mail?: string;
  Amount?: string | number;
  Currency?: string | number;
  TransactionTime?: string;
  Confirmation?: string;
  LastNum?: string;
  TransactionType?: string;
  Groupe?: string;
  Comments?: string;
  Tashloumim?: string | number;
  TransactionId?: string;
  KevaId?: string;
  KabalaId?: string;
}

export async function getCreditTransactionsHistory(lastId = '', maxId = 2000): Promise<NedarimCreditTransaction[]> {
  const { MosadId, ApiPassword } = creds();
  const res = await postForm(MANAGE_URL, {
    Action: 'GetHistoryJson',
    MosadId,
    ApiPassword,
    LastId: lastId,
    MaxId: String(maxId),
  });
  return Array.isArray(res) ? res : res?.data || [];
}

// =============================================================================
// Bank standing orders (הוראת קבע בנקאית / מס"ב)
// =============================================================================

// The GetMasavKevaNew endpoint returns a DataTable-like structure with
// numeric keys for columns. We'll parse it into a friendlier shape.
export interface NedarimBankKevaRaw {
  DT_RowId?: string;
  '2'?: string;   // client name
  '3'?: string;   // bank account details
  '4'?: string;   // next charge
  '5'?: string;   // remaining charges
  '6'?: string;   // monthly amount
  '7'?: string;   // category
  '8'?: string;   // comment
  [key: string]: any;
}

export async function getBankKevaList(): Promise<NedarimBankKevaRaw[]> {
  const { MosadId, ApiPassword } = creds();
  const res = await postForm(MASAV_URL, {
    Action: 'GetMasavKevaNew',
    MosadNumber: MosadId,
    ApiPassword,
  });
  return Array.isArray(res?.data) ? res.data : [];
}

export interface NedarimBankKevaDetail {
  Result?: string;
  CodeMosad?: string;
  MasofName?: string;
  ClientName?: string;
  ClientAdresse?: string;
  ClientZeout?: string;
  ClientPhone?: string;
  ClientMail?: string;
  Bank?: string;
  Agency?: string;
  Account?: string;
  BankData?: string;
  Status?: string | number;
  StatusText?: string;
  NextDate?: string | number;       // day of month
  FullNextDate?: string;             // full date
  Amount?: string | number;
  Tashlumim?: string | number;
  Groupe?: string;
  Comments?: string;
  AsSign?: boolean;
  MasavUpload?: string | number;
  Deleted?: string | number;
}

export async function getBankKevaDetail(masavId: string): Promise<NedarimBankKevaDetail> {
  const { MosadId, ApiPassword } = creds();
  return postForm(MASAV_URL, {
    Action: 'GetMasavId',
    MosadNumber: MosadId,
    ApiPassword,
    MasavId: masavId,
  });
}

export async function getBankHistory(from: string, to: string) {
  const { MosadId, ApiPassword } = creds();
  return postForm(MASAV_URL, {
    Action: 'GetMasavHistoryNew',
    MosadId,
    ApiPassword,
    From: from,
    To: to,
  });
}

// =============================================================================
// Helpers
// =============================================================================

// Map Nedarim Enabled flag (credit) → our status
export function creditKevaStatus(enabled: string | number | undefined, kevaStatus?: string | number): 'active' | 'frozen' | 'deleted' {
  const s = Number(kevaStatus);
  if (s === 2) return 'frozen';
  if (s === 3) return 'deleted';
  if (Number(enabled) === 0) return 'frozen';
  return 'active';
}

// Map Nedarim bank Status code → our status
// Based on docs: 1=active, 7=frozen, 4=sent-to-bank, 10=rejected, etc.
export function bankKevaStatus(status: string | number | undefined, deleted?: string | number): 'active' | 'frozen' | 'deleted' | 'pending_bank' {
  if (Number(deleted) === 1) return 'deleted';
  const s = Number(status);
  if (s === 7) return 'frozen';
  if (s === 1) return 'active';
  if (s === 4 || s === 2) return 'pending_bank';
  return 'pending_bank';
}

// Normalize a Nedarim dd/mm/yyyy date to ISO yyyy-mm-dd
export function normalizeDate(d: string | undefined): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}
