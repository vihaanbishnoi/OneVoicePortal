import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchInsights, searchReports } from '../api';

export default function Reports() {
  // Filter States
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  // Result States
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const params = {};
      if (department) params.department = department;
      if (category) params.category = category;
      if (status) params.status = status;
      
      const results = await searchReports(params);
      setSearchResults(results);
    } catch (err) {
      alert('Search failed: ' + err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    try {
      const params = {};
      if (department) params.department = department;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const result = await fetchInsights(params);
      setInsights(result.insights);
    } catch (err) {
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <div>
      <Link to="/" className="back-link">&larr; Back to Home</Link>
      
      <div style={{ marginBottom: '30px' }}>
        <h1>Search & Insights Reports</h1>
        <p style={{ margin: '4px 0 0 0' }}>Search recorded data or query local AI to group recurring complaints across forums</p>
      </div>

      {/* Filter Section */}
      <div className="card">
        <h3 style={{ border: 'none', padding: '0', marginBottom: '15px' }}>Filter Criteria</h3>
        <div className="grid-filters">
          <div>
            <label>Department / Unit</label>
            <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales, Engineering" />
          </div>
          <div>
            <label>Date range (Start)</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label>Date range (End)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label>Point Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              <option value="Facility">Facility</option>
              <option value="Learning">Learning</option>
              <option value="Admin">Admin</option>
              <option value="Safety">Safety</option>
            </select>
          </div>
          <div>
            <label>Action Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
          <button onClick={handleSearch} disabled={searchLoading} style={{ flex: 1 }}>
            {searchLoading ? 'Searching...' : '🔍 Run Database Search'}
          </button>
          <button onClick={handleGenerateInsights} disabled={insightsLoading} style={{ flex: 1 }} className="btn-secondary">
            {insightsLoading ? 'Analyzing recurring issues...' : '💡 Generate AI Theme Insights'}
          </button>
        </div>
      </div>

      {/* AI Insights Section */}
      {insights && (
        <div className="card ai-section" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ border: 'none', padding: '0', color: 'var(--primary)', marginBottom: '8px' }}>🤖 AI Recurring Theme Insights</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: '15px' }}>Ollama has analyzed matched discussion points to group and rank common feedback themes:</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{insights}</pre>
        </div>
      )}

      {/* Search Results Sections */}
      {searchResults && (
        <div style={{ marginTop: '40px' }}>
          <h2>Database Search Results</h2>
          
          <h3 style={{ marginTop: '20px' }}>Meetings ({searchResults.meetings.length})</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Forum Type</th>
                <th>Date</th>
                <th>Department</th>
                <th>Facilitator</th>
                <th>Participants</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.meetings.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No meetings matching the department criteria.</td></tr>
              ) : (
                searchResults.meetings.map(m => (
                  <tr key={m.id}>
                    <td><strong>#{m.id}</strong></td>
                    <td><span className="badge badge-open" style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>{m.forum_type}</span></td>
                    <td>{m.date}</td>
                    <td>{m.department}</td>
                    <td>{m.facilitator}</td>
                    <td>{m.num_participants} attendees</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: '30px' }}>Discussion Log ({searchResults.discussions.length})</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Department & Date</th>
                <th>Discussion Point</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.discussions.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No discussions matching filter criteria.</td></tr>
              ) : (
                searchResults.discussions.map(dp => (
                  <tr key={dp.id}>
                    <td><strong>#{dp.id}</strong></td>
                    <td>{dp.department} ({dp.date})</td>
                    <td>{dp.discussion_point}</td>
                    <td><span className="badge badge-open" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>{dp.category}</span></td>
                    <td>
                      <span className={`badge badge-${dp.priority ? dp.priority.toLowerCase() : 'medium'}`}>
                        {dp.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${dp.sentiment ? dp.sentiment.toLowerCase() : 'neutral'}`}>
                        {dp.sentiment || 'Not Analyzed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: '30px' }}>Action Items ({searchResults.actions.length})</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Origin Forum</th>
                <th>Task Description</th>
                <th>Owner</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.actions.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No action items matching filter criteria.</td></tr>
              ) : (
                searchResults.actions.map(a => (
                  <tr key={a.id}>
                    <td><strong>#{a.id}</strong></td>
                    <td>{a.department} / {a.forum_type}</td>
                    <td>{a.description}</td>
                    <td><strong>{a.owner}</strong></td>
                    <td>{a.due_date}</td>
                    <td>
                      <span className={`badge badge-${a.status.toLowerCase()}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
