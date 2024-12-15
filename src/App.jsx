import { useState } from 'react';
import axios from 'axios';

const App = () => {
  const [url, setUrl] = useState('https://confs.tech/cfp'); // Default URL
  const [className, setClassName] = useState('ConferenceItem_dl__dFt82'); // Default class name
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleScrape = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `/api/scrape?url=${encodeURIComponent(url)}&className=${className}`
      );
      console.log('Full response:', response);
      console.log('Parsed Data:', response.data.parsedData);

      setData(response.data.parsedData); // Adjust to use parsedData from backend
    } catch (err) {
      console.error('Error:', err);
      setError(err.response?.data?.error || 'An unknown error occurred.');
    } finally {
      console.log('finally');
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Scraper</h1>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Enter URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ padding: '8px', width: '300px', marginRight: '10px' }}
        />
        <input
          type="text"
          placeholder="Enter Class Name"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          style={{ padding: '8px', width: '200px', marginRight: '10px' }}
        />
        <button
          onClick={handleScrape}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007BFF',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Scraping...' : 'Scrape'}
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {data && (
        <div style={{ marginTop: '20px' }}>
          <h2>Scraped Data:</h2>
          <pre
            style={{
              backgroundColor: '#f4f4f4',
              padding: '10px',
              borderRadius: '4px',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default App;
