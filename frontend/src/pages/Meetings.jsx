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

  if (loading) return <p>Loading meetings...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <Link to="/">&larr; Back to Home</Link>
      <h1>Meetings</h1>
      <Link to="/new-meeting">
        <button>+ Create New Meeting</button>
      </Link>
      <br /><br />
      {meetings.length === 0 ? (
        <p>No meetings found.</p>
      ) : (
        <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Forum Type</th>
              <th>Date</th>
              <th>Department</th>
              <th>Facilitator</th>
              <th>Participants</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td>{m.forum_type}</td>
                <td>{m.date}</td>
                <td>{m.department}</td>
                <td>{m.facilitator}</td>
                <td>{m.num_participants}</td>
                <td>
                  <Link to={`/meetings/${m.id}`}>
                    <button>View Details</button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
