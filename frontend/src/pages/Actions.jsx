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

  if (loading) return <p>Loading action tracker...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <Link to="/">&larr; Back to Home</Link>
      <h1>Action Tracker</h1>
      {actions.length === 0 ? (
        <p>No action items found.</p>
      ) : (
        <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Description</th>
              <th>Owner</th>
              <th>Due Date</th>
              <th>Meeting Details (Dept / Forum)</th>
              <th>Current Status</th>
              <th>Update Status</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.description}</td>
                <td>{a.owner}</td>
                <td>{a.due_date}</td>
                <td>
                  <Link to={`/meetings/${a.meeting_id}`}>
                    {a.department} / {a.forum_type} ({a.date})
                  </Link>
                </td>
                <td><strong>{a.status}</strong></td>
                <td>
                  <select
                    value={statusDrafts[a.id] || a.status}
                    onChange={(e) => handleStatusChange(a.id, e.target.value)}
                    style={{ marginRight: '10px' }}
                  >
                    <option value="Open">Open</option>
                    <option value="Pending">Pending</option>
                    <option value="Closed">Closed</option>
                  </select>
                  <button
                    onClick={() => handleSaveStatus(a.id)}
                    disabled={updateLoading[a.id]}
                  >
                    {updateLoading[a.id] ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
