import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchMeeting,
  addDiscussion,
  addAction,
  analyzeSentiment,
  generateMOM,
  generateSummary
} from '../api';

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Discussion Form State
  const [discussionPoint, setDiscussionPoint] = useState('');
  const [category, setCategory] = useState('Facility');
  const [priority, setPriority] = useState('Medium');
  const [discussionLoading, setDiscussionLoading] = useState(false);

  // Action Form State
  const [actionDesc, setActionDesc] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // AI Outputs State
  const [momText, setMomText] = useState('');
  const [momLoading, setMomLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [sentimentLoading, setSentimentLoading] = useState({});

  useEffect(() => {
    async function loadMeeting() {
      try {
        const data = await fetchMeeting(id);
        setMeeting(data);
        if (data.mom_text) {
          setMomText(data.mom_text);
        }
      } catch (err) {
        setError(err.message || 'Failed to load meeting details');
      } finally {
        setLoading(false);
      }
    }
    loadMeeting();
  }, [id]);

  const handleAddDiscussion = async (e) => {
    e.preventDefault();
    if (!discussionPoint) return;
    setDiscussionLoading(true);
    try {
      const result = await addDiscussion(id, {
        discussion_point: discussionPoint,
        category,
        priority
      });
      setMeeting({
        ...meeting,
        discussion_points: [...meeting.discussion_points, result]
      });
      setDiscussionPoint('');
    } catch (err) {
      alert('Error adding discussion: ' + err.message);
    } finally {
      setDiscussionLoading(false);
    }
  };

  const handleAddAction = async (e) => {
    e.preventDefault();
    if (!actionDesc || !owner || !dueDate) return;
    setActionLoading(true);
    try {
      const result = await addAction(id, {
        description: actionDesc,
        owner,
        due_date: dueDate
      });
      setMeeting({
        ...meeting,
        action_items: [...meeting.action_items, result]
      });
      setActionDesc('');
      setOwner('');
      setDueDate('');
    } catch (err) {
      alert('Error adding action: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSentimentAnalysis = async (dpId) => {
    setSentimentLoading(prev => ({ ...prev, [dpId]: true }));
    try {
      const result = await analyzeSentiment(dpId);
      setMeeting(prev => {
        const updatedDps = prev.discussion_points.map(dp => {
          if (dp.id === dpId) {
            return { ...dp, sentiment: result.sentiment };
          }
          return dp;
        });
        return { ...prev, discussion_points: updatedDps };
      });
    } catch (err) {
      alert('Sentiment analysis failed: ' + err.message);
    } finally {
      setSentimentLoading(prev => ({ ...prev, [dpId]: false }));
    }
  };

  const handleGenerateMOM = async () => {
    setMomLoading(true);
    try {
      const result = await generateMOM(id);
      setMomText(result.mom_text);
    } catch (err) {
      alert('Failed to generate MOM: ' + err.message);
    } finally {
      setMomLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    try {
      const result = await generateSummary(id);
      setSummary(result);
    } catch (err) {
      alert('Failed to generate summary: ' + err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const getPriorityBadgeClass = (p) => {
    const val = p ? p.toLowerCase() : '';
    if (val === 'high') return 'badge badge-high';
    if (val === 'low') return 'badge badge-low';
    return 'badge badge-medium';
  };

  const getSentimentBadgeClass = (s) => {
    const val = s ? s.toLowerCase() : '';
    if (val === 'positive') return 'badge badge-positive';
    if (val === 'negative') return 'badge badge-negative';
    return 'badge badge-neutral';
  };

  if (loading) return <div className="app-container"><p>Loading meeting details...</p></div>;
  if (error) return <div className="app-container"><p style={{ color: 'var(--danger)' }}>Error: {error}</p></div>;
  if (!meeting) return <div className="app-container"><p>Meeting not found.</p></div>;

  return (
    <div>
      <Link to="/meetings" className="back-link">&larr; Back to Meetings List</Link>
      
      <div style={{ marginBottom: '30px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
        <span className="badge badge-open" style={{ marginBottom: '10px', fontSize: '0.8rem', backgroundColor: 'rgba(99,102,241,0.2)' }}>
          {meeting.forum_type}
        </span>
        <h1>Meeting Details #{meeting.id}</h1>
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', marginTop: '15px' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{meeting.date}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Department:</span> <strong>{meeting.department}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Facilitator:</span> <strong>{meeting.facilitator}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Participants:</span> <strong>{meeting.num_participants}</strong></div>
        </div>
      </div>

      {/* Discussion Points Section */}
      <h2>Discussion Points Log</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Discussion Point</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Sentiment Tone</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {meeting.discussion_points.length === 0 ? (
            <tr><td colSpan="6" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No discussion points logged yet.</td></tr>
          ) : (
            meeting.discussion_points.map((dp) => (
              <tr key={dp.id}>
                <td><strong>#{dp.id}</strong></td>
                <td>{dp.discussion_point}</td>
                <td><span className="badge badge-open" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>{dp.category}</span></td>
                <td><span className={getPriorityBadgeClass(dp.priority)}>{dp.priority}</span></td>
                <td><span className={getSentimentBadgeClass(dp.sentiment)}>{dp.sentiment || 'Pending AI'}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => handleSentimentAnalysis(dp.id)}
                    disabled={sentimentLoading[dp.id]}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    {sentimentLoading[dp.id] ? 'Analyzing...' : 'Tag Sentiment'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Action Items Section */}
      <h2>Action Items Assigned</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Description</th>
            <th>Owner</th>
            <th>Due Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {meeting.action_items.length === 0 ? (
            <tr><td colSpan="5" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No action items assigned.</td></tr>
          ) : (
            meeting.action_items.map((ai) => (
              <tr key={ai.id}>
                <td><strong>#{ai.id}</strong></td>
                <td>{ai.description}</td>
                <td><strong>{ai.owner}</strong></td>
                <td>{ai.due_date}</td>
                <td>
                  <span className={`badge badge-${ai.status.toLowerCase()}`}>
                    {ai.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Two forms side by side */}
      <div className="flex-row" style={{ marginTop: '40px' }}>
        {/* Add Discussion Card */}
        <div className="card">
          <h3 style={{ border: 'none', padding: '0', marginBottom: '15px' }}>+ Add Discussion Point</h3>
          <form onSubmit={handleAddDiscussion}>
            <div style={{ marginBottom: '15px' }}>
              <label>Discussion Point Description</label>
              <textarea
                placeholder="Type the feedback, concern, or point raised..."
                value={discussionPoint}
                onChange={(e) => setDiscussionPoint(e.target.value)}
                required
                rows="3"
              />
            </div>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Facility">Facility</option>
                  <option value="Learning">Learning</option>
                  <option value="Admin">Admin</option>
                  <option value="Safety">Safety</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={discussionLoading} style={{ width: '100%' }}>
              {discussionLoading ? 'Saving...' : 'Save Discussion Point'}
            </button>
          </form>
        </div>

        {/* Add Action Card */}
        <div className="card">
          <h3 style={{ border: 'none', padding: '0', marginBottom: '15px' }}>+ Assign Action Item</h3>
          <form onSubmit={handleAddAction}>
            <div style={{ marginBottom: '15px' }}>
              <label>Task Description</label>
              <textarea
                placeholder="What needs to be done for follow-up?"
                value={actionDesc}
                onChange={(e) => setActionDesc(e.target.value)}
                required
                rows="3"
              />
            </div>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label>Assignee (Owner)</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Target Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={actionLoading} style={{ width: '100%' }}>
              {actionLoading ? 'Assigning...' : 'Assign Action Item'}
            </button>
          </form>
        </div>
      </div>

      <br /><hr /><br />

      {/* AI Features section */}
      <div className="card ai-section">
        <h2 style={{ border: 'none', padding: '0', marginTop: '0', marginBottom: '10px' }}>🤖 Local AI Companion</h2>
        <p style={{ fontSize: '0.9rem', marginBottom: '24px' }}>Processes raw notes on secure local networks to compile summaries and minutes.</p>

        <div className="flex-row">
          {/* Minutes Of Meeting column */}
          <div>
            <button onClick={handleGenerateMOM} disabled={momLoading} style={{ width: '100%', marginBottom: '15px' }}>
              {momLoading ? 'Writing Minutes of Meeting...' : '✍️ Generate MOM Document'}
            </button>
            {momText && (
              <div className="ai-output-container">
                <h4 style={{ marginBottom: '8px' }}>Minutes of Meeting:</h4>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{momText}</pre>
              </div>
            )}
          </div>

          {/* Quick Summary column */}
          <div>
            <button onClick={handleGenerateSummary} disabled={summaryLoading} style={{ width: '100%', marginBottom: '15px' }} className="btn-secondary">
              {summaryLoading ? 'Synthesizing...' : '📊 Generate Core Summary'}
            </button>
            {summary && (
              <div className="ai-output-container" style={{ borderColor: 'var(--success)' }}>
                <h4 style={{ marginBottom: '8px' }}>Executive Summary:</h4>
                
                <p style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Top Concerns:</p>
                <pre style={{ whiteSpace: 'pre-wrap', marginBottom: '12px', fontSize: '0.8rem' }}>{summary.concerns}</pre>

                <p style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Positive Feedback:</p>
                <pre style={{ whiteSpace: 'pre-wrap', marginBottom: '12px', fontSize: '0.8rem' }}>{summary.feedback}</pre>

                <p style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Open Action Items:</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{summary.actions}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
