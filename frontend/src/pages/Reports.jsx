import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchReports } from '../api';

export default function Reports() {
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const params = {};
      if (category) params.category = category;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const results = await searchReports(params);
      setSearchResults(results);
    } catch (err) {
      alert('Search failed: ' + err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleDownloadDB = () => {
    // Navigate the browser window to start the direct excel spreadsheet download
    window.location.href = "http://localhost:5000/api/reports/export";
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ alignSelf: 'flex-start' }}>
        <Link to="/" className="back-link">&larr; Back to Home</Link>
      </div>

      <div style={{ marginBottom: '30px', textAlign: 'center', width: '100%' }}>
        <h1>Search & Export Reports</h1>
        <p style={{ margin: '4px 0 0 0' }}>Search logged meetings by type and date range, or export the entire database</p>
      </div>

      {/* Export card first for high visibility */}
      <div className="card" style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--primary-light)', borderColor: 'rgba(79, 70, 229, 0.2)', marginBottom: '30px' }}>
        <div style={{ textAlign: 'left' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)' }}>Export Database</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Get a copy of the entire SQLite database tables (meetings, logs) formatted into a multi-sheet Excel file.</p>
        </div>
        <button onClick={handleDownloadDB} style={{ whiteSpace: 'nowrap' }}>
          📥 Download Excel Sheet
        </button>
      </div>

      {/* Filters form */}
      <div className="card" style={{ width: '100%', maxWidth: '800px' }}>
        <h3 style={{ border: 'none', padding: '0', marginBottom: '15px' }}>Filter Criteria</h3>
        <form onSubmit={handleSearch}>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label>Forum Category (Type)</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All Types</option>
                <option value="Batcheet">Batcheet</option>
                <option value="Voice of User">Voice of User</option>
                <option value="Town Hall">Town Hall</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label>From Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label>To Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={searchLoading} style={{ width: '100%', marginTop: '20px' }}>
            {searchLoading ? 'Searching database...' : 'Search Meetings'}
          </button>
        </form>
      </div>

      {/* Search results list */}
      <div style={{ width: '100%', maxWidth: '800px', marginTop: '20px' }}>
        {searchResults.length > 0 ? (
          <div>
            <h2>Matching Meetings ({searchResults.length})</h2>
            {searchResults.map((m) => (
              <div className="card" key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                  <div>
                    <span className="badge badge-open" style={{ marginBottom: '5px' }}>{m.forum_type}</span>
                    <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Meeting #{m.id} ({m.date})</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', textAlign: 'left' }}>
                      Dept: <strong>{m.department}</strong> | Facilitator: <strong>{m.facilitator}</strong>
                    </p>
                  </div>
                  <Link to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>View logs &rarr;</button>
                  </Link>
                </div>
                
                {/* Embedded quick summary of logs */}
                {m.logs && m.logs.length > 0 ? (
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)', textAlign: 'left' }}>
                      Logs summary ({m.logs.length} entries):
                    </p>
                    <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {m.logs.map(log => (
                        <li key={log.id} style={{ marginBottom: '5px' }}>
                          <strong>{log.category}:</strong> {log.discussion_point} &rarr; <em>Contact: {log.contact_person}</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0, textAlign: 'left' }}>No logs recorded for this meeting.</p>
                )}
              </div>
            ))}
          </div>
        ) : searchResults !== null ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <p>No meetings found matching your filter criteria.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
