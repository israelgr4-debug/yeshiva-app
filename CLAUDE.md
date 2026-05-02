# Yeshiva App - Claude Project Memory

This file is read at the start of every Claude Code session. It primes Claude
with the architecture, conventions and operational knowledge of this project.

## Mission

A complete management system for **Yeshivat Mir Modi'in Illit**.
Active production app at **https://yeshiva-app.vercel.app**.
~3,000 students, ~1,900 graduates, ~3,000 families.

## Stack

- **Framework**: Next.js 14 (App Router, RSC where useful, mostly client components)
- **UI**: TailwindCSS + custom design tokens in `src/app/globals.css`
- **Fonts**: Heebo (body) + Frank Ruhl Libre (display headings)
- **Auth & DB**: Supabase (Postgres + Auth + Storage + RLS)
- **Hosting**: Vercel (deploys from `main` automatically)
- **Hebrew/RTL throughout**

## Critical environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key lets us run admin scripts in `scripts/*.py` for data
fixes / one-off imports, bypassing RLS.

## Repo layout

```
src/
  app/                        # Next.js App Router pages
    page.tsx                  # Dashboard (KPIs, attention rail)
    students/                 # Students list + [id] detail
    families/                 # Families list + [id] detail
    graduates/                # Alumni (1894+ rows imported from Access)
    registration/             # Next-year candidate intake + tests
    finances/                 # Tuition, MASAV, payment history, Nedarim
    dormitory/                # Room map (print to A4 landscape)
    reports/                  # Certificate generator
    actions/                  # Admin tools (machzor, equivalent class,
                              # chinuch, ministry compare, olam-hatorah,
                              # neighborhoods, banks)
    settings/                 # Email, Nedarim Plus, certificate editor,
                              # users
    directory/                # Smart unified Hebrew people search
    tasks/                    # Task tracker
    lists/                    # Custom report builder + per-list reports
  components/
    layout/                   # AppShell, Sidebar, Header, MainLayout
    ui/                       # Button, Card, Input, Select, Table, Modal,
                              # Badge, SearchInput
    students/                 # StudentCard, StudentForm, StudentTable,
                              # StudentTuitionTab
    finances/                 # MASAV, collection, dashboards
    actions/                  # Per-tab admin tools
    graduates/                # List, pending, form dialog
    registration/             # List, scheduling, test day, acceptance
    directory/                # Result row + profile drawer
    settings/                 # EmailSettings, NedarimPlusSettings,
                              # RichTextEditor
    reports/                  # ReportSelector + CertificatePreview
  hooks/                      # useStudents, useGraduates, useDirectory,
                              # useTasks, useTuitionPayments, useRegistrations,
                              # useNeighborhoods, useCertificateTemplates,
                              # useSupabase, useSystemSettings, useAuth
  lib/                        # types.ts, auth.ts, certificates.ts,
                              # shiurim.ts, israeli-banks.ts,
                              # israeli-validators.ts, dorm-map.ts,
                              # nedarim-api.ts, list-reports.ts
supabase/migrations/          # Numbered SQL migrations 001..034+
scripts/                      # One-off Python scripts (run manually
                              # with the service-role key)
public/                       # logo.png + manifest.json (PWA)
```

## Database conventions

- All tables have `id UUID DEFAULT gen_random_uuid()`, `created_at`, `updated_at` (with trigger).
- RLS enabled. Most tables: authenticated users can read/write; admin-only
  ops gated in app.
- Migrations are numbered (001..034). Each migration is idempotent
  (uses IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT DO NOTHING).
- After creating a migration, **the user runs it manually in Supabase SQL
  Editor** - we don't have CLI deploys.

## Key business concepts

- **Student**: lives in `students`. Status: active/chizuk/inactive/graduated.
  Can be assigned to a `shiur` (class level) and `machzor_id` (cohort).
  `is_chinuch` flag = sub-institution requiring different letterhead.
- **Shiur 0** is a holding bucket for accepted registrants between final
  acceptance and start of school year. On year-up they promote to
  שיעור א and get a machzor.
