# Social Media Downloader

A modern web application to download videos from YouTube, TikTok, Instagram, and Facebook in various quality options.
A mobile-friendly web application for downloading content from popular social media platforms.

## Features
- **Instagram**: Download posts, reels, and IGTV videos      (https://snapinsta.to/en)
- **Facebook**:  Download videos from Facebook               (https://fdown.net/)
- **TikTok**:    Download TikTok videos                      (https://snaptik.app/en2)
- **YouTube**:   Download MP3/MP4 audio from YouTube videos  (https://ytmp3.cc/PVvQ/)

- 📹 **Multi-Platform Support**: YouTube, TikTok, Instagram, Facebook
- 🎬 **High Quality Options**: Up to 4K for YouTube with audio merging
- 🎵 **Audio Merging**: Automatically merge high-quality video with audio
- 📱 **Mobile Friendly**: Progressive Web App (PWA) with home screen support
- 🚀 **Fast Downloads**: Server-side streaming for optimal performance

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Express.js / Vercel Serverless Functions
- **Video Processing**: yt-dlp + ffmpeg

## Local Development

### Prerequisites

- Node.js 18+ 
- npm or yarn
- yt-dlp ([installation guide](https://github.com/yt-dlp/yt-dlp#installation))
- ffmpeg ([installation guide](https://ffmpeg.org/download.html))

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd downloader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install yt-dlp** (if not already installed)
   
   **Windows:**
   ```powershell
   winget install yt-dlp
   ```
   
   **macOS:**
   ```bash
   brew install yt-dlp
   ```
   
   **Linux:**
   ```bash
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   ```

4. **Install ffmpeg** (if not already installed)
   
   **Windows:**
   ```powershell
   winget install --id=Gyan.FFmpeg -e
   ```
   
   **macOS:**
   ```bash
   brew install ffmpeg
   ```
   
   **Linux:**
   ```bash
   sudo apt update && sudo apt install ffmpeg
   ```

5. **Create environment file**
   ```bash
   cp .env.example .env
   ```

6. **Run the development servers**
   
   In two separate terminals:
   ```bash
   # Terminal 1 - Frontend
   npm run dev
   
   # Terminal 2 - Backend
   npm run dev:server
   ```

7. **Open your browser**
   Navigate to `http://localhost:5173`

## Deployment to Vercel

### Prerequisites for Vercel Deployment

Vercel doesn't include yt-dlp and ffmpeg by default. You need to add them:

### Option 1: Using Vercel Build Step (Recommended)

1. **Fork/Clone this repository to your GitHub account**

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect the Vite framework

3. **Build settings**

   Keep Vercel defaults (or set these explicitly):
   ```bash
   Install Command: npm install
   Build Command: npm run vercel-build
   Output Directory: dist
   ```

   `npm run vercel-build` runs `npm run prepare:ytdlp` and bundles `yt-dlp` into `api/bin` before building the frontend.

4. **Set Environment Variables**
   
   In Vercel project settings → Environment Variables, add:
   ```
   YTDLP_PATH=/var/task/api/bin/yt-dlp
   ```

   Do not set `VITE_API_URL` in production. The frontend auto-uses same-origin in production, so API calls always target your deployed domain.

5. **Deploy**
   - Click "Deploy"
   - Your app will be live at `your-app.vercel.app`

### Option 2: Using Docker (Advanced)

For better control, you can use a custom Docker image:

1. Create `Dockerfile`:
   ```dockerfile
   FROM node:18-alpine
   
   RUN apk add --no-cache python3 py3-pip ffmpeg
   RUN pip3 install yt-dlp
   
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   RUN npm run build
   
   CMD ["npm", "run", "preview"]
   ```

2. Deploy using Vercel's Docker support

### Post-Deployment

After deployment, test by:
1. Opening your Vercel URL
2. Trying to download a YouTube video
3. Checking Vercel logs if issues occur

## Project Structure

```
downloader/
├── api/                    # Vercel serverless functions
│   ├── extract.js         # Extract video info
│   ├── proxy.js           # Proxy video downloads
│   └── stream.js          # Stream downloads with yt-dlp
├── public/                # Static assets
│   ├── download-icon.svg  # App icon
│   └── manifest.json      # PWA manifest
├── server/                # Local development server
│   ├── downloader.js      # yt-dlp wrapper
│   └── server.js          # Express server
├── src/                   # React frontend
│   ├── App.jsx            # Main app component
│   ├── index.css          # Styles
│   └── main.jsx           # Entry point
├── .env.example           # Environment variables template
├── package.json           # Dependencies
├── vercel.json            # Vercel configuration
└── vite.config.js         # Vite configuration
```

## Environment Variables

- `VITE_API_URL`: Optional for local development only
- `YTDLP_PATH`: Optional override path for yt-dlp binary on serverless runtime

## Troubleshooting

### yt-dlp not found
- Ensure yt-dlp is installed and in PATH
- For Vercel, check the `YTDLP_PATH` environment variable

### ffmpeg not found
- Install ffmpeg from [ffmpeg.org](https://ffmpeg.org/)
- Restart your terminal after installation

### CORS errors
- Check that API_URL in `.env` matches your backend URL
- Ensure the server is running

### Download fails with 403
- Some platforms have strict rate limiting
- Try using a different video URL
- Check if yt-dlp needs updating: `yt-dlp -U`

## License

MIT

## Credits

- Built with [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- Video downloading powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Video processing by [ffmpeg](https://ffmpeg.org/)
