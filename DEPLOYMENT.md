# Deployment Guide - Yeshiva Management System

## Prerequisites

1. Supabase account (https://supabase.com)
2. Node.js 18+ installed locally
3. Git installed
4. Vercel account (recommended for Next.js hosting) OR any Node.js hosting

## Step 1: Set up Supabase Database

1. Create a new Supabase project at https://app.supabase.com
2. Copy the project URL and anon key from Settings > API
3. In the SQL Editor, run all the SQL commands from `DATABASE_SCHEMA.md`
4. Verify the tables are created by checking the Tables view

## Step 2: Prepare Environment Variables

1. Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```

2. Fill in the values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Local Testing

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open http://localhost:3000 in your browser
4. Test all functionality with the sample data

## Step 4: Build for Production

```bash
npm run build
```

This creates an optimized build in the `.next` directory.

## Step 5: Deploy to Vercel (Recommended)

### Option A: Using Vercel Dashboard

1. Push your code to GitHub
2. Go to https://vercel.com/new
3. Import your GitHub repository
4. Set the following environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click "Deploy"

### Option B: Using Vercel CLI

```bash
npm install -g vercel
vercel
```

Then fill in the prompts and add environment variables.

## Step 6: Deploy to Other Platforms

### Docker Deployment

Create a `Dockerfile` in the root directory:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t yeshiva-app .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL="..." -e NEXT_PUBLIC_SUPABASE_ANON_KEY="..." yeshiva-app
```

### AWS EC2

1. Launch an Ubuntu 20.04 LTS instance
2. SSH into the instance
3. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

4. Clone the repository:
```bash
git clone <your-repo> /var/www/yeshiva-app
cd /var/www/yeshiva-app
```

5. Install and build:
```bash
npm install
npm run build
```

6. Use PM2 to keep the app running:
```bash
npm install -g pm2
pm2 start npm --name "yeshiva-app" -- start
pm2 startup
pm2 save
```

### Heroku (Legacy - Not Recommended)

```bash
heroku login
heroku create your-app-name
heroku config:set NEXT_PUBLIC_SUPABASE_URL=...
heroku config:set NEXT_PUBLIC_SUPABASE_ANON_KEY=...
git push heroku main
```

## Step 7: Domain Setup

If using Vercel:
1. Go to Project Settings > Domains
2. Add your custom domain
3. Update DNS records according to Vercel's instructions

If using your own server:
1. Set up a reverse proxy with Nginx
2. Obtain SSL certificates (Let's Encrypt)
3. Configure DNS to point to your server IP

## Step 8: Database Backup Strategy

### Supabase Backups
- Supabase automatically backs up your database daily
- Access backups in Project Settings > Backups
- Set up point-in-time recovery if needed

### Manual Exports
```bash
# Export data using Supabase CLI
supabase db dump > backup.sql

# Or use pgdump directly
pg_dump postgresql://user:password@host/database > backup.sql
```

## Step 9: Monitoring & Maintenance

1. Set up monitoring with Sentry:
```bash
npm install @sentry/nextjs
```

2. Configure Sentry in `next.config.js`

3. Monitor Supabase database performance:
   - Check Database > Logs in Supabase dashboard
   - Monitor query performance
   - Check storage usage

## Security Checklist

- [ ] Enable Row Level Security (RLS) on all tables
- [ ] Use restricted Supabase API key for frontend (anon key)
- [ ] Never commit `.env.local` to git
- [ ] Enable HTTPS for all connections
- [ ] Set up rate limiting on API calls
- [ ] Regular security audits of database permissions
- [ ] Backup sensitive data regularly
- [ ] Update dependencies regularly (`npm audit fix`)

## Scaling Considerations

1. **Database**: Monitor query performance, add indexes
2. **Static Assets**: Use Supabase Storage or CDN (Cloudflare)
3. **Caching**: Implement ISR (Incremental Static Regeneration)
4. **Load Balancing**: Use load balancer if multiple instances

## Troubleshooting

### Connection Issues
```
Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are correct
Verify Supabase project is active in dashboard
Check network connectivity
```

### Build Errors
```
Delete node_modules and package-lock.json
Run npm install again
Check Node version matches requirements
```

### Performance Issues
```
Run npm run build to test production build
Check Supabase query performance logs
Monitor Next.js analytics
Profile with DevTools
```

## Support Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
