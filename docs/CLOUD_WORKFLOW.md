# Cloud Workflow - Working from Anywhere

This doc explains the setup for working with this repo (and any other repo)
through Claude Code on the Web - so you can ask for changes from any browser
or mobile.

## Per-repo setup (one-time, ~10 minutes)

For **every** project you want to be able to work on remotely:

### 1. Add `.devcontainer/devcontainer.json`
Tells the cloud environment what to install on startup. Already in this repo
(`.devcontainer/devcontainer.json`). For another project, copy the file and
adjust:
- Image (Node? Python? Go?)
- `postCreateCommand` (e.g. `npm install`, `pip install -r requirements.txt`)
- Forward ports
- Useful VS Code extensions

### 2. Add `CLAUDE.md` at the repo root
This is the project memory. Claude reads it at the start of every session
and immediately knows: stack, conventions, where things live, how to run
migrations, common pitfalls, etc.

A good CLAUDE.md covers:
- Mission / production URL
- Tech stack
- Repo layout (one-liner per important folder)
- Required env vars
- DB conventions
- Roles / permissions
- Design system rules
- Common operations (migrations, scripts, deploy)
- Known recurring issues (so Claude doesn't trip on them)

See `CLAUDE.md` in this repo for a real example.

### 3. Push to GitHub
The repo must be on GitHub for Claude Code on the Web to access it.

### 4. Connect to Claude Code on the Web
- Go to **claude.ai/code**
- Click "Connect GitHub"
- Authorize the app on the specific repo (or all your repos)

### 5. Add secrets / env vars
In the Claude Code on the Web UI for each repo:
- Settings → Environment variables
- Paste each `KEY=VALUE` from your local `.env.local`

This way Claude can run scripts that hit Supabase / external APIs.

---

## Daily use (any device)

1. Open **claude.ai/code** in any browser (mobile included)
2. Pick a project from the dropdown (you'll see all your connected repos)
3. Start a new session and just ask
4. Claude reads `CLAUDE.md` automatically and is up to speed
5. When done, Claude commits and pushes - Vercel/your-host deploys

That's it. No local clone, no terminal, no laptop.

---

## Mobile-friendly tips

- **Voice dictation** for long requests (Hebrew works well in iOS/Android)
- **Background tasks**: ask Claude to run something long; it'll notify
  you when done
- **GitHub mobile app**: review the PR / commits before approving
- **Vercel mobile app**: monitor deploys + see preview URLs

---

## Adding a new project to this workflow

```bash
cd /path/to/new-project

# 1. Copy these files from yeshiva-app
cp ../yeshiva-app/.devcontainer/devcontainer.json .devcontainer/

# 2. Tailor the devcontainer (image, postCreateCommand)

# 3. Write a CLAUDE.md - or ask Claude to draft one
#    by reading the repo:
#    "Read this repo and draft a CLAUDE.md following the format
#     of yeshiva-app's CLAUDE.md"

# 4. Commit and push
git add .devcontainer CLAUDE.md
git commit -m "Add cloud-workflow files"
git push

# 5. Go to claude.ai/code → connect this repo → add env vars
```

---

## Workflow comparison

| Scenario              | Local laptop  | Codespaces       | Claude Code on the Web |
|-----------------------|---------------|------------------|-----------------------|
| Setup time            | 30+ min       | 5 min            | 2 min                 |
| Mobile-friendly       | No            | Mostly           | **Yes**               |
| Cost                  | Free          | $0.18/hr         | Anthropic plan        |
| Need internet         | No            | Yes              | Yes                   |
| Auto-commit & push    | Manual        | Manual           | **Automatic**         |
| Background tasks      | Blocks you    | Blocks you       | **Concurrent**        |
| Best for              | Heavy refactor| VS Code lovers   | **Daily ops & mobile**|

---

## Tips for great mobile asks

Bad: "תקן את זה"
Good: "תוסיף לדף תלמידים אפשרות לסנן לפי מחזור"

Be specific:
- which page / file (or "I'll let you find it")
- which behavior (current vs desired)
- if it's a new feature: at least one example

Claude is happy to ask you clarifying questions before starting work.
