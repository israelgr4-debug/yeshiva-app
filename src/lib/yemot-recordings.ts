// ימות המשיח recordings (קבלת נתונים → Record folder, e.g. ivr2:/11/Record).
// Every file name carries the call's metadata, e.g.
//   OK-Folder-11-1339-Phone-0556717415-Date-2026-09-15-09-45-04-EnterIDType-list_all_information-EnterID-218319028-Data-P050-270-P051-1.wav
//   Folder-<ext>-<record>  → same record number ("הזמנה") as the data row
//   Phone-<caller>  Date-<y-m-d-h-m-s>  EnterID-<ת"ז as typed>  Data-P050-<amount>…
// Pure parsing — used by the API route and the UI.

import { israelIso } from './yemot-parse';
import { stripIdLeadingZeros } from './israeli-validators';

export interface YemotRecording {
  name: string;
  what: string;            // ימות path for DownloadFile ("ivr2:11/Record/…wav")
  folder: string | null;   // extension the call came from
  record: number | null;   // = scholarship_yemot_calls.record_number
  phone: string | null;
  callAt: string | null;   // ISO, Israel offset
  enterId: string | null;  // ת"ז as typed, leading zeros stripped
  amount: number | null;   // P050 value when present
  duration: number;        // seconds
  size: number;
}

export function parseRecordingName(name: string, what: string, duration = 0, size = 0): YemotRecording {
  const base = name.replace(/\.wav$/i, '');
  const folder = base.match(/Folder-([^-]+)-(\d+)/);
  const phone = base.match(/-Phone-(\d*)/);
  const date = base.match(/-Date-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  const enter = base.match(/-EnterID-([0-9A-Za-z]*)/);
  const amount = base.match(/-P050-([\d.]+)/);
  let p = phone?.[1] || '';
  if (p && !p.startsWith('0')) p = '0' + p;
  return {
    name,
    what,
    folder: folder ? folder[1] : null,
    record: folder ? Number(folder[2]) : null,
    phone: p || null,
    callAt: date ? israelIso(+date[1], +date[2], +date[3], +date[4], +date[5], +date[6]) : null,
    enterId: stripIdLeadingZeros(enter?.[1] || '') || null,
    amount: amount ? Number(amount[1]) : null,
    duration: Number(duration) || 0,
    size: Number(size) || 0,
  };
}

export const DEFAULT_RECORDINGS_PATH = 'ivr2:/11/Record';
