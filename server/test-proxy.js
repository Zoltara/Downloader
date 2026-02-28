const { spawn } = require('child_process');
const fs = require('fs');

async function testProxySim() {
    const jsonPath = 'd:\\Web Downloads\\projects\\Downloader\\server\\yt_tiktok.json';
    if (!fs.existsSync(jsonPath)) {
        console.error("JSON file not found");
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const format = data.formats.find(f => f.url);
    if (!format) {
        console.error("No format with URL found");
        return;
    }

    const YTDLP_PATH = 'C:\\Users\\rambo\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python311\\Scripts\\yt-dlp.exe';
    const tiktokUrl = 'https://www.tiktok.com/@rp.respect3/video/7593642806141324575';

    console.log(`Piping media via yt-dlp for original URL: ${tiktokUrl}`);

    const ytProcess = spawn(YTDLP_PATH, [
        '-o', '-',
        '--no-part',
        '--no-playlist',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        tiktokUrl
    ]);

    let dataLength = 0;
    ytProcess.stdout.on('data', (chunk) => {
        dataLength += chunk.length;
        if (dataLength > 0 && dataLength < 1000000) {
            // console.log(`Received data... Total: ${dataLength}`);
        }
    });

    ytProcess.stderr.on('data', (data) => {
        // console.log(`stderr: ${data}`);
    });

    ytProcess.on('close', (code) => {
        console.log(`Process exited with code ${code}`);
        if (dataLength > 0) {
            console.log(`Success! Streamed ${dataLength} bytes.`);
        } else {
            console.error("Failed to stream any data.");
        }
    });
}

testProxySim();
