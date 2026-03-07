import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const YTDlpWrapModule = require('yt-dlp-wrap');
const YTDlpWrap =
    YTDlpWrapModule?.default ||
    YTDlpWrapModule?.YTDlpWrap ||
    YTDlpWrapModule;
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const TMP_BIN_PATH = path.join('/tmp', 'yt-dlp');

function resolveBundledPath() {
    const candidates = [
        path.join(process.cwd(), 'api', 'bin', 'yt-dlp'),
        path.join(process.cwd(), 'bin', 'yt-dlp')
    ];

    return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolvePreferredYtdlpPath() {
    const envPath = process.env.YTDLP_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    if (fs.existsSync(TMP_BIN_PATH)) {
        return TMP_BIN_PATH;
    }

    return null;
}

async function downloadBinary(url, dest) {
    const https = await import('https');
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadBinary(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                fs.chmodSync(dest, 0o755);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function ensureYtdlp() {
    const preferredPath = resolvePreferredYtdlpPath();
    if (preferredPath) {
        return new YTDlpWrap(preferredPath);
    }

    const bundledPath = resolveBundledPath();
    if (bundledPath) {
        try {
            fs.copyFileSync(bundledPath, TMP_BIN_PATH);
            fs.chmodSync(TMP_BIN_PATH, 0o755);
            return new YTDlpWrap(TMP_BIN_PATH);
        } catch (e) { }
    }

    console.log('Downloading standalone binary...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    await downloadBinary(url, TMP_BIN_PATH);
    return new YTDlpWrap(TMP_BIN_PATH);
}

const YOUTUBE_RE = /youtube\.com|youtu\.be/i;
const INSTAGRAM_RE = /instagram\.com/i;
const COOKIE_PATH = path.join('/tmp', 'yt-cookies.txt');
const IG_COOKIE_PATH = path.join('/tmp', 'ig-cookies.txt');

// ─── YouTube fallback: Cobalt API ─────────────────────────────────────────
// When yt-dlp is blocked by YouTube bot detection on Vercel datacenter IPs,
// we fall back to Cobalt — an open-source media downloader that handles
// YouTube through its own infrastructure and returns signed tunnel URLs.
// Cobalt URLs are NOT raw Google CDN URLs, so they work from any IP.
// https://github.com/imputnet/cobalt

const COBALT_ENDPOINTS = [
    'https://api.cobalt.tools',
    'https://cobalt.api.timelessnesses.me',
    'https://cobalt-api.ayo.tf',
    'https://cobalt.floofy.dev',
];

function extractYouTubeId(url) {
    const match = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

const HEIGHT_LABELS = {
    2160: '4K (2160p)', 1440: '1440p', 1080: '1080p',
    720: '720p (HD)', 480: '480p', 360: '360p', 240: '240p', 144: '144p',
};
const heightLabel = (h) => HEIGHT_LABELS[h] || (h ? `${h}p` : 'Best Quality');

async function cobaltPost(endpoint, body) {
    const resp = await axios.post(`${endpoint}/`, body, {
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 15000,
        validateStatus: (s) => s === 200,
    });
    const d = resp.data;
    if (d.status === 'error') throw new Error(d.error?.code || 'Cobalt error');
    if (!['tunnel', 'redirect', 'stream'].includes(d.status)) throw new Error(`Unexpected cobalt status: ${d.status}`);
    if (!d.url) throw new Error('No URL in Cobalt response');
    return d;
}

async function cobaltRequest(body) {
    let lastError;
    for (const endpoint of COBALT_ENDPOINTS) {
        try {
            const result = await cobaltPost(endpoint, body);
            console.log(`Cobalt success via ${endpoint}`);
            return result;
        } catch (e) {
            console.warn(`Cobalt ${endpoint} failed: ${e.message}`);
            lastError = e;
        }
    }
    throw lastError || new Error('All Cobalt endpoints failed');
}

async function fetchYouTubeFallback(videoId, originalUrl) {
    // Fire all quality requests + audio in parallel for multiple download choices
    const qualities = ['1080', '720', '480', '360'];
    const tasks = [
        ...qualities.map(q =>
            cobaltRequest({ url: originalUrl, videoQuality: q, downloadMode: 'auto', filenameStyle: 'pretty' })
                .then(d => ({ type: 'video', quality: q, data: d }))
                .catch(() => null)
        ),
        cobaltRequest({ url: originalUrl, downloadMode: 'audio', audioFormat: 'mp3', filenameStyle: 'pretty' })
            .then(d => ({ type: 'audio', data: d }))
            .catch(() => null),
    ];

    const results = (await Promise.all(tasks)).filter(Boolean);
    if (results.length === 0) throw new Error('All Cobalt endpoints failed for all qualities');

    let title = 'YouTube Video';
    const formats = [];
    const seenUrls = new Set();

    for (const r of results) {
        const d = r.data;
        if (!d?.url || seenUrls.has(d.url)) continue;
        seenUrls.add(d.url);

        // Cobalt filenames look like "Title - 1080p - cobalt.mp4"
        if (d.filename && title === 'YouTube Video') {
            title = d.filename
                .replace(/\s*[-_]\s*\d+p.*$/i, '')
                .replace(/\s*[-_]\s*cobalt.*$/i, '')
                .replace(/\.[^.]+$/, '')
                .trim() || title;
        }

        if (r.type === 'video') {
            const h = parseInt(r.quality, 10);
            formats.push({
                url: d.url,   // cobalt tunnel URL — works from any IP, no proxy needed
                ext: 'mp4',
                note: heightLabel(h),
                vcodec: 'avc1',
                acodec: 'mp4a',
                isCombined: true,
                isVideoOnly: false,
                height: h,
                resolution: `${r.quality}p`,
                filesize: null,
                formatId: null,
            });
        } else {
            formats.push({
                url: d.url,
                ext: 'mp3',
                note: 'Audio Only (MP3)',
                vcodec: 'none',
                acodec: 'mp3',
                isCombined: false,
                isVideoOnly: false,
                height: 0,
                resolution: '',
                filesize: null,
                formatId: null,
            });
        }
    }

    if (formats.length === 0) throw new Error('Cobalt returned no usable formats');
    formats.sort((a, b) => b.height - a.height);

    return {
        title,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        duration: null,
        uploader: null,
        url: originalUrl,
        platform: 'Youtube',
        formats,
        _source: 'cobalt',
    };
}

// ─── end YouTube fallback ──────────────────────────────────────────────────

function buildYtdlpArgs(url) {
    const args = ['--dump-json', '--no-playlist'];

    // mweb is the most resilient client for serverless without cookies.
    // ios/android are kept as fallbacks. tv_embedded was removed in newer yt-dlp.
    if (YOUTUBE_RE.test(url)) {
        args.push('--extractor-args', 'youtube:player_client=mweb,ios,android');
    }

    // Optional: pass YouTube cookies via YOUTUBE_COOKIES env var
    // Value must be a base64-encoded Netscape-format cookie file.
    const cookiesB64 = process.env.YOUTUBE_COOKIES;
    if (cookiesB64) {
        if (!fs.existsSync(COOKIE_PATH)) {
            fs.writeFileSync(COOKIE_PATH, Buffer.from(cookiesB64, 'base64').toString('utf-8'));
        }
        args.push('--cookies', COOKIE_PATH);
    }

    // Optional: pass Instagram cookies via INSTAGRAM_COOKIES env var
    // Value must be a base64-encoded Netscape-format cookie file.
    const igCookiesB64 = process.env.INSTAGRAM_COOKIES;
    if (igCookiesB64 && INSTAGRAM_RE.test(url)) {
        if (!fs.existsSync(IG_COOKIE_PATH)) {
            fs.writeFileSync(IG_COOKIE_PATH, Buffer.from(igCookiesB64, 'base64').toString('utf-8'));
        }
        args.push('--cookies', IG_COOKIE_PATH);
    }

    return args;
}

/**
 * Gets all available formats as JSON
 */
async function getAllFormats(url) {
    const ytDlpWrap = await ensureYtdlp();
    try {
        const args = buildYtdlpArgs(url);
        const output = await ytDlpWrap.execPromise([url, ...args]);
        return JSON.parse(output);
    } catch (error) {
        throw new Error(`yt-dlp error: ${error.message}`);
    }
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }

    if (!req.body && req.readable) {
        return await new Promise((resolve) => {
            let raw = '';
            req.on('data', (chunk) => {
                raw += chunk;
            });
            req.on('end', () => {
                try {
                    resolve(raw ? JSON.parse(raw) : {});
                } catch {
                    resolve({});
                }
            });
            req.on('error', () => resolve({}));
        });
    }

    return {};
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

    const body = await readJsonBody(req);
    const { url } = body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['host'];
    const apiBaseUrl = `${protocol}://${host}`;

    try {
        let info;
        try {
            info = await getAllFormats(url);
        } catch (ytdlpError) {
            // YouTube bot detection is common on datacenter IPs. Fall back to
            // the Piped API which fetches stream URLs server-side from residential infrastructure.
            if (YOUTUBE_RE.test(url)) {
                const videoId = extractYouTubeId(url);
                if (videoId) {
                    console.log(`yt-dlp failed for YouTube (${ytdlpError.message.slice(0, 80)}). Trying Piped/Invidious fallback...`);
                    try {
                        const result = await fetchYouTubeFallback(videoId, url);
                        console.log(`YouTube fallback succeeded (source: ${result._source}). ${result.formats.length} formats returned.`);
                        return res.status(200).json(result);
                    } catch (fallbackError) {
                        console.error('All YouTube fallbacks failed:', fallbackError.message);
                    }
                }
            }
            throw ytdlpError;
        }

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

        // apiBaseUrl is computed above (before the try block)

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
        res.status(500).json({
            error: 'Failed to extract media information.',
            details: error.message,
            stack: error.stack
        });
    }
}

// Increase timeout for info extraction (max 5 minutes)
export const config = {
    maxDuration: 300,
};
