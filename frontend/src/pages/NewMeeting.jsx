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
      <Link to="/">&larr; Back to Home</Link>
      <h1>New Meeting</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Forum Type: </label>
          <select value={forumType} onChange={(e) => setForumType(e.target.value)}>
            <option value="Batcheet">Batcheet</option>
            <option value="Voice of User">Voice of User</option>
            <option value="Town Hall">Town Hall</option>
            <option value="Open House">Open House</option>
          </select>
        </div>
        <br />
        <div>
          <label>Date: </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <br />
        <div>
          <label>Department: </label>
          <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} required />
        </div>
        <br />
        <div>
          <label>Facilitator: </label>
          <input type="text" value={facilitator} onChange={(e) => setFacilitator(e.target.value)} required />
        </div>
        <br />
        <div>
          <label>Number of Participants: </label>
          <input type="number" value={numParticipants} onChange={(e) => setNumParticipants(e.target.value)} required />
        </div>
        <br />
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Meeting'}
        </button>
      </form>
    </div>
  );
}
