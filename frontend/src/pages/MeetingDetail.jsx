import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addMeetingLog, fetchMeeting } from '../api';
import { timestamp } from '../utils';

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const emptyForm = { discussion_point: '', action_description: '', category: '', priority: 'Medium', contact_person: '', contact_email: '', due_date: '', owner_name: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchMeeting(id).then(setMeeting).catch(err => setError(err.message));
  }, [id]);

  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const log = await addMeetingLog(id, form);
      setMeeting(current => ({ ...current, logs: [...current.logs, log] }));
      setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !meeting) return <p style={{ color: 'var(--danger)' }}>Error: {error}</p>;
  if (!meeting) return <p>Loading meeting details...</p>;

  return (
    <div>
      <Link to="/meetings" className="back-link">&larr; Back to Meetings Log</Link>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <span className="badge badge-open">{meeting.forum_type}</span>
        <h1>Meeting Details #{meeting.id}</h1>
        <p>{meeting.date} &nbsp;•&nbsp; {meeting.department} &nbsp;•&nbsp; Facilitator: {meeting.facilitator} &nbsp;•&nbsp; {meeting.num_participants} participants</p>
        <p className="record-timestamps">Recorded: {timestamp(meeting.created_at)} · Last updated: {timestamp(meeting.updated_at)}</p>
        {meeting.participants_list?.length > 0 && (
          <div className="card" style={{ maxWidth: '700px', margin: '18px auto' }}>
            <strong>Participants: </strong>
            {meeting.participants_list.map((person, index) => (
              <span key={index}>{index ? ', ' : ''}{person.name || `Employee ${person.empid}`}{person.name && person.empid ? ` (${person.empid})` : ''}</span>
            ))}
          </div>
        )}
      </div>

      <h2>Discussion & Action Points</h2>
      <p style={{ textAlign: 'left' }}>Open a point to view its full details and update history without crowding this page.</p>
      <div className="log-card-grid">
        {meeting.logs.length ? meeting.logs.map((log, index) => (
          <Link className="log-card" to={`/meetings/${meeting.id}/logs/${log.id}`} key={log.id}>
            <div className="log-card-top">
              <strong>Point #{index + 1}</strong>
              <span className={`badge badge-${log.priority.toLowerCase()}`}>{log.priority}</span>
            </div>
            <h3>{log.discussion_point}</h3>
            <p><strong>Action:</strong> {log.action_description}</p>
            <div className="log-card-footer"><span>{log.category}</span><span>View full point &rarr;</span></div>
          </Link>
        )) : <div className="card"><p>No points recorded for this meeting.</p></div>}
      </div>

      <div className="card" style={{ maxWidth: '850px', margin: '32px auto 0' }}>
        <h3 style={{ marginTop: 0 }}>+ Log Discussion Point & Action Item</h3>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <form onSubmit={submit}>
          <div className="flex-row">
            <div><label>Discussion Point *</label><textarea rows="3" required value={form.discussion_point} onChange={e => change('discussion_point', e.target.value)} /></div>
            <div><label>Action Item / Follow-up *</label><textarea rows="3" required value={form.action_description} onChange={e => change('action_description', e.target.value)} /></div>
          </div>
          <div className="grid-filters">
            <div><label>Category *</label><input type="text" required value={form.category} onChange={e => change('category', e.target.value)} /></div>
            <div><label>Priority</label><select value={form.priority} onChange={e => change('priority', e.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></div>
            <div><label>Person to Contact *</label><input type="text" required value={form.contact_person} onChange={e => change('contact_person', e.target.value)} /></div>
            <div><label>Contact email</label><input type="email" value={form.contact_email} onChange={e => change('contact_email', e.target.value)} /></div>
            <div><label>Due date</label><input type="date" value={form.due_date} onChange={e => change('due_date', e.target.value)} /></div>
            <div><label>Action owner</label><input type="text" value={form.owner_name} onChange={e => change('owner_name', e.target.value)} placeholder="Enter the responsible person's name" /></div>
          </div>
          <button disabled={saving} style={{ width: '100%' }}>{saving ? 'Saving...' : 'Save Log Entry'}</button>
        </form>
      </div>
    </div>
  );
}
