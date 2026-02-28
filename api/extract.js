import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// For Vercel, yt-dlp needs to be installed via a layer or custom build
// Using yt-dlp binary path from environment or default
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

/**
 * Gets all available formats as JSON
 */
async function getAllFormats(url) {
    try {
        const { stdout } = await execAsync(`"${YTDLP_PATH}" -j "${url}"`);
        return JSON.parse(stdout);
    } catch (error) {
        throw new Error(`Failed to extract info: ${error.message}`);
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const info = await getAllFormats(url);
        const platform = info.extractor_key || '';
        console.log(`Extracted info for ${url}. Platform: ${platform}`);

        // Normalize the response
        const normalizedInfo = {
            title: info.title || info.description || 'Social Media Content',
            thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
            duration: info.duration,
            uploader: info.uploader || info.uploader_id,
            url: info.url,
            platform: platform,
            formats: []
        };

        const platformLower = platform.toLowerCase();
        const isTikTok = platformLower === 'tiktok';
        const isYouTube = platformLower === 'youtube';
        const apiBaseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : (req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : 'http://localhost:5000');

        if (info.formats) {
            console.log(`Processing ${info.formats.length} formats for ${platform}...`);
            
            normalizedInfo.formats = info.formats
                .filter(f => {
                    if (!f.url) return false;

                    const hasAudio = f.acodec && f.acodec !== 'none';
                    const hasVideo = f.vcodec && f.vcodec !== 'none';

                    if (isYouTube) {
                        return (hasAudio && hasVideo) || (hasVideo && !hasAudio && f.ext === 'mp4');
                    } else if (isTikTok) {
                        return hasVideo || f.ext === 'mp4';
                    }
                    return (f.ext === 'mp4' || f.vcodec !== 'none');
                })
                .map(f => {
                    const isCombined = f.acodec !== 'none' && f.vcodec !== 'none';
                    const isVideoOnly = f.vcodec !== 'none' && f.acodec === 'none';
                    
                    let downloadUrl;
                    if (isTikTok) {
                        const streamParams = new URLSearchParams({
                            url: url,
                            format: f.format_id || 'best',
                            filename: `${normalizedInfo.title}.${f.ext}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/[^\x00-\x7F]/g, '')
                        });
                        downloadUrl = `${apiBaseUrl}/api/stream?${streamParams.toString()}`;
                    } else {
                        const proxyParams = new URLSearchParams({
                            url: f.url,
                            platform: platform,
                            ua: f.http_headers?.['User-Agent'] || '',
                            cookies: f.cookies || '',
                            filename: `${normalizedInfo.title}.${f.ext}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
                        });
                        downloadUrl = `${apiBaseUrl}/api/proxy?${proxyParams.toString()}`;
                    }

                    const height = f.height || 0;
                    const resolution = f.resolution || `${f.width}x${f.height}` || '';
                    let qualityLabel = f.format_note || resolution;
                    
                    if (height >= 2160) qualityLabel = '4K (2160p)';
                    else if (height >= 1440) qualityLabel = '1440p';
                    else if (height >= 1080) qualityLabel = '1080p';
                    else if (height >= 720) qualityLabel = '720p (HD)';
                    else if (height >= 480) qualityLabel = '480p';
                    else if (height >= 360) qualityLabel = '360p';
                    
                    return {
                        url: downloadUrl,
                        ext: f.ext,
                        note: qualityLabel,
                        vcodec: f.vcodec,
                        acodec: f.acodec,
                        isCombined: isCombined,
                        isVideoOnly: isVideoOnly,
                        height: height,
                        resolution: resolution,
                        filesize: f.filesize || f.filesize_approx,
                        formatId: f.format_id
                    };
                })
                .sort((a, b) => {
                    if (b.height !== a.height) return b.height - a.height;
                    return (b.isCombined ? 1 : 0) - (a.isCombined ? 1 : 0);
                });
            
            // For YouTube, add merged format options
            if (isYouTube) {
                const videoOnlyFormats = normalizedInfo.formats.filter(f => f.isVideoOnly && f.formatId);
                const mergedFormats = videoOnlyFormats.map(f => {
                    const mergeFormat = `${f.formatId}+bestaudio`;
                    const streamParams = new URLSearchParams({
                        url: url,
                        format: mergeFormat,
                        filename: `${normalizedInfo.title}_${f.note}.mp4`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/[^\x00-\x7F]/g, '')
                    });
                    
                    return {
                        url: `${apiBaseUrl}/api/stream?${streamParams.toString()}`,
                        ext: 'mp4',
                        note: f.note,
                        vcodec: f.vcodec,
                        acodec: 'merged',
                        isCombined: true,
                        isMerged: true,
                        isVideoOnly: false,
                        height: f.height,
                        resolution: f.resolution,
                        filesize: null
                    };
                });
                
                normalizedInfo.formats = [...mergedFormats, ...normalizedInfo.formats];
            }
        }

        if (normalizedInfo.formats.length === 0 && info.url) {
            const proxyParams = new URLSearchParams({
                url: info.url,
                platform: platform,
                filename: `${normalizedInfo.title}.${info.ext || 'mp4'}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
            });
            normalizedInfo.formats.push({
                url: `${apiBaseUrl}/api/proxy?${proxyParams.toString()}`,
                ext: info.ext || 'mp4',
                note: 'Direct Download'
            });
        }

        console.log(`Returning ${normalizedInfo.formats.length} formats to frontend.`);
        res.status(200).json(normalizedInfo);
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ error: 'Failed to extract media information. Please check the URL and try again.' });
    }
}
