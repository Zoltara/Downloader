import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

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
        const args = [url, '-o', '-'];
        if (format) {
            args.push('-f', format);
        }
        
        // Add ffmpeg location if available
        if (ffmpegPath) {
            args.push('--ffmpeg-location', ffmpegPath);
        }
        
        const ytdlpProcess = spawn(YTDLP_PATH, args);
        
        ytdlpProcess.stdout.pipe(res);
        
        ytdlpProcess.stderr.on('data', (data) => {
            console.error(`yt-dlp stderr: ${data}`);
        });
        
        ytdlpProcess.on('error', (error) => {
            console.error('yt-dlp process error:', error);
            if (!res.headersSent) {
                res.status(500).send('Failed to download video');
            }
        });
        
        ytdlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp process exited with code ${code}`);
            }
        });
        
        req.on('close', () => {
            ytdlpProcess.kill();
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
