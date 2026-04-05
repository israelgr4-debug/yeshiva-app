# Setup Guide - ישיבת מיר מודיעין עילית Management System

## Quick Start (5 minutes)

### 1. Get Supabase Credentials

1. Go to https://supabase.com and sign up (free tier is fine)
2. Create a new project
3. Go to Settings > API
4. Copy:
   - Project URL
   - Anon Key (public)

### 2. Clone and Install

```bash
# Navigate to the project directory
cd /sessions/happy-gracious-planck/mnt/MOSAD/yeshiva-app

# Install dependencies
npm install
```

### 3. Configure Environment

```bash
# Copy example file
cp .env.local.example .env.local

# Edit .env.local with your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Set up Database

1. In Supabase dashboard, go to SQL Editor
2. Click "New Query"
3. Copy all SQL from `DATABASE_SCHEMA.md`
4. Run the query
5. Verify tables are created in the "Tables" section

### 5. Run the Application

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Default Access

- No authentication required for this demo version
- All features are immediately available
- All users see all data

## File Structure Guide

```
yeshiva-app/
│
├── src/
│   ├── app/                      # Pages (Next.js 14 App Router)
│   │   ├── page.tsx             # Dashboard - main overview
│   │   ├── layout.tsx           # Root layout (RTL, Hebrew)
│   │   ├── globals.css          # Global styles
│   │   ├── students/            # Students management
│   │   │   ├── page.tsx         # List & search students
│   │   │   └── [id]/page.tsx   # Student detail/edit
│   │   ├── finances/            # Donations & finances
│   │   ├── dormitory/           # Room management
│   │   └── settings/            # System settings
│   │
│   ├── components/              # Reusable React components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   │   ├── Header.tsx       # Page header
│   │   │   └── MainLayout.tsx   # Wrapper layout
│   │   ├── ui/                  # Low-level components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── SearchInput.tsx
│   │   ├── students/            # Student feature components
│   │   │   ├── StudentTable.tsx
│   │   │   ├── StudentForm.tsx
│   │   │   └── StudentCard.tsx
│   │   └── finances/            # Finance components
│   │       └── DonationsSummary.tsx
│   │
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client initialization
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── utils.ts             # Helper functions
│   │
│   └── hooks/                   # Custom React hooks
│       ├── useSupabase.ts       # Generic DB operations
│       └── useStudents.ts       # Student-specific operations
│
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── tailwind.config.ts           # Tailwind CSS config
├── next.config.js               # Next.js config
├── postcss.config.js            # PostCSS config
│
├── DATABASE_SCHEMA.md           # SQL tables to create
├── DEPLOYMENT.md                # Production deployment guide
├── SETUP_GUIDE.md              # This file
└── README.md                    # Project overview

```

## Key Features

### Dashboard (/)
- Overview statistics
- Active students count
- Total donations committed/collected
- Room occupancy
- Quick action buttons

### Students (/students)
- Full-text search by name or ID
- Filter by status (active/inactive/graduated)
- Filter by class (shiur)
- Pagination (10 items per page)
- Add/edit/delete students
- Student details page with tabs:
  - Personal information
  - Addresses
  - Donations history
  - Dormitory assignment

### Finances (/finances)
- Total committed donations (התחייבויות)
- Total collected donations (גבוי)
- Pending donations
- Add new donation records
- Donation history with status tracking
- Filter and sort capabilities

### Dormitory (/dormitory)
- Visual room grid grouped by building/wing/floor
- Room status indicators (occupied/available/maintenance)
- Room details modal
- Occupancy statistics
- Click any room to see current occupants

### Settings (/settings)
- Institution configuration
- Admin settings
- System preferences
- Database cleanup options

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (with RTL support)
- **Database**: Supabase (PostgreSQL)
- **Client**: @supabase/supabase-js
- **Direction**: RTL (right-to-left) for Hebrew

## RTL Implementation Details

The entire application is configured for RTL:

1. **HTML**: `<html dir="rtl" lang="he">`
2. **Tailwind**: Configured with RTL utilities
3. **CSS**: Custom CSS uses flexbox and grid that respects RTL
4. **Text Alignment**: `text-start` = right, `text-end` = left
5. **Padding/Margin**: `ps-` = padding-right, `pe-` = padding-left

## Creating New Pages

To add a new page:

```tsx
// src/app/new-page/page.tsx
'use client';

import { Header } from '@/components/layout/Header';

export default function NewPage() {
  return (
    <>
      <Header title="כותרת הדף" subtitle="תת-כותרת" />
      <div className="p-8">
        {/* Your content here */}
      </div>
    </>
  );
}
```

Then add to sidebar in `src/components/layout/Sidebar.tsx`.

## Creating New Components

Components follow this pattern:

```tsx
// src/components/ui/NewComponent.tsx
import { cn } from '@/lib/utils';

interface NewComponentProps {
  children: React.ReactNode;
  className?: string;
}

export function NewComponent({ children, className }: NewComponentProps) {
  return (
    <div className={cn('base-classes', className)}>
      {children}
    </div>
  );
}
```

## Styling Guidelines

1. Use Tailwind CSS classes when possible
2. Use RTL utilities: `start`/`end` instead of `left`/`right`
3. Use semantic color classes:
   - Primary: `blue-600`
   - Success: `green-600`
   - Danger: `red-600`
4. Consistent spacing: use multiples of 4px

## Common Tasks

### Add a new database field to students

1. Create migration in Supabase:
```sql
ALTER TABLE students ADD COLUMN new_field TEXT;
```

2. Update types in `src/lib/types.ts`:
```ts
export interface Student {
  // ... existing fields
  new_field: string;
}
```

3. Update form in `src/components/students/StudentForm.tsx`

### Add a new filter

1. Add state in the page component
2. Pass to query/search function
3. Update SQL WHERE clause in hook

### Change styling

1. Modify Tailwind classes in components
2. Or add custom CSS to `src/app/globals.css`
3. Test in both LTR preview (for comparison) and RTL

## Troubleshooting

### "Cannot find module '@/...'"
- Make sure `tsconfig.json` has correct paths
- Delete `.next` folder and rebuild: `npm run build`

### "Supabase connection failed"
- Verify NEXT_PUBLIC_SUPABASE_URL is correct
- Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct
- Check Supabase project is active
- Check .env.local is in root directory

### "Tables not found"
- Verify all SQL from DATABASE_SCHEMA.md was executed
- Check tables exist in Supabase dashboard Tables section
- Make sure you're querying correct table names

### "Hebrew text not showing"
- Check HTML has `dir="rtl" lang="he"`
- Verify font family includes Hebrew fonts
- Check `tailwind.config.ts` for font configuration

### Data not saving
- Check browser DevTools Network tab for errors
- Verify Supabase credentials are correct
- Check table permissions (RLS might be blocking)
- Look at Supabase dashboard Logs for database errors

## Next Steps

1. Set up authentication (see DEPLOYMENT.md)
2. Add more fields to student records as needed
3. Implement advanced reporting
4. Set up automated backups
5. Deploy to production (Vercel recommended)

## Performance Tips

1. Use pagination for large datasets
2. Add database indexes for frequently filtered fields
3. Implement caching with ISR (Incremental Static Regeneration)
4. Monitor Supabase query logs
5. Optimize images and assets

## Support

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- Hebrew documentation: Check README.md in Hebrew

---

**Created**: 2026-04-05
**Version**: 1.0.0
**Status**: Ready for Development & Testing
