# Cloud Setup - מדריך פר-פרויקט

מדריך מדויק לכל פרויקט: איפה לשים כל סוד, איזה לינקים ללחוץ.

## עקרון יסוד

| סוג | איפה | דוגמאות |
|---|---|---|
| 🔒 **סודות אמיתיים** | GitHub repo → Settings → Secrets → Codespaces | DB password, service_role keys, AUTH_SECRET, API keys |
| 🌐 **ערכים ציבוריים** | claude.ai/code → Customize → Environment | NODE_ENV, public URLs, anon/publishable keys, ID numbers |

**למה?** סודות בקוד-ספייסס secrets **מוצפנים בצד GitHub** ולא נחשפים בלוגים. ה-Environment של Claude Code Web מציג את הערכים גלויים למי שיש לו גישה.

---

## 📋 לכל פרויקט - 5 שלבים

לכל פרויקט שתרצה לעבוד עליו מהענן/מובייל:

1. **GitHub repo settings** - עבור ל-`https://github.com/<owner>/<repo>/settings/secrets/codespaces`
2. הוסף את כל ה-🔒 בלחיצה על "New repository secret"
3. **claude.ai/code** - Customize → New environment בשם הפרויקט
4. הדבק את ה-🌐 בלבד בתיבת Environment variables
5. שמור → התחל סשן עם ה-environment הזה + הרפו

---

## 🟢 yeshiva-app (ישיבת מיר)

**Repo:** `israelgr4-debug/yeshiva-app`
**Codespaces secrets:** https://github.com/israelgr4-debug/yeshiva-app/settings/secrets/codespaces

### 🔒 GitHub Codespaces Secrets
```
SUPABASE_SERVICE_ROLE_KEY=<מ-.env.local - מתחיל ב-sb_secret_>
NEDARIM_API_PASSWORD=<מ-.env.local>
```

### 🌐 claude.ai/code Environment
```
NEXT_PUBLIC_SUPABASE_URL=<מ-.env.local - https://...supabase.co>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<מ-.env.local - מתחיל ב-sb_publishable_>
NEDARIM_MOSAD_ID=<מ-.env.local>
NEDARIM_WEBHOOK_SKIP_IP_CHECK=false
```

---

## 🟢 chesed (עושה חסד)

**Repo:** `israelgr4-debug/chesed`
**Codespaces secrets:** https://github.com/israelgr4-debug/chesed/settings/secrets/codespaces

### 🔒 GitHub Codespaces Secrets
```
DATABASE_URL=<Neon connection string with password>
AUTH_SECRET=<לפענח מ-.env.local>
AUTH_GOOGLE_SECRET=<לפענח מ-.env.local>
BACKUP_ENCRYPTION_KEY=<לפענח מ-.env.local>
NEDARIM_API_PASSWORD=<לפענח מ-.env.local>
```

### 🌐 claude.ai/code Environment
```
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=<העתק מ-.env.local>
NEDARIM_MOSAD_ID=<העתק מ-.env.local>
NODE_ENV=development
```

