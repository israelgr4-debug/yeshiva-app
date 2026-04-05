import { Student } from './types';

// --- Hebrew date helper ---

export function getHebrewDate(): string {
  try {
    const formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(new Date());
  } catch {
    return '';
  }
}

export function getGregorianDate(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// --- Signer config ---

export interface SignerInfo {
  name: string;
  idNumber: string;
  title: string;
}

export const DEFAULT_SIGNER: SignerInfo = {
  name: 'יוסף לוי',
  idNumber: '56618556',
  title: 'מזכיר',
};

// --- Report type definitions ---

export type ReportTypeId =
  | 'regular'
  | 'arnona'
  | 'bituach_leumi'
  | 'bituach_leumi_yb'
  | 'kita_yb'
  | 'vaad_yeshivot'
  | 'with_hours'
  | 'with_hours_milga'
  | 'with_tuition'
  | 'ravak'
  | 'left';

export interface ExtraField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  placeholder?: string;
}

export interface ReportType {
  id: ReportTypeId;
  name: string;
  recipient: string;
  extraFields: ExtraField[];
  buildBody: (student: Student, year: string, extras: Record<string, string>) => string;
}

const LEARNING_HOURS_TEXT =
  'שעות הלימוד: ימים א - ה, בין השעות 9:00 - 13:00 לפנה"צ, ומ 15:30 עד 19:00 אחה"צ, ומ 21:00 עד 22:30 בערב. סה"כ 45 שעות שבועיות.';

function studentLine(student: Student): string {
  return `${student.first_name} ${student.last_name}, ת.ז. ${student.id_number}`;
}

export const REPORT_TYPES: ReportType[] = [
  {
    id: 'regular',
    name: 'אישור תלמיד רגיל',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year}.`,
  },
  {
    id: 'arnona',
    name: 'אישור לארנונה',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'months', label: 'חודשים (לדוגמא: 10-12/2021)', type: 'text', placeholder: '10-12/2021' },
    ],
    buildBody: (student, _year, extras) =>
      `הננו לאשר כי ${studentLine(student)} לומד בישיבתנו כל היום, ותורתו אומנותו. בחודשים ${extras.months || '___'} למד בישיבתנו ולא קיבל מלגה.`,
  },
  {
    id: 'bituach_leumi',
    name: 'אישור ביטוח לאומי',
    recipient: 'לכבוד המוסד לביטוח לאומי:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבתנו בשנת הלימודים ${year} בהיקף של 45 שעות שבועיות בתנאי פנימייה ואיננו מקבל מילגה. הנ"ל החל את לימודיו בישיבה בתאריך ${student.admission_date || '___'}.`,
  },
  {
    id: 'bituach_leumi_yb',
    name: 'אישור ביטוח לאומי תלמיד יב',
    recipient: 'לכבוד המוסד לביטוח לאומי:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בכיתה י"ב בשנת הלימודים ${year} בהיקף של 45 שעות שבועיות בתנאי פנימייה ואיננו מקבל מילגה.`,
  },
  {
    id: 'kita_yb',
    name: 'אישור בכיתה יב',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בכיתה יב בשנת הלימודים ${year} בהיקף של 45 שעות שבועיות.`,
  },
  {
    id: 'vaad_yeshivot',
    name: 'אישור לועד הישיבות',
    recipient: 'לכבוד ועד הישיבות בארה"ק:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year}.`,
  },
  {
    id: 'with_hours',
    name: 'אישור עם שעות לימוד',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year}.\n\n${LEARNING_HOURS_TEXT}`,
  },
  {
    id: 'with_hours_milga',
    name: 'אישור עם שעות ומילגה',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'amount', label: 'סכום מילגה חודשית (ש"ח)', type: 'number', placeholder: '1000' },
    ],
    buildBody: (student, year, extras) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year}.\n\n${LEARNING_HOURS_TEXT}\n\nהנ"ל מקבל תמיכה חודשית בסך ${extras.amount || '___'} ש"ח. מתייחס לשנת הלימודים ${year}.`,
  },
  {
    id: 'with_tuition',
    name: 'אישור עם שכר לימוד',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'amount', label: 'שכר לימוד חודשי (ש"ח)', type: 'number', placeholder: '500' },
    ],
    buildBody: (student, year, extras) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year} ומשתתף בשכ"ל בסך ${extras.amount || '___'} ש"ח לחודש.`,
  },
  {
    id: 'ravak',
    name: 'אישור תלמיד רווק',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר כי ${studentLine(student)} הינו תלמיד בישיבה בשנת הלימודים ${year} והינו רווק.`,
  },
  {
    id: 'left',
    name: 'אישור תלמיד שעזב',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'endDate', label: 'תאריך עזיבה', type: 'date' },
    ],
    buildBody: (student, _year, extras) =>
      `הננו לאשר כי ${studentLine(student)} למד בישיבתנו בין התאריכים ${student.admission_date || '___'} - ${extras.endDate || '___'}.`,
  },
];

export function getReportTypeById(id: ReportTypeId): ReportType | undefined {
  return REPORT_TYPES.find((r) => r.id === id);
}
