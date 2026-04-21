// Dormitory room layout based on the provided PDFs.
// Each section is a named group with its room numbers in the order they appear on the map.

export interface DormSection {
  id: string;
  title: string; // displayed to user
  category: 'shiurim' | 'kibbutz';
  rows: (number | string)[][]; // each inner array is one visual row
  extraRooms?: (number | string)[][]; // "L" shape extensions
}

// ========= שיעורים =========
export const SHIURIM_SECTIONS: DormSection[] = [
  {
    id: 'floor-1',
    title: 'קומה 1 - צפון',
    category: 'shiurim',
    rows: [
      [111, 112, 113, 124, 125, 126],
      [116, 115, 114, 123, 122, 121],
    ],
    extraRooms: [
      ['דירת צוות', '', '', '', 'דירת רה"י'],
    ],
  },
  {
    id: 'floor-2-north',
    title: 'קומה 2 - צפון',
    category: 'shiurim',
    rows: [
      [211, 212, 213, 224, 225, 226],
      [216, 215, 214, 223, 222, 221],
    ],
  },
  {
    id: 'floor-2-south',
    title: 'קומה 2 - דרום',
    category: 'shiurim',
    rows: [
      [206, 201, '', '', 236, 231],
      [205, 202, '', '', 235, 232],
      [204, 203, '', '', 234, 233],
    ],
  },
  {
    id: 'floor-3-north',
    title: 'קומה 3 - צפון',
    category: 'shiurim',
    rows: [
      [311, 312, 313, 324, 325, 326],
      [316, 315, 314, 323, 322, 321],
    ],
  },
  {
    id: 'floor-3-south',
    title: 'קומה 3 - דרום',
    category: 'shiurim',
    rows: [
      [306, 301, '', '', 336, 331],
      [305, 302, '', '', 335, 332],
      [304, 303, '', '', 334, 333],
    ],
  },
  {
    id: 'floor-4-north',
    title: 'קומה 4 - צפון',
    category: 'shiurim',
    rows: [
      [411, 412, 413, 424, 425, 426],
      [416, 415, 414, 423, 422, 421],
    ],
  },
  {
    id: 'floor-4-south',
    title: 'קומה 4 - דרום',
    category: 'shiurim',
    rows: [
      [406, 401, '', '', 436, 431],
      [405, 402, '', '', 435, 432],
      [404, 403, '', '', 434, 433],
    ],
  },
  {
    id: 'east-floor-1',
    title: 'מזרח - קומה 1',
    category: 'shiurim',
    rows: [
      [144, 145, '', 152, 153],
      [143, '', '', '', ''],
      ['', 142, 141, 156, 155, 154],
    ],
  },
];

// ========= קיבוץ =========
export const KIBBUTZ_SECTIONS: DormSection[] = [
  {
    id: 'east-kibbutz-1',
    title: 'מזרח - קומה 1',
    category: 'kibbutz',
    rows: [
      [144, 145, '', 152, 153],
      [143, '', '', '', ''],
      ['', 142, 141, 156, 155, 154],
    ],
  },
  {
    id: 'east-kibbutz-2',
    title: 'מזרח - קומה 2',
    category: 'kibbutz',
    rows: [
      [245, 246, 256, 255],
      [244, 243, 242, 241, 251, 252, 253, 254],
    ],
  },
  {
    id: 'east-kibbutz-3',
    title: 'מזרח - קומה 3',
    category: 'kibbutz',
    rows: [
      [345, 346, 356, 355],
      [344, 343, 342, 341, 351, 352, 353, 354],
    ],
  },
  {
    id: 'east-kibbutz-4',
    title: 'מזרח - קומה 4',
    category: 'kibbutz',
    rows: [
      [445, 446, 456, 455],
      [444, 443, 442, 441, 451, 452, 453, 454],
    ],
  },
  {
    id: 'east-kibbutz-5',
    title: 'מזרח - קומה 5',
    category: 'kibbutz',
    rows: [
      [545, 546, 556, 555],
      [544, 543, 542, 541, 551, 552, 553, 554],
    ],
  },
  {
    id: 'east-new-1',
    title: 'מזרח החדש - קומה 1',
    category: 'kibbutz',
    rows: [
      [164, 165, 175, 174],
      [163, 162, 161, 171, 172, 173],
    ],
  },
  {
    id: 'east-new-2',
    title: 'מזרח החדש - קומה 2',
    category: 'kibbutz',
    rows: [
      [264, 265, 275, 274],
      [263, 262, 261, 271, 272, 273],
    ],
  },
  {
    id: 'east-new-3',
    title: 'מזרח החדש - קומה 3',
    category: 'kibbutz',
    rows: [
      [365, 366, 376, 375],
      [364, 363, 362, 361, 371, 372, 373, 374],
      [367, '', '', '', '', '', '', ''],
    ],
  },
];

// Short name: "פלוני א" → last name + first letter of first name
export function shortStudentName(lastName: string, firstName: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const firstLetter = first ? first.charAt(0) : '';
  if (!last) return first;
  if (!firstLetter) return last;
  return `${last} ${firstLetter}׳`;
}
