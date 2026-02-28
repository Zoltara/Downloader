# Quick Vercel Deployment Guide

## Step-by-Step Instructions

### 1. Prepare Your Repository

Make sure all changes are committed to Git:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New" → "Project"
3. Select your repository
4. Vercel will auto-detect the framework (Vite)

### 3. Configure Build Settings

In the import screen:

**Framework Preset:** Vite

**Build & Development Settings:**
- **Install Command:**
  ```bash
  npm install && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /tmp/yt-dlp && chmod a+rx /tmp/yt-dlp
  ```
- **Build Command:** `npm run build` (default)
- **Output Directory:** `dist` (default)

### 4. Set Environment Variables

Add this environment variable:

**Key:** `YTDLP_PATH`
**Value:** `/tmp/yt-dlp`

### 5. Deploy

Click "Deploy" and wait for the build to complete (2-3 minutes).

### 6. Test Your Deployment

1. Open your Vercel URL (e.g., `your-app.vercel.app`)
2. Try downloading a YouTube video
3. Try different quality options

## Important Notes

### Known Limitations on Vercel

1. **Timeout Limits**: Serverless functions have a 10-second timeout on free tier, 60 seconds on Pro tier. Large files may timeout.

2. **Memory Limits**: Serverless functions have 1GB memory limit, which may affect 4K downloads.

3. **Deployment Region**: Choose a region close to your users for better performance.

### Troubleshooting on Vercel

**yt-dlp not found:**
- Check Vercel logs: Settings → Logs
- Verify the install command ran successfully
- Ensure `YTDLP_PATH` environment variable is set

**Function timeout:**
- Upgrade to Pro tier for longer timeouts
- Or implement a queue system for large files

**Build fails:**
- Check build logs for errors
- Ensure all dependencies are in `package.json`
- Try redeploying

### Alternative Deployment Options

If Vercel doesn't work well for your use case:

**Railway.app** - Better for long-running processes
**Render.com** - Includes native support for Docker
**DigitalOcean App Platform** - More control over environment
**AWS Lambda** - More configuration options

## Post-Deployment Optimizations

1. **Custom Domain**: Add your domain in Vercel settings
2. **Analytics**: Enable Vercel Analytics
3. **Caching**: Configure caching headers for static assets
4. **Monitoring**: Set up error tracking (Sentry, etc.)

## Need Help?

Check the full README.md for more detailed information and troubleshooting steps.
