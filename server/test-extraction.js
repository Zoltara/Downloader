const { extractInfo } = require('./downloader');

async function testExtraction() {
    // Check for URL in command line arguments
    const argUrl = process.argv[2];

    const testUrls = argUrl ? [argUrl] : [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    ];

    for (const url of testUrls) {
        console.log(`Testing URL: ${url}`);
        try {
            const info = await extractInfo(url);
            console.log('Success!');
            console.log('Title:', info.title);
            console.log('Extractor:', info.extractor_key);
            console.log('Formats found:', info.formats ? info.formats.length : 0);
        } catch (error) {
            console.error('Failed to extract:', error.message);
        }
    }
}

testExtraction();
