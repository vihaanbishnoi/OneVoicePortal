import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMeetings } from '../api';

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMeetings() {
      try {
        const data = await fetchMeetings();
        setMeetings(data);
      } catch (err) {
        setError(err.message || 'Failed to load meetings');
      } finally {
        setLoading(false);
      }
    }
    loadMeetings();
  }, []);

  if (loading) return <div className="app-container"><p>Loading meetings...</p></div>;
  if (error) return <div className="app-container"><p style={{ color: 'var(--danger)' }}>Error: {error}</p></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ alignSelf: 'flex-start' }}>
        <Link to="/" className="back-link">&larr; Back to Home</Link>
      </div>

      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1>Meetings Log</h1>
        <p style={{ margin: '4px 0 0 0' }}>Overview of all logged employee discussion forums</p>
      </div>

      {meetings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', width: '100%', maxWidth: '800px' }}>
          <p>No meetings recorded yet.</p>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: '900px' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Forum Type</th>
                <th>Date</th>
                <th>Department</th>
                <th>Facilitator</th>
                <th>Participants</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td><strong>#{m.id}</strong></td>
                  <td>
                    <span className="badge badge-open" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      {m.forum_type}
                    </span>
                  </td>
                  <td>{m.date}</td>
                  <td>{m.department}</td>
                  <td>{m.facilitator}</td>
                  <td>{m.num_participants} attendees</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/meetings/${m.id}`}>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                        View Detail &rarr;
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
