import axios from 'axios';

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

    const { url, platform, ua, cookies, filename } = req.query;
    
    if (!url) {
        return res.status(400).send('URL is required');
    }

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

        if (!isTikTok && req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        if (cookies) {
            headers['Cookie'] = cookies;
        }

        if (isTikTok) {
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
            timeout: 60000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400
        });

        const safeFilename = (filename || `download_${Date.now()}.mp4`)
            .replace(/[^\x00-\x7F]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_');
        
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
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
        }
        res.status(500).send(`Failed to proxy download: ${error.message}`);
    }
}
