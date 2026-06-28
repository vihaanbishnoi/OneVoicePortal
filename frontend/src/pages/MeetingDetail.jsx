import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchMeeting, addMeetingLog, updateRemarks } from '../api';

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // New Log Entry Form State
  const [discussionPoint, setDiscussionPoint] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [actionDesc, setActionDesc] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Inline editing state
  const [editingRowId, setEditingRowId] = useState(null);
  const [editOwnerRemarks, setEditOwnerRemarks] = useState('');
  const [editHrRemarks, setEditHrRemarks] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    async function loadMeeting() {
      try {
        const data = await fetchMeeting(id);
        setMeeting(data);
      } catch (err) {
        setError(err.message || 'Failed to load meeting details');
      } finally {
        setLoading(false);
      }
    }
    loadMeeting();
  }, [id]);

  const handleAddLogEntry = async (e) => {
    e.preventDefault();
    if (!discussionPoint || !category || !actionDesc || !contactPerson) {
      alert('Please fill in all required fields.');
      return;
    }
    setFormLoading(true);
    try {
      const result = await addMeetingLog(id, {
        discussion_point: discussionPoint,
        category,
        priority,
        action_description: actionDesc,
        contact_person: contactPerson,
        contact_email: contactEmail
      });
      setMeeting({
        ...meeting,
        logs: [...meeting.logs, result]
      });
      // Reset form
      setDiscussionPoint('');
      setCategory('');
      setPriority('Medium');
      setActionDesc('');
      setContactPerson('');
      setContactEmail('');
    } catch (err) {
      alert('Error adding log entry: ' + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const startEditing = (log) => {
    setEditingRowId(log.id);
    setEditOwnerRemarks(log.owner_remarks || '');
    setEditHrRemarks(log.hr_remarks || '');
  };

  const cancelEditing = () => {
    setEditingRowId(null);
  };

  const handleSaveRemarks = async (logId) => {
    setSaveLoading(true);
    try {
      const result = await updateRemarks(logId, {
        owner_remarks: editOwnerRemarks,
        hr_remarks: editHrRemarks
      });
      // Update local logs list
      setMeeting(prev => {
        const updatedLogs = prev.logs.map(log => {
          if (log.id === logId) {
            return {
              ...log,
              owner_remarks: result.owner_remarks,
              owner_remarks_date: result.owner_remarks_date,
              hr_remarks: result.hr_remarks,
              hr_remarks_date: result.hr_remarks_date
            };
          }
          return log;
        });
        return { ...prev, logs: updatedLogs };
      });
      setEditingRowId(null);
    } catch (err) {
      alert('Failed to save remarks: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const getPriorityBadgeClass = (p) => {
    const val = p ? p.toLowerCase() : '';
    if (val === 'high') return 'badge badge-high';
    if (val === 'low') return 'badge badge-low';
    return 'badge badge-medium';
  };

  const makeGmailLink = (email, contactPerson, discussionPoint, actionDescription) => {
    if (!email) return '';
    const subject = encodeURIComponent(`OneVoice Portal Follow-up - ${meeting.forum_type} (${meeting.date})`);
    const body = encodeURIComponent(
      `Hello ${contactPerson},\n\n` +
      `Regarding the discussion point raised in our meeting on ${meeting.date}:\n` +
      `"${discussionPoint}"\n\n` +
      `Follow-up Action needed:\n` +
      `"${actionDescription}"\n\n` +
      `Please reply to this email with your updates. Thank you!`
    );
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}&body=${body}`;
  };

  if (loading) return <div className="app-container"><p>Loading meeting details...</p></div>;
  if (error) return <div className="app-container"><p style={{ color: 'var(--danger)' }}>Error: {error}</p></div>;
  if (!meeting) return <div className="app-container"><p>Meeting not found.</p></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ alignSelf: 'flex-start' }}>
        <Link to="/meetings" className="back-link">&larr; Back to Meetings Log</Link>
      </div>

      <div style={{ marginBottom: '30px', textAlign: 'center', width: '100%' }}>
        <span className="badge badge-open" style={{ marginBottom: '10px', fontSize: '0.8rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
          {meeting.forum_type}
        </span>
        <h1>Meeting Details #{meeting.id}</h1>
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '15px' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{meeting.date}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Department:</span> <strong>{meeting.department}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Facilitator:</span> <strong>{meeting.facilitator}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Participants:</span> <strong>{meeting.num_participants}</strong></div>
        </div>

        {/* Participant list if HR logged names */}
        {meeting.participants_list && meeting.participants_list.length > 0 && (
          <div style={{ marginTop: '20px', maxWidth: '600px', margin: '20px auto 0 auto', padding: '12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', backgroundColor: '#ffffff' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', textAlign: 'left', color: 'var(--text-main)' }}>Participant Registry:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-start' }}>
              {meeting.participants_list.map((p, index) => (
                <span key={index} style={{ fontSize: '0.8rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                  <strong>{p.name}</strong> {p.empid ? `(ID: ${p.empid})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Discussion & Action Combined Log Table */}
      <h2>Discussion & Action Log</h2>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '60px' }}>ID</th>
              <th>Discussion Point & Action</th>
              <th style={{ width: '120px' }}>Category</th>
              <th style={{ width: '100px' }}>Priority</th>
              <th style={{ width: '160px' }}>Contact Person</th>
              <th>Action Owner Remarks</th>
              <th>HR Remarks</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {meeting.logs.length === 0 ? (
              <tr><td colSpan="8" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>No logs recorded for this meeting.</td></tr>
            ) : (
              meeting.logs.map((log) => {
                const isEditing = editingRowId === log.id;
                const mailUrl = makeGmailLink(log.contact_email, log.contact_person, log.discussion_point, log.action_description);

                return (
                  <tr key={log.id}>
                    <td><strong>#{log.id}</strong></td>
                    <td>
                      <div>
                        <strong>Point:</strong> {log.discussion_point}
                      </div>
                      <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--primary)' }}>
                        <strong>Action:</strong> {log.action_description}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-open" style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid var(--border)' }}>
                        {log.category}
                      </span>
                    </td>
                    <td>
                      <span className={getPriorityBadgeClass(log.priority)}>{log.priority}</span>
                    </td>
                    <td>
                      <div><strong>{log.contact_person}</strong></div>
                      {log.contact_email && (
                        <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{log.contact_email}</span>
                          <br />
                          <a
                            href={mailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              marginTop: '4px',
                              color: 'var(--primary)',
                              fontWeight: '600',
                              textDecoration: 'none'
                            }}
                          >
                            📧 Mail (Gmail)
                          </a>
                        </div>
                      )}
                    </td>
                    
                    {/* Owner Remarks Column */}
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editOwnerRemarks}
                          onChange={(e) => setEditOwnerRemarks(e.target.value)}
                          rows="3"
                          style={{ minWidth: '150px' }}
                          placeholder="Action owner comments..."
                        />
                      ) : (
                        <div>
                          <p style={{ textAlign: 'left', margin: 0, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                            {log.owner_remarks || <em>No remarks</em>}
                          </p>
                          {log.owner_remarks_date && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Updated: {log.owner_remarks_date}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* HR Remarks Column */}
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editHrRemarks}
                          onChange={(e) => setEditHrRemarks(e.target.value)}
                          rows="3"
                          style={{ minWidth: '150px' }}
                          placeholder="HR follow-up comments..."
                        />
                      ) : (
                        <div>
                          <p style={{ textAlign: 'left', margin: 0, color: 'var(--text-main)', fontSize: '0.85rem' }}>
                            {log.hr_remarks || <em>No remarks</em>}
                          </p>
                          {log.hr_remarks_date && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Updated: {log.hr_remarks_date}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Action buttons cell */}
                    <td style={{ textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <button
                            onClick={() => handleSaveRemarks(log.id)}
                            disabled={saveLoading}
                            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(log)}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          Update Remarks
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Log Form Box */}
      <div className="card" style={{ width: '100%', maxWidth: '850px', marginTop: '30px' }}>
        <h3 style={{ border: 'none', padding: '0', marginBottom: '15px' }}>+ Log Discussion Point & Action Item</h3>
        <form onSubmit={handleAddLogEntry}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '300px' }}>
              <label>Discussion Point *</label>
              <textarea
                placeholder="What feedback or concern was raised by the employee?"
                value={discussionPoint}
                onChange={(e) => setDiscussionPoint(e.target.value)}
                required
                rows="3"
              />
            </div>
            <div style={{ flex: 2, minWidth: '300px' }}>
              <label>Action Item / Follow-up *</label>
              <textarea
                placeholder="What task was assigned or needs follow-up?"
                value={actionDesc}
                onChange={(e) => setActionDesc(e.target.value)}
                required
                rows="3"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '15px' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label>Category *</label>
              <input
                type="text"
                placeholder="e.g. Facility, Safety, Admin"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label>Person to Contact *</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label>Contact Email (Optional)</label>
              <input
                type="text"
                placeholder="e.g. rahul@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" disabled={formLoading} style={{ width: '100%', marginTop: '25px' }}>
            {formLoading ? 'Adding Log Entry...' : 'Save Log Entry'}
          </button>
        </form>
      </div>
    </div>
  );
}
