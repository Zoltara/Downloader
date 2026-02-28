import { useState } from 'react'

// API URL from environment variable or default to localhost
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleExtract = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to connect to the server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1>Downloader</h1>
      <p className="subtitle">Download social media content instantly</p>

      <div className="input-group">
        <input
          type="text"
          placeholder="Paste URL here (YouTube, TikTok, Instagram...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
      </div>

      <button
        className="download-btn"
        onClick={handleExtract}
        disabled={loading || !url}
      >
        {loading ? <><span className="loader"></span> Extracting...</> : 'Fetch Media'}
      </button>

      {error && <p style={{ color: '#ef4444', marginTop: '16px' }}>{error}</p>}

      {result && (
        <div className="result-card">
          {result.thumbnail && <img src={result.thumbnail} alt="Thumbnail" className="thumbnail" />}
          <h3>{result.title}</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', margin: '8px 0' }}>
            Source: {result.platform} {result.uploader ? `• ${result.uploader}` : ''}
          </p>

          <div className="format-list">
            {result.formats && result.formats.length > 0 ? (
              result.formats.map((format, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = format.url;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className={`format-btn ${format.isCombined ? 'combined' : ''}`}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{format.note || format.resolution || format.ext.toUpperCase()}</span>
                    <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>{format.ext.toUpperCase()}</span>
                    {format.isMerged && (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px' }}>
                        🎬 Video + Audio (Merged)
                      </span>
                    )}
                    {format.isCombined && !format.isMerged && (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '2px 6px', borderRadius: '4px' }}>
                        ✓ Video + Audio
                      </span>
                    )}
                    {format.isVideoOnly && (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px' }}>
                        Video Only (No Audio)
                      </span>
                    )}
                    {format.filesize && (
                      <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>
                        ~{(format.filesize / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <p style={{ gridColumn: 'span 2', color: 'var(--text-dim)' }}>No downloadable formats found.</p>
            )}
          </div>
        </div>
      )}

      <div className="platforms">
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Supports: YouTube, Instagram, TikTok, Facebook</span>
      </div>
    </div>
  )
}

export default App
