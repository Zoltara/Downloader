const { exec, spawn } = require('child_process');
const path = require('path');

// Full path to yt-dlp.exe if it's not in the PATH
const YTDLP_PATH = 'C:\\Users\\rambo\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python311\\Scripts\\yt-dlp.exe';

/**
 * Extracts media information using yt-dlp
 * @param {string} url - The social media URL
 * @returns {Promise<Object>} - Media info including download link and format
 */
const extractInfo = (url) => {
    return new Promise((resolve, reject) => {
        // -j: dump JSON
        // --flat-playlist: don't extract items in a playlist
        const command = `"${YTDLP_PATH}" -j --flat-playlist "${url}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing yt-dlp: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.warn(`yt-dlp stderr: ${stderr}`);
            }
            try {
                const info = JSON.parse(stdout);
                resolve(info);
            } catch (e) {
                reject(new Error('Failed to parse yt-dlp output'));
            }
        });
    });
};

/**
 * Gets direct download links for various formats
 * @param {string} url 
 */
const getFormats = (url) => {
    return new Promise((resolve, reject) => {
        const command = `"${YTDLP_PATH}" -F "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve(stdout);
        });
    });
};

/**
 * Gets all available formats as JSON (including video-only and audio-only)
 * @param {string} url 
 */
const getAllFormats = (url) => {
    return new Promise((resolve, reject) => {
        // Get JSON output with all formats
        const command = `"${YTDLP_PATH}" -j "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing yt-dlp: ${error.message}`);
                return reject(error);
            }
            try {
                const info = JSON.parse(stdout);
                resolve(info);
            } catch (e) {
                reject(new Error('Failed to parse yt-dlp output'));
            }
        });
    });
};

/**
 * Downloads a video and streams it through yt-dlp
 * @param {string} url - The video URL
 * @param {string} formatId - Optional format ID to download
 * @returns {ChildProcess} - The yt-dlp process streaming to stdout
 */
const streamDownload = (url, formatId = null) => {
    // -o -  outputs to stdout
    // -f format_id  selects specific format
    const args = [url, '-o', '-'];
    if (formatId) {
        args.push('-f', formatId);
    }
    
    const process = spawn(YTDLP_PATH, args);
    return process;
};

module.exports = {
    extractInfo,
    getFormats,
    getAllFormats,
    streamDownload,
    YTDLP_PATH
};
