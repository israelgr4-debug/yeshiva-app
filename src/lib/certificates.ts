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

// --- Hebrew year helper ---
export function getHebrewYear(): string {
  try {
    const formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      year: 'numeric',
    });
    return formatter.format(new Date());
  } catch {
    return '';
  }
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

export const ROSH_YESHIVA: SignerInfo = {
  name: 'אליעזר יהודה פינקל',
  idNumber: '',
  title: 'ראש הישיבה',
};

// --- Report type definitions ---

export type ReportTypeId =
  | 'regular'
  | 'arnona'
  | 'bituach_leumi'
  | 'bituach_leumi_yb'
  | 'kita_yb'
  | 'vaad_yeshivot'
  | 'with_hours_45'
  | 'with_hours_40'
  | 'with_hours_milga'
  | 'with_tuition'
  | 'ravak'
  | 'left'
  | 'left_with_masachtot'
  | 'visa'
  | 'exit_abroad'
  | 'kabala_46'
  | 'tuition_with_history';

export interface ExtraField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea';
  placeholder?: string;
}

export interface ReportType {
  id: ReportTypeId;
  name: string;
  recipient: string;
  extraFields: ExtraField[];
  buildBody: (student: Student, year: string, extras: Record<string, string>) => string;
  signer?: SignerInfo;
  isReceipt?: boolean;
  /** Editable header HTML (with placeholders) - if null, fall back to legacy hardcoded header */
  headerHtml?: string | null;
  /** Editable signer HTML (with placeholders) - if null, fall back to legacy. Hidden for chinuch students. */
  signerHtml?: string | null;
}

function studentLine(student: Student): string {
  return `${student.last_name} ${student.first_name}`;
}

function studentLineWithId(student: Student): string {
  return `${student.last_name} ${student.first_name} ת.ז. ${student.id_number}`;
}