> אם יש קבצים נוספים לא רשומים: `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `STRIPE_*` → כולם 🔒 לסיקרטים.

---

## 🟢 yeshiva-budget (תקציב בית שמעיה)

**Repo:** `israelgr4-debug/yeshiva-budget`
**Codespaces secrets:** https://github.com/israelgr4-debug/yeshiva-budget/settings/secrets/codespaces

### 🔒 GitHub Codespaces Secrets
```
(אם משתמשים ב-service_role של Supabase כאן - תוסיף SUPABASE_SERVICE_ROLE_KEY)
```

### 🌐 claude.ai/code Environment
```
NEXT_PUBLIC_SITE_URL=<מ-.env.local>
NEXT_PUBLIC_SUPABASE_URL=<מ-.env.local>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<מ-.env.local>
NODE_ENV=development
```

---

## 🟢 art-gallery (גלריית Etty Barclay)

**Repo:** `israelgr4-debug/etty-barclay-gallery`
**Codespaces secrets:** https://github.com/israelgr4-debug/etty-barclay-gallery/settings/secrets/codespaces

### 🔒 GitHub Codespaces Secrets
```
ADMIN_PASSWORD_HASH=<מ-.env.local>
CLOUDINARY_API_SECRET=<מ-.env.local>
POSTGRES_PASSWORD=<מ-.env.local>
POSTGRES_URL=<מ-.env.local>
POSTGRES_URL_NON_POOLING=<מ-.env.local>
JWT_SECRET=<מ-.env.local>
```

### 🌐 claude.ai/code Environment
```
CLOUDINARY_API_KEY=<מ-.env.local>
CLOUDINARY_CLOUD_NAME=<מ-.env.local>
POSTGRES_DATABASE=<מ-.env.local>
POSTGRES_HOST=<מ-.env.local>
POSTGRES_USER=<מ-.env.local>
NODE_ENV=development
```

---

## 🟢 israel-invest

**Repo:** `israelgr4-debug/israel-invest`
**Codespaces secrets:** https://github.com/israelgr4-debug/israel-invest/settings/secrets/codespaces

### 🔒 GitHub Codespaces Secrets
```
DATABASE_URL=<מ-.env.local>
AUTH_SECRET=<מ-.env.local>
ALPHA_VANTAGE_API_KEY=<מ-.env.local>
ANTHROPIC_API_KEY=<מ-.env.local>
FINNHUB_API_KEY=<מ-.env.local>
CRON_SECRET=<מ-.env.local>
```

### 🌐 claude.ai/code Environment
```
AUTH_URL=<מ-.env.local>
ADMIN_EMAIL=<מ-.env.local>
NODE_ENV=development
```

---

## 🟡 ichud-drones (איחוד דרונים)

**Repo:** `israelgr4-debug/ichud-drones`
**Codespaces secrets:** https://github.com/israelgr4-debug/ichud-drones/settings/secrets/codespaces

אין `.env.local`. אם בעתיד תוסיף API keys (Mapbox, Firebase, וכו') → לשם Codespaces.
בינתיים אין שום דבר להגדיר. ה-environment ב-claude.ai/code יכול להיות ריק או רק `NODE_ENV=development`.

---

## 🟡 masav-payments (חשבון של chgr5867)

**Repo:** `chgr5867/masav-payments`
**Codespaces secrets:** https://github.com/chgr5867/masav-payments/settings/secrets/codespaces

> ⚠️ הרפו לא תחת israelgr4-debug. וודא שיש לך הרשאות גישה.

אין `.env.local`. אותה הערה כמו ichud-drones - אם תוסיף סודות בעתיד.

---

## איך לעבוד אחרי ההגדרה

לכל סשן חדש:

1. claude.ai/code
2. **+ New session**
3. בחירה:
   - **Repository**: בחר את הרפו (זה יביא אוטומטית את ה-Codespaces secrets שלו)
   - **Environment**: בחר את ה-environment המתאים (זה יוסיף את ה-public vars)
   - **Branch**: בד"כ `main`
4. שאל שאלה - אני אקרא CLAUDE.md אוטומטית ויודע מה הפרויקט עושה

---

## טיפים

- **שמות עקביים** ל-environment: `yeshiva` / `chesed` / `budget` / `gallery` / `invest`
- **לא לשתף environment** בין פרויקטים - כל פרויקט נקי
- **אם פרויקט משתמש בכמה DB-ים** (dev + prod) - שני environments: `chesed-dev` + `chesed-prod`
- **לא להעלות `.env.local` לגיט** (`.gitignore` כבר מטפל)
- **לבדוק תקופתית** ב-GitHub → Insights → Security את היומן

---

## אם משהו דולף בעתיד

תהליך מהיר לסיבוב סודות (ראינו עכשיו עם yeshiva):
1. צור מפתח חדש בשירות (Supabase / DB / API)
2. עדכן `.env.local` מקומי
3. עדכן Vercel env vars
4. עדכן Codespaces secrets
5. Redeploy
6. ודא שהאתר עובד עם החדש
7. בטל את הישן
8. ודא שהישן באמת מוחזר 401
