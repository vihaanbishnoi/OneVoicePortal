import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchActions, updateActionStatus } from '../api';

export default function Actions() {
  const [actions, setActions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusDrafts, setStatusDrafts] = useState({});
  const [updateLoading, setUpdateLoading] = useState({});

  useEffect(() => {
    async function loadActions() {
      try {
        const data = await fetchActions();
        setActions(data);
        // Initialize status drafts with current statuses
        const drafts = {};
        data.forEach(a => {
          drafts[a.id] = a.status;
        });
        setStatusDrafts(drafts);
      } catch (err) {
        setError(err.message || 'Failed to load action items');
      } finally {
        setLoading(false);
      }
    }
    loadActions();
  }, []);

  const handleStatusChange = (id, val) => {
    setStatusDrafts(prev => ({ ...prev, [id]: val }));
  };

  const handleSaveStatus = async (id) => {
    const newStatus = statusDrafts[id];
    setUpdateLoading(prev => ({ ...prev, [id]: true }));
    try {
      await updateActionStatus(id, newStatus);
      // Update local action status list
      setActions(prev => prev.map(a => {
        if (a.id === id) {
          return { ...a, status: newStatus };
        }
        return a;
      }));
      alert('Status updated successfully');
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdateLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  if (loading) return <div className="app-container"><p>Loading action tracker...</p></div>;
  if (error) return <div className="app-container"><p style={{ color: 'var(--danger)' }}>Error: {error}</p></div>;

  return (
    <div>
      <Link to="/" className="back-link">&larr; Back to Home</Link>
      <div style={{ marginBottom: '30px' }}>
        <h1>Action Tracker</h1>
        <p style={{ margin: '4px 0 0 0' }}>Monitor and assign target completion statuses across all meeting logs</p>
      </div>

      {actions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p>No action items assigned across meetings yet.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task Description</th>
              <th>Owner</th>
              <th>Due Date</th>
              <th>Origin Forum</th>
              <th>Current Status</th>
              <th style={{ textAlign: 'right' }}>Update Status</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td><strong>#{a.id}</strong></td>
                <td>{a.description}</td>
                <td><strong>{a.owner}</strong></td>
                <td>{a.due_date}</td>
                <td>
                  <Link to={`/meetings/${a.meeting_id}`} style={{ color: '#a5b4fc', textDecoration: 'none' }}>
                    {a.department} / {a.forum_type}
                  </Link>
                </td>
                <td>
                  <span className={`badge badge-${a.status.toLowerCase()}`}>
                    {a.status}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '8px' }}>
                    <select
                      value={statusDrafts[a.id] || a.status}
                      onChange={(e) => handleStatusChange(a.id, e.target.value)}
                      style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto' }}
                    >
                      <option value="Open">Open</option>
                      <option value="Pending">Pending</option>
                      <option value="Closed">Closed</option>
                    </select>
                    <button
                      onClick={() => handleSaveStatus(a.id)}
                      disabled={updateLoading[a.id]}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      {updateLoading[a.id] ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