export const REPORT_TYPES: ReportType[] = [
  // --- אישורי תלמיד רגילים ---
  {
    id: 'regular',
    name: 'אישור תלמיד רגיל',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בישיבה בשנת הלימודים ${year}.`,
  },
  {
    id: 'arnona',
    name: 'אישור לארנונה',
    recipient: 'לכל המעוניין:',
    extraFields: [
      { key: 'months', label: 'חודשים (לדוגמא: 10-12/2021)', type: 'text', placeholder: '10-12/2024' },
    ],
    buildBody: (student, _year, extras) =>
      `הננו לאשר בזאת כי התלמיד ${studentLineWithId(student)}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\nבחודשים ${extras.months || '___'} למד בישיבתנו ולא קיבל מלגה.`,
  },

  // --- ביטוח לאומי ---
  {
    id: 'bituach_leumi',
    name: 'אישור ביטוח לאומי',
    recipient: 'לכבוד המוסד לביטוח לאומי',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בישיבתנו בשנת הלימודים ${year} בהיקף של 45 שעות שבועיות\n בתנאי פנימייה ואינו מקבל מלגה.\nהנ"ל החל את לימודיו בישיבה בתאריך ${student.admission_date || '___'}.`,
  },
  {
    id: 'bituach_leumi_yb',
    name: 'אישור ביטוח לאומי תלמיד יב',
    recipient: 'לכבוד המוסד לביטוח לאומי',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בכיתה י"ב בשנת הלימודים ${year} בהיקף של 45 שעות שבועיות\n בתנאי פנימייה ואינו מקבל מלגה.`,
  },

  // --- כיתה יב ---
  {
    id: 'kita_yb',
    name: 'אישור בכיתה יב',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בכיתה יב בשנת הלימודים ${year}\n בהיקף של 45 שעות שבועיות.`,
  },

  // --- ועד הישיבות ---
  {
    id: 'vaad_yeshivot',
    name: 'אישור לועד הישיבות',
    recipient: 'לכבוד ועד הישיבות בארה"ק:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בישיבה בשנת הלימודים ${year}`,
  },

  // --- שעות לימוד ---
  {
    id: 'with_hours_45',
    name: 'אישור עם שעות לימוד (45 שש)',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, _year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nבין השעות 9:00 - 13:00, לפנה"צ,\nומ 15:30 עד 19:00 אחה"צ.\nומ 21:00 עד 22:30 בערב\nסה"כ 45 שעות שבועיות.`,
  },
  {
    id: 'with_hours_40',
    name: 'אישור עם שעות לימוד (40 שש)',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, _year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nבין השעות 9:00 - 13:00, לפנה"צ,\nומ 15:00 עד 19:00 אחה"צ.\nסה"כ 40 שעות שבועיות.`,
  },

  // --- שעות ומילגה ---
  {
    id: 'with_hours_milga',
    name: 'אישור עם שעות ומילגה',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'amount', label: 'סכום מילגה חודשית (ש"ח)', type: 'number', placeholder: '1750' },
    ],
    buildBody: (student, year, extras) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nלומד בישיבתנו כל היום, ותורתו אומנותו.\n שעות הלימוד:\nימים א - ה\nבין השעות 9:00 - 13:30, לפנה"צ,\nומ 15:00 עד 19:30 אחה"צ.\nסה"כ 45 שעות שבועיות.\nהנ"ל מקבל תמיכה חודשית בסך ${extras.amount || '___'} ₪\nמתייחס לשנת הלימודים ${year}`,
  },

  // --- שכר לימוד ---
  {
    id: 'with_tuition',
    name: 'אישור עם שכר לימוד',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'amount', label: 'שכר לימוד חודשי (ש"ח)', type: 'number', placeholder: '600' },
    ],
    buildBody: (student, year, extras) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בישיבה בשנת הלימודים ${year}\n ומשתתף בשכ"ל בסך ${extras.amount || '___'} ₪ לחודש.`,
  },

  // --- רווק ---
  {
    id: 'ravak',
    name: 'אישור תלמיד רווק',
    recipient: 'לכל המעונין:',
    extraFields: [],
    buildBody: (student, year) =>
      `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nהינו תלמיד בישיבה בשנת הלימודים ${year}\n והינו רווק.`,
  },

  // --- תלמיד שעזב ---
  {
    id: 'left',
    name: 'אישור תלמיד שעזב',
    recipient: 'לכל המעונין:',
    extraFields: [
      // endDate: pre-filled from student.exit_date when student is selected.
      { key: 'endDate', label: 'תאריך עזיבה', type: 'date' },
      // chinuchEndDate (optional): if the student studied in 'חינוך' first and then
      // moved to the regular yeshiva, this is the date when chinuch ended (i.e. start of
      // the regular-yeshiva period). The cert then prints two separate periods.
      { key: 'chinuchEndDate', label: 'תאריך מעבר מחינוך לישיבה (אם רלוונטי)', type: 'date' },
    ],
    buildBody: (student, _year, extras) => {
      const start = student.admission_date || '___';
      const end = extras.endDate || '___';
      // Two-period mode: chinuch then yeshiva
      if (extras.chinuchEndDate && extras.chinuchEndDate.trim()) {
        return (
          `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\n` +
          `למד בעמותת "חינוך" שלנו בין התאריכים ${start} – ${extras.chinuchEndDate}\n` +
          `ולמד בישיבת מיר מודיעין עילית בין התאריכים ${extras.chinuchEndDate} – ${end}`
        );
      }
      return `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nלמד בישיבתנו בין התאריכים ${start} –  ${end}`;
    },
  },
  {
    id: 'left_with_masachtot',
    name: 'אישור תלמיד שעזב עם מסכתות',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'endDate', label: 'תאריך עזיבה', type: 'date' },
      { key: 'masachtot', label: 'מסכתות (כל מסכת בשורה חדשה)', type: 'textarea', placeholder: 'בבא בתרא\nבבא מציעא\nקידושין' },
    ],
    buildBody: (student, _year, extras) => {
      const masachtotList = (extras.masachtot || '').split('\n').filter(Boolean).join('\n');
      return `הננו לאשר בזאת כי ה"ה  ${studentLineWithId(student)}\nלמד בישיבתנו בין התאריכים –  ${student.admission_date || '___'} - ${extras.endDate || '___'}\nולמד ונבחן על מסכתות:\n${masachtotList}`;
    },
  },

  // --- ויזה ---
  {
    id: 'visa',
    name: 'אישור תלמיד לויזה',
    recipient: 'לכבוד משרד הפנים',
    extraFields: [
      { key: 'fromYear', label: 'משנת לימודים', type: 'text', placeholder: 'תשפ"ו' },
      { key: 'toYear', label: 'עד שנת לימודים', type: 'text', placeholder: 'תשפ"ט' },
      { key: 'studentNameEn', label: 'שם התלמיד באנגלית (גדולות)', type: 'text', placeholder: 'PITEM MOSHE' },
      { key: 'passportCountry', label: 'מדינת הדרכון', type: 'text', placeholder: 'ארגנטינה' },
      { key: 'passportNumber', label: 'מספר דרכון', type: 'text', placeholder: 'A83028329' },
      { key: 'fatherBirthDate', label: 'תאריך לידת האב', type: 'date' },
      { key: 'motherBirthDate', label: 'תאריך לידת האם', type: 'date' },
      { key: 'startMonth', label: 'תחילת לימודים (MM/YYYY)', type: 'text', placeholder: '9/2025' },
    ],
    buildBody: (_student, _year, extras) =>
      `הנדון: אישור לימודים לשנת הלימודים ${extras.fromYear || '___'} עד ${extras.toYear || '___'}\n\n` +
      `הריני לאשר כי התלמיד ${extras.studentNameEn || '___'}\n` +
      `מס' דרכון ${extras.passportCountry || '___'} ${extras.passportNumber || '___'}\n` +
      `ת.ל האב ${extras.fatherBirthDate || '___'}\n` +
      `ת.ל. האם ${extras.motherBirthDate || '___'}\n` +
      `הינו תלמיד ישיבתנו החל מ ${extras.startMonth || '___'}\n\n` +
      `הנ"ל לומד בימים א - ה בין השעות 9:30-13:30 ו 15:00-19:30\n` +
      `וביום ו בין 9:00-12:00\n\n` +
      `בדקנו וידוע לנו כי הנ"ל יהודי מלידה`,
    signer: ROSH_YESHIVA,
  },

  // --- יציאה לחו"ל ---
  {
    id: 'exit_abroad',
    name: 'אישור יציאה לחול',
    recipient: 'לכבוד צה"ל',
    extraFields: [
      { key: 'fromDate', label: 'מתאריך', type: 'date' },
      { key: 'toDate', label: 'עד תאריך', type: 'date' },
    ],
    buildBody: (student, _year, extras) =>
      `הננו לאשר בזאת לתלמיד ${studentLine(student)} ת.ז. ${student.id_number}\nלצאת לחו"ל בין התאריכים ${extras.fromDate || '___'} עד ${extras.toDate || '___'}.`,
    signer: { name: '', idNumber: '', title: 'חתימת ראש הישיבה' },
  },

  // --- אישור שכר לימוד עם פירוט תשלומים 12 חודשים ---
  {
    id: 'tuition_with_history',
    name: 'אישור שכר לימוד עם פירוט 12 חודשים',
    recipient: 'לכל המעונין:',
    extraFields: [
      { key: 'amount', label: 'שכר לימוד חודשי (ש"ח)', type: 'number', placeholder: '600' },
      // payments_html is auto-populated by /reports page when this cert type is chosen
    ],
    buildBody: (student, year, extras) =>
      `הננו לאשר כי התלמיד ${studentLineWithId(student)}\n` +
      `לומד בשנת הלימודים ${year} בישיבה ומשתתף בשכר לימוד בסך ₪${extras.amount || '___'} לחודש.\n\n` +
      `להלן פירוט התשלומים ב-12 החודשים האחרונים:\n` +
      (extras.payments_html || '<em>אין נתוני תשלום ב-12 החודשים האחרונים.</em>'),
  },

  // --- קבלה סעיף 46 ---
  {
    id: 'kabala_46',
    name: 'קבלה סעיף 46',
    recipient: '',
    extraFields: [
      { key: 'donorName', label: 'שם התורם', type: 'text' },
      { key: 'donorId', label: 'ע"ר / מספר זהות', type: 'text' },
      { key: 'donorAddress', label: 'כתובת תורם', type: 'text' },
      { key: 'donorCity', label: 'עיר', type: 'text' },
      { key: 'amount', label: 'סכום (ש"ח)', type: 'number' },
      { key: 'amountWords', label: 'סכום במילים', type: 'text', placeholder: 'מאה וחמישים אלף' },
      { key: 'paymentMethod', label: 'אמצעי תשלום', type: 'text', placeholder: 'העברה בנקאית' },
      { key: 'receiptNumber', label: 'מספר קבלה', type: 'text', placeholder: '0557' },
    ],
    buildBody: (_student, _year, _extras) => '',
    isReceipt: true,
  },
];

export function getReportTypeById(id: ReportTypeId): ReportType | undefined {
  return REPORT_TYPES.find((r) => r.id === id);
}
