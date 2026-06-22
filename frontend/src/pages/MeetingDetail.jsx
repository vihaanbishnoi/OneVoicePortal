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

  if (loading) return <p>Loading meeting details...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!meeting) return <p>Meeting not found.</p>;

  return (
    <div>
      <Link to="/meetings">&larr; Back to Meetings List</Link>
      <h1>Meeting Detail (ID: {meeting.id})</h1>

      {/* Meeting Info */}
      <fieldset>
        <legend>Meeting Info</legend>
        <p><strong>Forum Type:</strong> {meeting.forum_type}</p>
        <p><strong>Date:</strong> {meeting.date}</p>
        <p><strong>Department:</strong> {meeting.department}</p>
        <p><strong>Facilitator:</strong> {meeting.facilitator}</p>
        <p><strong>Number of Participants:</strong> {meeting.num_participants}</p>
      </fieldset>

      <br />

      {/* Discussion Points Section */}
      <h2>Discussion Points</h2>
      <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Discussion Point</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Sentiment</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {meeting.discussion_points.length === 0 ? (
            <tr><td colSpan="6">No discussion points recorded.</td></tr>
          ) : (
            meeting.discussion_points.map((dp) => (
              <tr key={dp.id}>
                <td>{dp.id}</td>
                <td>{dp.discussion_point}</td>
                <td>{dp.category}</td>
                <td>{dp.priority}</td>
                <td>{dp.sentiment || <em>Not Analyzed</em>}</td>
                <td>
                  <button
                    onClick={() => handleSentimentAnalysis(dp.id)}
                    disabled={sentimentLoading[dp.id]}
                  >
                    {sentimentLoading[dp.id] ? 'Analyzing...' : 'Analyze Sentiment'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3>Add Discussion Point</h3>
      <form onSubmit={handleAddDiscussion}>
        <input
          type="text"
          placeholder="Discussion point text"
          value={discussionPoint}
          onChange={(e) => setDiscussionPoint(e.target.value)}
          required
          style={{ width: '400px', marginRight: '10px' }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ marginRight: '10px' }}>
          <option value="Facility">Facility</option>
          <option value="Learning">Learning</option>
          <option value="Admin">Admin</option>
          <option value="Safety">Safety</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ marginRight: '10px' }}>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button type="submit" disabled={discussionLoading}>
          {discussionLoading ? 'Adding...' : 'Add Point'}
        </button>
      </form>

      <br />

      {/* Action Items Section */}
      <h2>Action Items</h2>
      <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
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
            <tr><td colSpan="5">No action items assigned.</td></tr>
          ) : (
            meeting.action_items.map((ai) => (
              <tr key={ai.id}>
                <td>{ai.id}</td>
                <td>{ai.description}</td>
                <td>{ai.owner}</td>
                <td>{ai.due_date}</td>
                <td>{ai.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3>Add Action Item</h3>
      <form onSubmit={handleAddAction}>
        <input
          type="text"
          placeholder="Action description"
          value={actionDesc}
          onChange={(e) => setActionDesc(e.target.value)}
          required
          style={{ width: '300px', marginRight: '10px' }}
        />
        <input
          type="text"
          placeholder="Owner name"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          required
          style={{ marginRight: '10px' }}
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
          style={{ marginRight: '10px' }}
        />
        <button type="submit" disabled={actionLoading}>
          {actionLoading ? 'Adding...' : 'Add Action'}
        </button>
      </form>

      <br /><hr /><br />

      {/* AI Actions */}
      <h2>AI Features</h2>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <button onClick={handleGenerateMOM} disabled={momLoading}>
            {momLoading ? 'Generating MOM...' : 'Generate MOM'}
          </button>
          {momText && (
            <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
              <h3>Generated MOM:</h3>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{momText}</pre>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <button onClick={handleGenerateSummary} disabled={summaryLoading}>
            {summaryLoading ? 'Generating Summary...' : 'Generate Summary'}
          </button>
          {summary && (
            <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
              <h3>Generated Summary:</h3>
              
              <h4>Top 5 Concerns:</h4>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{summary.concerns}</pre>

              <h4>Positive Feedback:</h4>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{summary.feedback}</pre>

              <h4>Open Actions:</h4>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{summary.actions}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
