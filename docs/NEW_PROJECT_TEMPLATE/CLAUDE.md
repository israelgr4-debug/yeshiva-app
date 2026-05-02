# PROJECT_NAME - Claude Project Memory

This file is read at the start of every Claude Code session. It primes Claude
with the architecture, conventions and operational knowledge of this project.

> **TODO:** Replace ALL the bracketed `[…]` sections with real project info.
> Delete bullets / sections that don't apply. Keep it concise - quality over
> coverage. ~150-200 lines is the sweet spot.

## Mission

[1-2 sentences. Who uses this? What does it do? Production URL if any.]

## Stack

- **Framework**: [Next.js / Django / Express / FastAPI / ...]
- **Language**: [TypeScript / Python / Go / ...]
- **Database**: [Supabase / Postgres / MongoDB / SQLite / ...]
- **Hosting**: [Vercel / Railway / AWS / self-hosted]
- **Other notable**: [Tailwind, Prisma, Auth0, Stripe, ...]

## Critical environment variables

```
KEY1=...
KEY2=...
```

[Briefly note what each is for and where to get it.]

## Repo layout

```
src/               # [or wherever code lives]
  ...
```

[Pick the 6-12 most important folders/files. One line each. Don't
exhaustively list everything.]

## Key business concepts

[For domain-heavy apps: define the main entities and how they relate.]
[For tools/libraries: describe the public API surface.]

## Conventions

- **Naming**: [snake_case for X, camelCase for Y, ...]
- **Components**: [where they live, prop conventions]
- **Forms**: [validation library, error display]
- **API**: [REST / GraphQL / RPC, error format]
- **Style**: [linter, formatter - point to config files]

## Operational notes

### Running locally
```bash
[exact commands]
```

### Running tests
```bash
[exact commands - and what they cover]
```

### Deploying
[How does code get to production? Auto on push? Manual? CI/CD?]

### Database changes
[How are migrations done? Manual? CLI? Auto?]

## Roles / permissions

[If there's auth - what roles exist and what each can do.]

## Known recurring issues

- [Things that have bitten us before. Be specific.]
- [E.g. "PostgREST has a 1000-row default cap - paginate large fetches"]
- [E.g. "Don't use moment.js - we standardized on date-fns"]

## When the user asks for a new feature

1. [Step-by-step preferred approach for this codebase]
2. [E.g. "Add type to types.ts → hook in hooks/ → page in app/ → test"]

## Don't do

- [Things to avoid based on past mistakes or design decisions]
