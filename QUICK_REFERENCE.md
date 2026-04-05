# Quick Reference Card

## Installation (5 min)

```bash
cd /sessions/happy-gracious-planck/mnt/MOSAD/yeshiva-app
npm install
cp .env.local.example .env.local
# Edit .env.local with Supabase credentials
npm run dev
```

## Key Commands

```bash
npm run dev              # Development server (http://localhost:3000)
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Check code style
npm run type-check       # TypeScript validation
```

## Project Locations

```
Dashboard:       http://localhost:3000
Students List:   http://localhost:3000/students
Add Student:     http://localhost:3000/students/new
Finance:         http://localhost:3000/finances
Dormitory:       http://localhost:3000/dormitory
Settings:        http://localhost:3000/settings
```

## File Locations

```
Pages:           src/app/*/page.tsx
Components:      src/components/*/
Styles:          src/app/globals.css
Database:        src/lib/supabase.ts
Types:           src/lib/types.ts
Hooks:           src/hooks/
Config:          next.config.js, tailwind.config.ts
Env:             .env.local
```

## Common Tasks

### Search/Filter Students
- Search by name or ID
- Filter by status (active/inactive/graduated)
- Filter by shiur (class)
- Pagination: 10 per page

### Add Student
1. Click "הוסף תלמיד" button
2. Fill form fields
3. Click "צור"

### Edit Student
1. Click student name
2. Click "עריכה"
3. Modify fields
4. Click "עדכן"

### Add Donation
1. Go to Finances
2. Click "רשום תרומה חדשה"
3. Select student
4. Enter amount and date
5. Click "שמור"

### View Room
1. Go to Dormitory
2. Click any room in grid
3. View occupants in modal

## Component Imports

```tsx
// Layout
import { Header } from '@/components/layout/Header';
import { MainLayout } from '@/components/layout/MainLayout';

// UI
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';

// Features
import { StudentTable } from '@/components/students/StudentTable';
import { StudentForm } from '@/components/students/StudentForm';
import { DonationsSummary } from '@/components/finances/DonationsSummary';

// Hooks
import { useSupabase } from '@/hooks/useSupabase';
import { useStudents } from '@/hooks/useStudents';

// Utilities
import { cn } from '@/lib/utils';
import { formatDate, formatCurrency } from '@/lib/utils';
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Database Tables

```
students              # Core student records
├── id
├── first_name
├── last_name
├── id_number
├── shiur
├── status
└── ...

donations             # Financial records
├── id
├── student_id
├── amount
├── status
├── donation_date
└── ...

rooms                 # Dormitory inventory
├── id
├── room_number
├── building
├── wing
├── floor
├── capacity
└── status

room_assignments      # Student-to-room mapping
├── id
├── student_id
├── room_id
├── assignment_date
└── ...

staff                 # Staff records
├── id
├── first_name
├── last_name
├── position
└── status
```

## Tailwind Classes (RTL-aware)

```
Text Alignment:
text-start      → right align (RTL)
text-end        → left align (RTL)

Padding:
ps-4            → padding-right (RTL)
pe-4            → padding-left (RTL)

Margin:
ms-auto         → margin-left (auto, RTL)
me-4            → margin-right

Colors:
bg-blue-600, text-blue-600      → Primary
bg-green-600, text-green-600    → Success
bg-red-600, text-red-600        → Danger
bg-slate-800, text-slate-800    → Dark

Spacing:
p-4, p-6, p-8   → padding
m-4, m-6, m-8   → margin
gap-2, gap-4    → gaps

Borders:
border, border-gray-200
border-t, border-b, border-r, border-l
rounded-lg, rounded-full

Shadows:
shadow-sm, shadow-md, shadow-lg
```

## Component Props

```tsx
// Button
<Button variant="primary|secondary|danger|ghost" size="sm|md|lg" />

// Input
<Input label="Label" error="Error message" />

// Select
<Select options={[{value, label}]} label="Label" />

// Card
<Card>
  <CardHeader></CardHeader>
  <CardContent></CardContent>
</Card>

// Badge
<Badge variant="primary|success|warning|danger|gray" />

// Modal
<Modal isOpen={bool} onClose={fn} title="Title">
  Content
</Modal>
```

## Debugging

```
Network Errors:
→ Check .env.local
→ Verify Supabase project is active
→ Check browser DevTools Network tab

Type Errors:
→ npm run type-check
→ Check src/lib/types.ts

Styling Issues:
→ Clear browser cache
→ Check Tailwind config
→ Verify RTL classes used

Build Errors:
→ Delete .next folder
→ Delete node_modules
→ npm install
→ npm run build
```

## Useful Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Dashboard](https://app.supabase.com)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

## RTL Checklist

- [ ] HTML has dir="rtl" lang="he"
- [ ] Using text-start/end not left/right
- [ ] Using ps/pe not pl/pr
- [ ] Using ms/me not ml/mr
- [ ] Font includes Hebrew
- [ ] Test in actual RTL browser

## Testing Checklist

- [ ] Search works
- [ ] Filters work
- [ ] Add/Edit/Delete work
- [ ] Forms submit
- [ ] Data displays
- [ ] Links work
- [ ] No console errors
- [ ] RTL looks correct

## Deployment

```bash
# Build
npm run build

# Vercel (recommended)
vercel

# Or manual
npm start

# Or Docker
docker build -t yeshiva-app .
docker run -p 3000:3000 yeshiva-app
```

## Architecture

```
App (RTL + Hebrew)
  ├── MainLayout (Sidebar + Main)
  │   ├── Sidebar (Navigation)
  │   └── Main Content
  │       ├── Header
  │       └── Page Component
  │           ├── UI Components
  │           └── Hooks
  │               └── Supabase
```

## State Management

- Client state: useState
- Data fetching: Custom hooks
- URL state: useParams, useRouter
- No global state manager needed

## Performance Tips

- Use pagination
- Debounce search
- Lazy load modals
- Add database indexes
- Monitor bundle size

---

**Print this page for quick reference while developing!**
