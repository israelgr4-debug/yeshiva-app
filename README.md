# ישיבת מיר מודיעין עילית - מערכת ניהול

מערכת ניהול מודרנית לישיבה, בנויה עם Next.js 14 ותמיכה מלאה בעברית וRTL.

## מאפיינים

- **ניהול תלמידים** - רישום, עריכה, חיפוש וסינון של תלמידים
- **ניהול פנימיה** - ניהול חדרים והקצאה של תלמידים לחדרים
- **ניהול כספים** - רישום תרומות, התחייבויות וגביה
- **לוח בקרה** - סטטיסטיקות וסקירה כללית של המערכת
- **הגדרות** - תצורה של המוסד וההגדרות הכלליות

## דרישות מערכת

- Node.js 18.0 ומעלה
- npm או yarn

## התקנה

1. קלון את הקובץ לתיקיה המקומית:
```bash
cd /path/to/yeshiva-app
```

2. התקן את התלויות:
```bash
npm install
# או
yarn install
```

3. צור קובץ `.env.local` בשורש הפרויקט:
```bash
cp .env.local.example .env.local
```

4. מלא את פרטי Supabase ב- `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## הפעלת הפרויקט

פתח את תת התיקיה והרץ את שרת הפיתוח:

```bash
npm run dev
# או
yarn dev
```

הפרויקט יהיה זמין בכתובת: http://localhost:3000

## ביצוע בילד

```bash
npm run build
npm run start
```

## מבנה הקבצים

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # root layout with RTL
│   ├── page.tsx           # dashboard
│   ├── globals.css        # global styles
│   ├── students/          # students pages
│   ├── finances/          # finances page
│   ├── dormitory/         # dormitory management
│   └── settings/          # settings page
├── components/            # React components
│   ├── layout/           # navigation and layout
│   ├── ui/               # reusable UI components
│   ├── students/         # student-specific components
│   └── finances/         # finance-specific components
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── types.ts          # TypeScript interfaces
│   └── utils.ts          # utility functions
└── hooks/                # custom React hooks
    ├── useSupabase.ts    # generic Supabase hook
    └── useStudents.ts    # student-specific hook
```

## תוכניות עתידות

- [ ] אימות משתמשים
- [ ] דוח מדפסות
- [ ] ייצוא ל-CSV/Excel
- [ ] סטטיסטיקות מתקדמות
- [ ] הודעות אס.קוד אוטומטיות
- [ ] תמיכה במולטי-משתמשים

## ערך זה נוצר בעזרת Claude AI
