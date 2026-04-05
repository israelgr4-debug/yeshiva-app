# ישיבת מיר מודיעין עילית - Complete File Index

## Quick Navigation

### Start Here
1. **PROJECT_SUMMARY.md** - Overview of the entire project
2. **SETUP_GUIDE.md** - Step-by-step setup instructions
3. **README.md** - Project description and features

### Development
- **DEV_CHECKLIST.md** - Comprehensive checklist before launch
- **DATABASE_SCHEMA.md** - SQL tables to create in Supabase
- **DEPLOYMENT.md** - Deployment to production

### Project Structure

```
yeshiva-app/
├── Configuration Files
│   ├── package.json              # Dependencies & scripts
│   ├── tsconfig.json             # TypeScript config
│   ├── tailwind.config.ts        # Tailwind with RTL
│   ├── next.config.js            # Next.js config
│   ├── postcss.config.js         # CSS processing
│   ├── .gitignore                # Git ignore rules
│   └── .env.local.example        # Environment template
│
├── Documentation
│   ├── INDEX.md                  # This file
│   ├── PROJECT_SUMMARY.md        # Project overview
│   ├── SETUP_GUIDE.md            # Getting started
│   ├── DATABASE_SCHEMA.md        # Database tables
│   ├── DEPLOYMENT.md             # Production guide
│   ├── DEV_CHECKLIST.md          # Launch checklist
│   └── README.md                 # Feature overview
│
└── src/
    ├── app/
    │   ├── layout.tsx            # Root layout with RTL
    │   ├── page.tsx              # Dashboard home
    │   ├── globals.css           # Global styles
    │   │
    │   ├── students/
    │   │   ├── page.tsx          # Student list & search
    │   │   └── [id]/
    │   │       └── page.tsx      # Student detail/edit
    │   │
    │   ├── finances/
    │   │   └── page.tsx          # Donations & finances
    │   │
    │   ├── dormitory/
    │   │   └── page.tsx          # Room management
    │   │
    │   └── settings/
    │       └── page.tsx          # System settings
    │
    ├── components/
    │   ├── layout/               # Navigation & layout
    │   │   ├── Sidebar.tsx       # Navigation sidebar
    │   │   ├── Header.tsx        # Page header
    │   │   └── MainLayout.tsx    # Main layout wrapper
    │   │
    │   ├── ui/                   # Reusable UI components
    │   │   ├── Button.tsx        # Styled buttons
    │   │   ├── Input.tsx         # Form inputs
    │   │   ├── Select.tsx        # Dropdowns
    │   │   ├── Table.tsx         # Data tables
    │   │   ├── Card.tsx          # Card containers
    │   │   ├── Badge.tsx         # Status badges
    │   │   ├── Modal.tsx         # Dialog modals
    │   │   └── SearchInput.tsx   # Search box
    │   │
    │   ├── students/             # Student features
    │   │   ├── StudentTable.tsx  # Student data table
    │   │   ├── StudentForm.tsx   # Student form
    │   │   └── StudentCard.tsx   # Student info card
    │   │
    │   └── finances/             # Finance features
    │       └── DonationsSummary.tsx # Donation cards
    │
    ├── lib/
    │   ├── supabase.ts           # Supabase client
    │   ├── types.ts              # TypeScript interfaces
    │   └── utils.ts              # Helper functions
    │
    └── hooks/
        ├── useSupabase.ts        # Generic DB hook
        └── useStudents.ts        # Student-specific hook
```

## File Descriptions

### Configuration Files

#### package.json
Dependencies and npm scripts
```
- Dependencies: next, react, @supabase/supabase-js, tailwindcss
- Scripts: dev, build, start, lint
```

#### tsconfig.json
TypeScript compiler options
```
- Target: ES2020
- Module resolution: node
- Paths: @ points to ./src/*
- Strict mode: enabled
```

#### tailwind.config.ts
Tailwind CSS configuration
```
- Custom colors: primary, sidebar, accent
- Font family: Hebrew fonts (Arial, David)
- RTL support built-in
```

#### next.config.js
Next.js configuration
```
- React strict mode enabled
- SWC minification enabled
```

#### postcss.config.js
PostCSS configuration for Tailwind and Autoprefixer

#### .env.local.example
Template for environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Pages (App Router)

#### src/app/layout.tsx (Root)
- Sets up RTL direction (dir="rtl")
- Sets Hebrew language (lang="he")
- Wraps app with MainLayout component
- Imports global CSS

#### src/app/page.tsx (Dashboard)
- Real-time statistics
- Quick action buttons
- Recent activity section
- Uses useSupabase hook to fetch stats

#### src/app/students/page.tsx (Students List)
- Full-text search with filtering
- Filter by status and shiur
- Pagination (10 items per page)
- Add new student button
- Uses StudentTable component

#### src/app/students/[id]/page.tsx (Student Detail)
- View/edit student information
- Tabs for: details, addresses, donations, dormitory
- Form submission
- Related student card
- Uses StudentForm component

#### src/app/finances/page.tsx (Finances)
- Summary cards (committed, collected, pending)
- Add donation form
- Donation history table
- Currency formatting
- Uses DonationsSummary component

#### src/app/dormitory/page.tsx (Dormitory)
- Room grid by building/wing/floor
- Room status indicators
- Occupancy statistics
- Room details modal
- Click to view occupants

#### src/app/settings/page.tsx (Settings)
- Institution settings
- Admin settings
- System preferences
- Backup options

#### src/app/globals.css (Styles)
- Global CSS reset
- RTL utilities
- Scrollbar styling
- Animations and transitions
- Loading skeleton styles

