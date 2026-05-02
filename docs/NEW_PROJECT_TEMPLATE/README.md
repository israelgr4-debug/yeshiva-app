# New Project Cloud-Workflow Template

Copy these files to the root of any other repo to make it ready for
Claude Code on the Web.

## Steps

```bash
# 1. From your other project's root:
cp -r /path/to/yeshiva-app/docs/NEW_PROJECT_TEMPLATE/.devcontainer .
cp /path/to/yeshiva-app/docs/NEW_PROJECT_TEMPLATE/CLAUDE.md .

# 2. Edit BOTH files - fill in project-specific info
#    Or just commit them as-is and ask Claude:
#    "Read this repo and rewrite CLAUDE.md and devcontainer.json
#     to match the actual stack here"

# 3. Commit and push
git add .devcontainer CLAUDE.md
git commit -m "Add cloud-workflow files (Claude Code on the Web)"
git push

# 4. Connect at claude.ai/code → choose this repo

# 5. Add the project's env vars in Claude Code on the Web settings
```

## Then from any device

Open claude.ai/code → choose project → ask away.