- **Family**: parents + bank info. Linked from students via `family_id`.
- **Graduate**: alumni - separate table, can link back to original
  student_id. Auto-trigger creates a "pending graduate" row whenever a
  student.status changes to inactive/graduated.
- **Registration**: candidates applying for next year. After acceptance,
  the system creates a Student in שיעור 0.
- **Certificate templates**: stored in `certificate_templates` with
  `{{placeholder}}` syntax in `header_html`, `body`, `signer_html`.
  Editable by admins via /settings/certificates.

## Roles (UserRole)

- `admin`: everything + user management
- `manager`: read + reports + certificates
- `secretary`: write + MASAV gen, no delete
- `viewer`: read-only
- `graduates_only`: only sees /graduates (route-locked in AppShell)

## Design system rules

When editing UI, follow the conventions established across the app:

- **Cards**: `bg-white rounded-2xl border border-slate-200/70 elevation-1`
- **Buttons**: use `<Button>` component (variants: primary/secondary/danger/ghost)
- **Pill filter tabs**: gradient-bg when active, white border when inactive
- **Headers**: serif (`font-family: 'Frank Ruhl Libre'`) for h2/h3 of page sections
- **Section accent**: small vertical gradient bar before section title
  `<span className="w-1 h-4 bg-gradient-to-b from-X to-Y rounded-full" />`
- **Tables**: header uppercase tiny tracking-wider, hover row bg-blue-50/40
- **Avatars**: photo if exists, else gradient initial colored by name hash
- **Empty states**: large emoji + slate-500 message + slate-400 hint
- **Forms**: Input/Select with label above; rounded-xl borders
- **Mobile-first**: every grid uses sm:/md:/lg: breakpoints
- **Hebrew-first**: `dir="rtl"` is global. Use `start`/`end` for
  margin/padding (logical) instead of `left`/`right`.

## Operational notes

### Running admin scripts
```bash
# scripts/*.py read .env.local and use the service role key
python scripts/import_graduates.py
```

### Running migrations
- Open Supabase Dashboard → SQL Editor
- Paste contents of `supabase/migrations/0XX_name.sql`
- Run

### Type-check before commit
```bash
npx tsc --noEmit
```

### Git workflow
- Work directly on `main`
- Commit early, commit often - Vercel deploys ~30s after push
- Always include the `Co-Authored-By: Claude` trailer

## Known recurring issues

- **PostgREST 1000-row cap**: any large fetch needs `.range()` pagination
  (loop p=0..20, range(p*1000, p*1000+999), break when fewer rows return)
- **Empty string vs null for date columns**: Postgres rejects `''` for
  date/time/uuid. Sanitize before insert (see `useGraduates.sanitize`).
- **RTL drawer transitions**: don't rely on `translate-x` class names -
  set `style.transform` directly with `translateX(100%)` for slide-in
- **Hebrew names**: use full normalization (NBSP, gershayim variants,
  internal whitespace) when matching - see `MinistryCompareTab.normStr`
- **Storage buckets**: must be created in Supabase dashboard first,
  then their RLS policies applied via migration

## When the user asks for a new feature

1. Check if there's a similar existing feature to reuse patterns
2. Follow design system rules above
3. Add types to `src/lib/types.ts`
4. Create a hook in `src/hooks/` for data ops
5. Create a page under `src/app/<route>/page.tsx`
6. If the data lives in a new table → write a migration in
   `supabase/migrations/` with seeded RLS + updated_at trigger
7. If exposing in sidebar → add to `src/components/layout/Sidebar.tsx`
8. Type check + commit + push

## Don't do

- Don't write to `students.status` outside of normal lifecycle - the
  graduate auto-trigger fires
- Don't use raw `<table>` - prefer `<Table>` from `components/ui`
- Don't translate hardcoded English strings - the app is Hebrew-only,
  English in code = developer-facing only
- Don't introduce new env vars without updating `.env.local.example`