### Components

#### Layout Components

**Sidebar.tsx**
- Dark theme navigation
- Active page indication
- Institution info
- 5 menu items

**Header.tsx**
- Page title and subtitle
- Used on every page

**MainLayout.tsx**
- Wrapper component
- Combines Sidebar and main content
- Responsive layout

#### UI Components

All in `src/components/ui/` and use Tailwind CSS:

**Button.tsx**
- Variants: primary, secondary, danger, ghost
- Sizes: sm, md, lg
- Focus states and transitions

**Input.tsx**
- Label and error message support
- Validation styling
- RTL-friendly

**Select.tsx**
- Dropdown with custom options
- Label and error support
- Accessible

**Table.tsx**
- Composition: Table, TableHeader, TableBody, TableRow, TableCell
- Hover effects
- Responsive scrolling

**Card.tsx**
- Composition: Card, CardHeader, CardContent, CardFooter
- White background with subtle shadow
- Border styling

**Badge.tsx**
- Variants: primary, success, warning, danger, gray
- Inline display
- Status indicators

**Modal.tsx**
- Overlay with semi-transparent background
- Close button
- Title support
- Escape key handling

**SearchInput.tsx**
- Built on Input component
- Search icon integrated
- onChange callback

#### Feature Components

**StudentTable.tsx**
- Columns: name, ID, shiur, equivalent, status, actions
- Edit/delete buttons
- Link to detail page
- Loading skeleton

**StudentForm.tsx**
- Personal information fields
- Address section
- Parent information
- Status selection
- Notes textarea
- Form submission handling

**StudentCard.tsx**
- Summary of student info
- Quick view card
- Status badge

**DonationsSummary.tsx**
- Three stat cards
- Committed, collected, pending
- Currency formatting
- Color-coded backgrounds

### Utilities & Hooks

#### src/lib/supabase.ts
Initializes Supabase client with environment variables

#### src/lib/types.ts
TypeScript interfaces:
- Student
- Donation
- Room
- RoomAssignment
- Staff
- DashboardStats

#### src/lib/utils.ts
Helper functions:
- formatDate()
- formatCurrency()
- cn() - class name merge
- getStatusColor()
- getStatusLabel()
- truncate()
- parseFormData()

#### src/hooks/useSupabase.ts
Generic database operations:
- fetchData()
- insertData()
- updateData()
- deleteData()
- Loading and error state

#### src/hooks/useStudents.ts
Student-specific operations:
- getStudents()
- getStudentById()
- createStudent()
- updateStudent()
- deleteStudent()
- Loading and error state

## Database Tables

Created in Supabase:

1. **students** - Core student records
2. **donations** - Financial commitments and payments
3. **rooms** - Dormitory room inventory
4. **room_assignments** - Student to room mapping
5. **staff** - Staff/employee records

See DATABASE_SCHEMA.md for SQL.

## Color Scheme

- **Primary**: #2563eb (Blue-600)
- **Success**: #16a34a (Green-600)
- **Danger**: #dc2626 (Red-600)
- **Sidebar**: #1e293b (Slate-800)
- **Background**: #f8fafc (Slate-50)
- **Text**: #1e293b (Slate-900)
- **Border**: #e2e8f0 (Slate-200)

## Routes/Navigation

```
/                      → Dashboard
/students              → Student list
/students/new          → Add new student
/students/[id]         → Student detail
/finances              → Donations & finances
/dormitory             → Room management
/settings              → System settings
```

## Development Workflow

### Adding a New Page

1. Create `src/app/[page]/page.tsx`
2. Add to sidebar in `Sidebar.tsx`
3. Import Header component
4. Use MainLayout wrapper

### Adding a New Component

1. Create in `src/components/[type]/`
2. Define TypeScript interfaces
3. Export with display name
4. Use Tailwind classes
5. Ensure RTL compatible

### Adding a New Hook

1. Create in `src/hooks/`
2. Use 'use client' directive
3. Handle loading/error states
4. Return typed data

### Database Operations

1. Use hooks from `src/hooks/`
2. Handle loading state
3. Handle error state
4. Display empty state if needed

## Performance Considerations

- Pagination: 10 items per page
- Lazy loading components
- Modal dialogs for modals
- Index on frequently filtered columns
- Debounce search queries

## Accessibility

- Semantic HTML
- Button elements for clicks
- Form labels
- Alt text support ready
- Keyboard navigation
- RTL direction support

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive
- RTL tested
- No IE support needed

## Testing the App

Use DEV_CHECKLIST.md for comprehensive testing guide.

Quick test checklist:
- [ ] Dashboard loads
- [ ] Search students works
- [ ] Add student form submits
- [ ] Student details display
- [ ] Edit student works
- [ ] Delete student works
- [ ] Add donation works
- [ ] Room grid displays
- [ ] Sidebar navigation works

## Next Steps

1. Read PROJECT_SUMMARY.md
2. Follow SETUP_GUIDE.md
3. Create Supabase database
4. Run `npm install`
5. Set .env.local variables
6. Run `npm run dev`
7. Test with DEV_CHECKLIST.md
8. Deploy with DEPLOYMENT.md

## Resources

- Next.js 14 Docs: https://nextjs.org/docs
- Supabase Docs: https://supabase.com/docs
- Tailwind CSS: https://tailwindcss.com/docs
- TypeScript: https://www.typescriptlang.org/docs

---

**Version**: 1.0.0
**Last Updated**: 2026-04-05
**Language**: Hebrew (עברית)
**Status**: Ready for Development
