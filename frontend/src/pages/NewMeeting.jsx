import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createMeeting } from '../api';

export default function NewMeeting() {
  const navigate = useNavigate();
  const [forumType, setForumType] = useState('Batcheet');
  const [date, setDate] = useState('');
  const [department, setDepartment] = useState('');
  const [facilitator, setFacilitator] = useState('');
  const [numParticipants, setNumParticipants] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !department || !facilitator || !numParticipants) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = {
        forum_type: forumType,
        date,
        department,
        facilitator,
        num_participants: parseInt(numParticipants, 10),
      };
      const result = await createMeeting(data);
      navigate(`/meetings/${result.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Link to="/" className="back-link">&larr; Back to Home</Link>
      <div style={{ marginBottom: '30px' }}>
        <h1>Log New Meeting</h1>
        <p style={{ margin: '4px 0 0 0' }}>Filing a new employee forum record to database</p>
      </div>

      {error && (
        <div style={{ padding: '12px', marginBottom: '20px', borderRadius: 'var(--radius)', backgroundColor: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', fontWeight: '500' }}>
          {error}
        </div>
      )}

      <div className="card" style={{ maxWidth: '600px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label>Forum Type</label>
            <select value={forumType} onChange={(e) => setForumType(e.target.value)}>
              <option value="Batcheet">Batcheet</option>
              <option value="Voice of User">Voice of User</option>
              <option value="Town Hall">Town Hall</option>
              <option value="Open House">Open House</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label>Department / Unit</label>
            <input type="text" placeholder="e.g. Engineering, Sales, Admin" value={department} onChange={(e) => setDepartment(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label>Facilitator Name</label>
            <input type="text" placeholder="e.g. HR Manager Name" value={facilitator} onChange={(e) => setFacilitator(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '25px' }}>
            <label>Number of Participants</label>
            <input type="number" placeholder="e.g. 15" min="1" value={numParticipants} onChange={(e) => setNumParticipants(e.target.value)} required />
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating...' : 'Create Meeting'}
          </button>
        </form>
      </div>
    </div>
  );
}
