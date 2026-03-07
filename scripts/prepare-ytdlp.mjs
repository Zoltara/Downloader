import fs from 'fs';
import path from 'path';
import https from 'https';

const BIN_DIR = path.join(process.cwd(), 'api', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'yt-dlp');
const SOURCE_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return resolve(downloadFile(response.headers.location, dest));
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`Download failed with status ${response.statusCode}`));
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.chmodSync(dest, 0o755);
          resolve();
        });
      })
      .on('error', (error) => {
        try {
          file.close();
          fs.unlinkSync(dest);
        } catch {}
        reject(error);
      });
  });
}

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Always download the latest binary to ensure yt-dlp is up-to-date.
  // Stale binaries cause extractor failures (YouTube bot detection, removed clients, etc.)
  if (fs.existsSync(BIN_PATH)) {
    fs.unlinkSync(BIN_PATH);
  }

  console.log(`Downloading latest yt-dlp to ${BIN_PATH} ...`);
  await downloadFile(SOURCE_URL, BIN_PATH);
  console.log('yt-dlp prepared successfully.');
}

main().catch((error) => {
  console.error('Failed to prepare yt-dlp:', error.message);
  process.exit(1);
});
