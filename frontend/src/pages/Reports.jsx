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
      <Link to="/">&larr; Back to Home</Link>
      <h1>Search & Reports</h1>

      {/* Filter Section */}
      <fieldset>
        <legend>Filters</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <label>Department: </label>
            <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. HR, Sales" />
          </div>
          <div>
            <label>Date Range (Start): </label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label>Date Range (End): </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label>Category: </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              <option value="Facility">Facility</option>
              <option value="Learning">Learning</option>
              <option value="Admin">Admin</option>
              <option value="Safety">Safety</option>
            </select>
          </div>
          <div>
            <label>Status: </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </fieldset>

      <br />

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <button onClick={handleSearch} disabled={searchLoading}>
          {searchLoading ? 'Searching...' : 'Run DB Search'}
        </button>
        <button onClick={handleGenerateInsights} disabled={insightsLoading}>
          {insightsLoading ? 'Generating AI Insights...' : 'Generate AI Insights (Recurring themes)'}
        </button>
      </div>

      <br /><hr /><br />

      {/* AI Insights Section */}
      {insights && (
        <div>
          <h2>AI Insights (Recurring Themes)</h2>
          <div style={{ padding: '10px', border: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{insights}</pre>
          </div>
          <br /><hr /><br />
        </div>
      )}

      {/* Search Results Sections */}
      {searchResults && (
        <div>
          <h2>Search Results</h2>
          
          <h3>Matching Meetings</h3>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
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
                <tr><td colSpan="6">No matching meetings.</td></tr>
              ) : (
                searchResults.meetings.map(m => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.forum_type}</td>
                    <td>{m.date}</td>
                    <td>{m.department}</td>
                    <td>{m.facilitator}</td>
                    <td>{m.num_participants}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3>Matching Discussion Points</h3>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Meeting Info (Dept/Date)</th>
                <th>Discussion Point</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.discussions.length === 0 ? (
                <tr><td colSpan="6">No matching discussions.</td></tr>
              ) : (
                searchResults.discussions.map(dp => (
                  <tr key={dp.id}>
                    <td>{dp.id}</td>
                    <td>{dp.department} ({dp.date})</td>
                    <td>{dp.discussion_point}</td>
                    <td>{dp.category}</td>
                    <td>{dp.priority}</td>
                    <td>{dp.sentiment || 'Not Analyzed'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3>Matching Action Items</h3>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Meeting Info (Dept/Date)</th>
                <th>Description</th>
                <th>Owner</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.actions.length === 0 ? (
                <tr><td colSpan="6">No matching action items.</td></tr>
              ) : (
                searchResults.actions.map(a => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td>{a.department} ({a.date})</td>
                    <td>{a.description}</td>
                    <td>{a.owner}</td>
                    <td>{a.due_date}</td>
                    <td>{a.status}</td>
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
