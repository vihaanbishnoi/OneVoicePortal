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
  const [showParticipantDetails, setShowParticipantDetails] = useState(false);
  const [participants, setParticipants] = useState([{ name: '', empid: '' }]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddParticipant = () => {
    setParticipants([...participants, { name: '', empid: '' }]);
  };

  const handleRemoveParticipant = (index) => {
    const updated = [...participants];
    updated.splice(index, 1);
    setParticipants(updated);
  };

  const handleParticipantChange = (index, field, value) => {
    const updated = [...participants];
    updated[index][field] = value;
    setParticipants(updated);
  };

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
        participants_list: showParticipantDetails ? participants.filter(p => p.name || p.empid) : []
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ alignSelf: 'flex-start' }}>
        <Link to="/" className="back-link">&larr; Back to Home</Link>
      </div>

      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1>Log New Meeting</h1>
        <p style={{ margin: '4px 0 0 0' }}>File a new employee forum record into the database</p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--danger-bg)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: 'var(--danger)',
          fontWeight: '600',
          width: '100%',
          maxWidth: '600px',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      <div className="card" style={{ width: '100%', maxWidth: '600px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label>Forum Type</label>
            <select value={forumType} onChange={(e) => setForumType(e.target.value)}>
              <option value="Batcheet">Batcheet</option>
              <option value="Voice of User">Voice of User</option>
              <option value="Town Hall">Town Hall</option>
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

          <div style={{ marginBottom: '20px' }}>
            <label>Number of Participants</label>
            <input type="number" placeholder="e.g. 15" min="1" value={numParticipants} onChange={(e) => setNumParticipants(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '25px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="showDetails"
                checked={showParticipantDetails}
                onChange={(e) => setShowParticipantDetails(e.target.checked)}
                style={{ width: 'auto', cursor: 'pointer' }}
              />
              <label htmlFor="showDetails" style={{ margin: 0, cursor: 'pointer', userSelect: 'none' }}>
                Add names and Employee IDs of the members
              </label>
            </div>

            {showParticipantDetails && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-main)' }}>Participant Registry</h4>
                {participants.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={p.name}
                      onChange={(e) => handleParticipantChange(idx, 'name', e.target.value)}
                      style={{ flex: 2, padding: '6px 10px', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Employee ID"
                      value={p.empid}
                      onChange={(e) => handleParticipantChange(idx, 'empid', e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
                    />
                    {participants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(idx)}
                        className="btn-secondary"
                        style={{ padding: '6px 10px', color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.2)' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="btn-secondary"
                  style={{ width: '100%', marginTop: '5px', padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  + Add Participant
                </button>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating...' : 'Create Meeting'}
          </button>
        </form>
      </div>
    </div>
  );
}
