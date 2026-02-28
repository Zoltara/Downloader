const express = require('express');
const cors = require('cors');
const { extractInfo, getAllFormats, streamDownload } = require('./downloader');
const app = express();
const PORT = process.env.PORT || 5000;

const axios = require('axios');

app.use(cors());
app.use(express.json());

// Main endpoint to extract media info
app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const info = await getAllFormats(url);
        const platform = info.extractor_key || '';
        console.log(`Extracted info for ${url}. Platform: ${platform}`);

        // Normalize the response for the frontend
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

        if (info.formats) {
            console.log(`Processing ${info.formats.length} formats for ${platform}...`);
            
            normalizedInfo.formats = info.formats
                .filter(f => {
                    if (!f.url) return false;

                    const hasAudio = f.acodec && f.acodec !== 'none';
                    const hasVideo = f.vcodec && f.vcodec !== 'none';

                    if (isYouTube) {
                        // For YouTube: Include combined formats (audio+video) AND high-quality video-only formats
                        // Video-only formats provide higher resolutions (720p, 1080p, 1440p, 4K)
                        return (hasAudio && hasVideo) || (hasVideo && !hasAudio && f.ext === 'mp4');
                    } else if (isTikTok) {
                        // For TikTok: Be more lenient, accept any format with video
                        return hasVideo || f.ext === 'mp4';
                    }
                    // For others, allow video+audio or just video
                    return (f.ext === 'mp4' || f.vcodec !== 'none');
                })
                .map(f => {
                    const isCombined = f.acodec !== 'none' && f.vcodec !== 'none';
                    const isVideoOnly = f.vcodec !== 'none' && f.acodec === 'none';
                    
                    let downloadUrl;
                    // TikTok requires server-side download via yt-dlp due to strict CDN restrictions
                    if (isTikTok) {
                        const streamParams = new URLSearchParams({
                            url: url,
                            format: f.format_id || 'best',
                            filename: `${normalizedInfo.title}.${f.ext}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/[^\x00-\x7F]/g, '')
                        });
                        downloadUrl = `http://localhost:5000/api/stream?${streamParams.toString()}`;
                    } else {
                        // Route others through proxy to force "Content-Disposition: attachment"
                        const proxyParams = new URLSearchParams({
                            url: f.url,
                            platform: platform,
                            ua: f.http_headers?.['User-Agent'] || '',
                            cookies: f.cookies || '',
                            filename: `${normalizedInfo.title}.${f.ext}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
                        });
                        downloadUrl = `http://localhost:5000/api/proxy?${proxyParams.toString()}`;
                    }

                    // Extract quality information
                    const height = f.height || 0;
                    const resolution = f.resolution || `${f.width}x${f.height}` || '';
                    let qualityLabel = f.format_note || resolution;
                    
                    // Add quality labels for common resolutions
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
                // Sort by quality: higher resolution first, then combined before video-only
                .sort((a, b) => {
                    // First sort by height (resolution)
                    if (b.height !== a.height) return b.height - a.height;
                    // If same height, combined formats first
                    return (b.isCombined ? 1 : 0) - (a.isCombined ? 1 : 0);
                });
            
            // For YouTube, add merged format options for video-only streams
            if (isYouTube) {
                const videoOnlyFormats = normalizedInfo.formats.filter(f => f.isVideoOnly && f.formatId);
                const mergedFormats = videoOnlyFormats.map(f => {
                    // Create a merged version: video_format_id+bestaudio
                    const mergeFormat = `${f.formatId}+bestaudio`;
                    const streamParams = new URLSearchParams({
                        url: url,
                        format: mergeFormat,
                        filename: `${normalizedInfo.title}_${f.note}.mp4`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/[^\x00-\x7F]/g, '')
                    });
                    
                    return {
                        url: `http://localhost:5000/api/stream?${streamParams.toString()}`,
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
                
                // Add merged formats at the beginning (highest quality with audio)
                normalizedInfo.formats = [...mergedFormats, ...normalizedInfo.formats];
            }
        }

        if (normalizedInfo.formats.length === 0 && info.url) {
            console.log("No matching formats found, using fallback info.url");
            const proxyParams = new URLSearchParams({
                url: info.url,
                platform: platform,
                filename: `${normalizedInfo.title}.${info.ext || 'mp4'}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
            });
            normalizedInfo.formats.push({
                url: `http://localhost:5000/api/proxy?${proxyParams.toString()}`,
                ext: info.ext || 'mp4',
                note: 'Direct Download'
            });
        }

        console.log(`Returning ${normalizedInfo.formats.length} formats to frontend.`);
        res.json(normalizedInfo);
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ error: 'Failed to extract media information. Please check the URL and try again.' });
    }
});

// Proxy endpoint to bypass "Access Denied" and force downloads
app.get('/api/proxy', async (req, res) => {
    const { url, platform, ua, cookies, filename } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const platformLower = platform?.toLowerCase();
        const isTikTok = platformLower === 'tiktok' || url.includes('tiktok');
        
        const headers = {
            'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Connection': 'keep-alive'
        };

        // Don't use Range headers for TikTok (causes 403)
        if (!isTikTok && req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        if (cookies) {
            headers['Cookie'] = cookies;
        }

        // Platform-specific headers
        if (isTikTok) {
            // TikTok requires very specific headers
            headers['Referer'] = 'https://www.tiktok.com/';
            headers['Origin'] = 'https://www.tiktok.com';
            headers['Sec-Fetch-Dest'] = 'video';
            headers['Sec-Fetch-Mode'] = 'no-cors';
            headers['Sec-Fetch-Site'] = 'same-site';
            headers['sec-ch-ua'] = '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"';
            headers['sec-ch-ua-mobile'] = '?0';
            headers['sec-ch-ua-platform'] = '"Windows"';
        } else if (platformLower === 'instagram' || url.includes('instagram.com')) {
            headers['Referer'] = 'https://www.instagram.com/';
        } else if (platformLower === 'facebook' || url.includes('facebook.com')) {
            headers['Referer'] = 'https://www.facebook.com/';
        }

        console.log(`Proxying download: ${filename || 'file'} (Platform: ${platform || 'unknown'})`);
        
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: headers,
            timeout: 60000, // 60s timeout for downloads
            maxRedirects: 5, // Follow redirects
            validateStatus: (status) => status < 400 // Accept all responses < 400
        });

        // Forced download header
        const safeFilename = (filename || `download_${Date.now()}.mp4`)
            .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

        // Force the browser to treat as an unknown binary file to trigger SAVE
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        console.error('URL:', url);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
        res.status(500).send(`Failed to proxy download: ${error.message}`);
    }
});

// Stream endpoint for TikTok and other platforms that need server-side download
app.get('/api/stream', async (req, res) => {
    const { url, format, filename } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        console.log(`Streaming download via yt-dlp: ${filename || 'file'}`);
        
        // Set headers for download
        const safeFilename = (filename || `download_${Date.now()}.mp4`)
            .replace(/[^\x00-\x7F]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_');
        
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Start yt-dlp process to download and stream
        const ytdlpProcess = streamDownload(url, format);
        
        // Pipe stdout (video data) to response
        ytdlpProcess.stdout.pipe(res);
        
        // Handle errors
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
        
        // Handle client disconnect
        req.on('close', () => {
            ytdlpProcess.kill();
        });
        
    } catch (error) {
        console.error('Stream error:', error.message);
        if (!res.headersSent) {
            res.status(500).send(`Failed to stream download: ${error.message}`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
