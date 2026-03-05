import YTDlpWrapDefault from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapDefault.default || YTDlpWrapDefault;
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

const YTDLP_BIN_PATH = path.join('/tmp', 'yt-dlp');

async function ensureYtdlp() {
    if (fs.existsSync(YTDLP_BIN_PATH)) {
        return new YTDlpWrap(YTDLP_BIN_PATH);
    }
    const bundledPath = path.join(process.cwd(), 'api', 'bin', 'yt-dlp');
    if (fs.existsSync(bundledPath)) {
        try {
            fs.copyFileSync(bundledPath, YTDLP_BIN_PATH);
            fs.chmodSync(YTDLP_BIN_PATH, 0o755);
            return new YTDlpWrap(YTDLP_BIN_PATH);
        } catch (e) {
            console.warn('Failed to copy bundled binary');
        }
    }
    await YTDlpWrap.downloadFromGithub(YTDLP_BIN_PATH);
    fs.chmodSync(YTDLP_BIN_PATH, 0o755);
    return new YTDlpWrap(YTDLP_BIN_PATH);
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).send('Method not allowed');
    }

    const { url, format, filename } = req.query;

    if (!url) {
        return res.status(400).send('URL is required');
    }

    try {
        console.log(`Streaming download via yt-dlp: ${filename || 'file'}`);

        const safeFilename = (filename || `download_${Date.now()}.mp4`)
            .replace(/[^\x00-\x7F]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_');

        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Build yt-dlp arguments
        const args = ['-o', '-'];
        if (format) {
            args.push('-f', format);
        }

        // Add ffmpeg location if available
        if (ffmpegPath) {
            args.push('--ffmpeg-location', ffmpegPath);
        }

        // Execute yt-dlp
        const ytDlpWrap = await ensureYtdlp();
        const ytDlpStream = ytDlpWrap.execStream([url, ...args]);

        ytDlpStream.pipe(res);

        ytDlpStream.on('error', (error) => {
            console.error('yt-dlp stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Failed to download video');
            }
        });

        req.on('close', () => {
            ytDlpStream.destroy();
        });

    } catch (error) {
        console.error('Stream error:', error.message);
        if (!res.headersSent) {
            res.status(500).send(`Failed to stream download: ${error.message}`);
        }
    }
}

// Increase timeout for video downloads (max 5 minutes)
export const config = {
    maxDuration: 300,
};
