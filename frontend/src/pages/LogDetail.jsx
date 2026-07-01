import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMeetingLog, updateRemarks } from '../api';

export default function LogDetail() {
  const { meetingId, logId } = useParams();
  const [log, setLog] = useState(null);
  const [ownerRemark, setOwnerRemark] = useState('');
  const [hrRemark, setHrRemark] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLog(await fetchMeetingLog(logId));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchMeetingLog(logId).then(setLog).catch(err => setError(err.message));
  }, [logId]);

  const save = async (event) => {
    event.preventDefault();
    if (!ownerRemark.trim() && !hrRemark.trim()) return setError('Enter at least one new remark.');
    setSaving(true);
    setError('');
    try {
      await updateRemarks(logId, {
        ...(ownerRemark.trim() ? { owner_remarks: ownerRemark.trim() } : {}),
        ...(hrRemark.trim() ? { hr_remarks: hrRemark.trim() } : {})
      });
      setOwnerRemark('');
      setHrRemark('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !log) return <p style={{ color: 'var(--danger)' }}>Error: {error}</p>;
  if (!log) return <p>Loading point details...</p>;

  return (
    <div>
      <Link to={`/meetings/${meetingId}`} className="back-link">&larr; Back to Meeting #{meetingId}</Link>
      <div className="detail-heading">
        <div><span className="badge badge-open">{log.category}</span><span className={`badge badge-${log.priority.toLowerCase()}`} style={{ marginLeft: 8 }}>{log.priority}</span></div>
        <h1>Discussion & Action #{log.id}</h1>
        <p>{log.forum_type} • {log.meeting_date} • {log.department}</p>
      </div>

      <div className="detail-grid">
        <section className="card"><h3>Discussion Point</h3><p>{log.discussion_point}</p></section>
        <section className="card"><h3>Action / Follow-up</h3><p>{log.action_description}</p></section>
      </div>
      <section className="card"><h3>Person to Contact</h3><p style={{ textAlign: 'left', margin: 0 }}>{log.contact_person}</p></section>

      <h2>Follow-up Activity</h2>
      <p className="section-description">A chronological audit trail of updates from the action owner and HR.</p>
      <div className="conversation-list">
        {log.history.length ? log.history.map((item, index) => (
          <div className={`conversation-item ${item.author_type === 'HR' ? 'hr' : 'owner'}`} key={item.id}>
            <span className="timeline-marker" aria-hidden="true"></span>
            <article>
              <header>
                <div>
                  <span className="activity-role">{item.author_type}</span>
                  <span className="activity-number">Update {index + 1}</span>
                </div>
                <time>{item.created_at}</time>
              </header>
              <p>{item.remark}</p>
            </article>
          </div>
        )) : <div className="card"><p>No updates yet. Start the follow-up below.</p></div>}
      </div>

      <section className="card" style={{ marginTop: 28 }}>
        <h3 style={{ marginTop: 0 }}>Record a Follow-up Update</h3>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <form onSubmit={save}>
          <div className="detail-grid">
            <div><label>Action Owner Remark</label><textarea rows="4" value={ownerRemark} onChange={e => setOwnerRemark(e.target.value)} placeholder="New action owner update..." /></div>
            <div><label>HR Remark</label><textarea rows="4" value={hrRemark} onChange={e => setHrRemark(e.target.value)} placeholder="New HR follow-up..." /></div>
          </div>
          <button disabled={saving}>{saving ? 'Saving...' : 'Record Update'}</button>
        </form>
      </section>
    </div>
  );
}
