# Yeshiva App - Claude Project Memory

This file is read at the start of every Claude Code session. It primes Claude
with the architecture, conventions and operational knowledge of this project.

## Mission

A complete management system for **Yeshivat Mir Modi'in Illit**.
Active production app at **https://yeshiva-app.vercel.app**.
~3,000 students, ~1,900 graduates, ~3,000 families.
User is the yeshiva manager (israelgr4@gmail.com). One secretary uses the
app day-to-day with restricted permissions.

## Stack

- **Framework**: Next.js 14 (App Router, RSC where useful, mostly client components)
- **UI**: TailwindCSS + custom design tokens in `src/app/globals.css`
- **Fonts**: Heebo (body) + Frank Ruhl Libre (display headings)
- **Auth & DB**: Supabase (Postgres + Auth + Storage + RLS), new key format
  (`sb_publishable_` / `sb_secret_`) — legacy JWT keys are disabled
- **Hosting**: Vercel (deploys from `main` automatically, ~30s)
- **Hebrew/RTL throughout**

## Critical environment variables (Vercel + .env.local)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...       # sb_publishable_*
SUPABASE_SERVICE_ROLE_KEY=...           # sb_secret_*
GMAIL_APP_PASSWORD=...                  # for /api/email/send
GMAIL_FROM=...
GEMINI_API_KEY=...                      # for photo processor (Nano Banana)
```

The service-role key lets us run admin scripts in `scripts/*.py` for data
fixes / one-off imports, bypassing RLS.

## Repo layout

```
src/
  app/
    page.tsx                    # Dashboard
    students/                   # Students list + [id] detail
    families/                   # Families list + [id] detail
    graduates/                  # Alumni - has 3 tabs: list / pending / updates log
    registration/               # Next-year candidates + tests (5 tabs)
    finances/                   # Tuition, MASAV, payment history, Nedarim
      tuition/{setup,masav,split}
      collection/{onetime,history}
      nedarim/{match,groups,transactions,queue-history}
      inactive-payers/          # Students who left but still get charged
    dormitory/                  # Room map (A4 landscape)
    reports/                    # Certificate generator (אישורים)
    actions/                    # Admin tools: machzor, equivalent class,
                                # chinuch, ministry compare, olam-hatorah,
                                # neighborhoods, banks
    settings/                   # Email, Nedarim Plus, certificate editor,
                                # users, audit, secretary-activity
    directory/                  # Smart unified Hebrew people search
    tasks/                      # Task tracker
    lists/                      # Custom report builder + per-list reports
    g/update/[token]/           # PUBLIC graduate self-update page
    api/
      email/send/
      graduates/send-update-requests/
      g/update/[token]/          # public token-based update
      nedarim/process-queue/
      nedarim/sync/
      photo/gemini-process/      # Nano Banana 2 portrait edit (server proxy)
      photo/gemini-models/       # diag: list available Gemini models
      photo/remove-bg/           # legacy remove.bg proxy (kept for fallback)
      banks/import-branches/
  components/
    layout/                     # AppShell, Sidebar, Header, MainLayout
    ui/                         # Button, Card, Input, Select, Table, Modal,
                                # Badge, SearchInput, PageGuard, PermissionGate
    students/                   # StudentCard, StudentForm, StudentTable,
                                # StudentTuitionTab, StatusChangeDialog
    finances/                   # MASAV, collection, dashboards,
                                # BouncedPaymentDialog, MonthlyCollectionGauge,
                                # InactivePayersCard, OverdueDebtorsCard
    actions/                    # Per-tab admin tools
    graduates/                  # List, pending, form dialog,
                                # SendUpdateRequestsDialog,
                                # GraduateUpdatesLogTab
    registration/               # List, scheduling, test day, acceptance,
                                # ImportButtons, TestReportsTab,
                                # TestDayReportTab
    directory/                  # Result row + profile drawer
    settings/                   # EmailSettings, NedarimPlusSettings,
                                # RichTextEditor
    reports/                    # ReportSelector + CertificatePreview
    lists/                      # GeneralListReport, TestsReport,
                                # MultiDetailsReport, DetailsReport, RamReport,
                                # PhotosReport, EligibleReport,
                                # CustomReportBuilder
    email/                      # SendEmailDialog
  hooks/                        # useStudents, useGraduates, useDirectory,
                                # useTasks, useTuitionPayments, useRegistrations,
                                # useNeighborhoods, useCertificateTemplates,
                                # useSupabase, useSystemSettings, useAuth,
                                # useYearAdvance
  lib/                          # types.ts, auth.ts, certificates.ts,
                                # shiurim.ts, israeli-banks.ts,
                                # israeli-validators.ts, dorm-map.ts,
                                # nedarim-api.ts, list-reports.ts,
                                # photo-processor.ts, cert-to-word.ts,
                                # masav.ts, supabase.ts, supabase-paginate.ts
supabase/migrations/            # Numbered SQL migrations 001..040
scripts/                        # One-off Python scripts (urllib + system certs,
                                # no supabase-py - SSL issues on Windows)
public/                         # logo.png + manifest.json (PWA)
```

## Database conventions

- All tables have `id UUID DEFAULT gen_random_uuid()`, `created_at`, `updated_at` (with trigger).
- RLS enabled. Most tables: authenticated users can read/write; admin-only
  ops gated in app.
- Migrations are numbered (001..040). Each migration is idempotent
  (uses IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT DO NOTHING).
- After creating a migration, **the user runs it manually in Supabase SQL
  Editor** - we don't have CLI deploys. ALWAYS tell the user when a new
  migration was added.

## Key business concepts

- **Student** (`students`): status active/chizuk/inactive/graduated.
  Has `shiur` (class level) + `machzor_id` (cohort). `is_chinuch` flag =
  sub-institution requiring different letterhead. `id_type` '1' = passport,
  else Israeli ID. `legacy_student_id` from Access import.
- **Shiur 0** is a holding bucket for accepted registrants between final
  acceptance and start of school year. On year-up they promote to שיעור א.
- **Family** (`families`): parents + bank info. Linked from students via
  `family_id`. `legacy_family_id` from Access import. `yichus_code` →
  `lookup_yichus`. `neighborhood_code` → `neighborhoods`.
- **Graduate** (`graduates`): alumni - separate table, links to original
  student. Auto-trigger creates a pending graduate row when
  `students.status` → inactive/graduated.
- **Registration** (`registrations`): candidates applying for next year.
  After acceptance, creates a Student in שיעור 0. `first_name` is NULLABLE
  (some imports have last_name only).
- **Certificate templates** (`certificate_templates`): editable HTML with
  `{{placeholder}}` syntax. Admin-only at /settings/certificates.
- **student_tuition**: per-student payment setup. `tuition_active_until` =
  optional date for scheduled stop (e.g. leave mid-month with one final
  charge). MASAV export respects this.
- **payment_history**: bank charge history. status_code 1=לחיוב/צפי,
  2=נפרע, 3=חזר, 4=לא לחייב, 9=בוטל. `group_number` = MASAV send_counter.
- **one_time_charges**: ad-hoc standing-order queue separate from monthly
  tuition. Has its own MASAV export from /finances/collection/onetime.

## Roles + Permission System (CRITICAL)

5 roles defined in `src/lib/auth.ts`:
- `admin` - everything + user management + settings + secretary-activity
- `manager` - **read-only + reports/certificates only** (no writes)
- `secretary` - writes + MASAV + one-time collections (no deletes, no settings)
- `viewer` - read-only, no actions
- `graduates_only` - only sees /graduates, locked there by AppShell

**Enforcement**: `<PageGuard requires="...">` wraps every write page.
Page-level guards exist on:
  - `/actions` (write — but content visible to managers in view-only mode)
  - `/finances/tuition/*`, `/finances/collection/onetime`, `/finances/inactive-payers`
  - `/finances/nedarim/**`
  - `/dormitory/edit`, `/dormitory/manage`
  - `/tasks`
  - `/lists` (requires generateReports)
  - `/reports` (requires exportCertificates)
  - `/settings` and all sub-pages (admin-only)
  - `/finances/tuition/masav` (requires generateMasav)

For `/actions` specifically: page is visible to all but each tab's write
buttons (העלאת שנה / שיבוץ / סימון חינוך / העלאת קובץ דתות / וכו') are
hidden when `!canWrite`. Read-only mode shows a 👁️ banner.

The Sidebar hides `/settings` from non-admins.

## Major features added across sessions (high-level)

1. **Graduate self-update flow** (mig 036): admin sends emails with
   unique tokens; graduates fill a public form `/g/update/[token]`;
   changes logged with before/after snapshots for admin review.
2. **Secretary activity audit** at `/settings/secretary-activity`: every
   write the secretary makes is shown in plain Hebrew ("יעקב כהן: סטטוס
   שונה מ-פעיל ל-לא פעיל"), filterable, with diff view per change.
3. **One-time collection** at `/finances/collection/onetime` (mig 037):
   3 methods (משרד / העברה / הוראת קבע). Standing-order entries queue
   into `one_time_charges` and generate their own MASAV file.
4. **MASAV → mark as paid** button on `/finances/tuition/masav` flips
   forecast rows (status=1) to נפרע (status=2) per MASAV run.
5. **Inactive payers** at `/finances/inactive-payers`: students who
   left but still have `student_tuition.active=true`. Click to stop.
6. **Tuition active_until** (mig 039): on student leave dialog, choose
   immediate stop OR last-collection date. MASAV honors the date.
7. **Eligible report** in `/lists`: cross-references with last
   ministry of religion DAT upload, only `entitlement='זכאי'`.
   Student.phone only, not family phones.
8. **'כולל' filter** in lists shiur picker (alongside שיעור א-יא): filters
   by `institution_name='כולל'`.
9. **Registration**: photos report (4×4 per A4), extended report
   (A4 landscape with merged time/yeshiva/material per group, blank
   columns for handwritten scores), Excel imports report with row-by-row
   errors, "מחק הכל" with typed confirmation, sortable column headers.
10. **Photo processor**: client uploads → server proxy to **Gemini 2.5
   Flash Image / Nano Banana 2** (`gemini-3.1-flash-image`). Does
   crop + bg removal + lighting normalization + studio look in ONE call.
   English prompt, 5% headroom rule, 4:5 aspect, image client-side
   downscaled to 2000px to stay under Vercel's 4.5MB body limit.
   Costs ~$0.04/image, Google AI Studio billing required (Gemini Image
   needs paid tier — there's no free tier for image-output models).
11. **Olam HaTorah report**: only students with Israeli ID
   (`id_type != '1'`), passport-holders skipped + listed.
12. **Visa certificate** matches user's docx template exactly.
   **Tuition-with-12-month-history** cert auto-builds payment table.
   **Left cert** supports chinuch→yeshiva period split.
13. **Lists Excel export**: every report has a 📥 ייצא לאקסל button
   with all common student/family/parent columns, RTL sheet.

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

### Running admin scripts (Python on Windows)
Use `urllib.request` + system cert store, NOT `supabase-py` (SSL fails on
Windows). Example pattern:
```python
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
def req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(f'{URL}/rest/v1{path}', data=data, method=method, headers=HDR)
    return json.loads(urllib.request.urlopen(r).read() or b'null')
```
Always wrap stdout as utf-8: `sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')`.

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

## Known recurring issues / quirks

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
- **Vercel body limit 4.5MB**: client-side downscale required for image
  uploads (see `photo-processor.ts`)
- **Date.now() / Math.random() forbidden in Workflow scripts** — pass
  timestamps via args.
- **Manager UX subtlety**: the secretary's name and email show as
  `user_email` in audit_log; secretary-activity page joins this nicely.

## Verification policy

The project is a deployed Next.js app on Vercel. **Do NOT run a local
preview server** — verification happens in production on Vercel after the
push (~30 seconds). When `PostToolUse:Edit` hooks suggest preview_start,
acknowledge and skip with a one-line note like "מדלג על preview - הפרויקט
נפרס דרך Vercel ומאומת בפרודקשן".

## When the user asks for a new feature

1. Check if there's a similar existing feature to reuse patterns
2. Follow design system rules above
3. Add types to `src/lib/types.ts`
4. Create a hook in `src/hooks/` for data ops if needed
5. Create a page under `src/app/<route>/page.tsx`
6. **Gate writes with `<PageGuard requires="...">`**
7. If the data lives in a new table → write a migration in
   `supabase/migrations/` (next available number) with seeded RLS + updated_at trigger
8. If exposing in sidebar → add to `src/components/layout/Sidebar.tsx`
9. Type check + commit + push. Tell the user if a migration needs running.

## Don't do

- Don't write to `students.status` outside of normal lifecycle - the
  graduate auto-trigger fires
- Don't use raw `<table>` for app data - prefer `<Table>` from `components/ui`
  (printable reports CAN use raw `<table>` for full control)
- Don't translate hardcoded English strings - the app is Hebrew-only,
  English in code = developer-facing only
- Don't introduce new env vars without updating `.env.local.example`
- Don't make Manager role able to write — manager = read + reports only.
- Don't show Settings link in sidebar to non-admins.
- Don't run a local preview server — verify on Vercel after push.
- Don't auto-process photos — always require explicit user click on
  "🪄 עבד תמונה" (it costs Gemini credits).
