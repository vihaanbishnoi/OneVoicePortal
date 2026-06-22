import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <div style={{ marginBottom: '40px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
        <h1>OneVoice Portal</h1>
        <p style={{ margin: '8px 0 0 0' }}>Corporate Meeting Companion & AI Insights Dashboard</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        marginTop: '20px'
      }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', border: 'none', padding: '0', color: 'var(--primary)' }}>New Meeting</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '20px' }}>Log a new meeting forum (Batcheet, Town Hall, Open House, etc.) with metadata and attendees.</p>
          </div>
          <Link to="/new-meeting" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%' }}>Create Meeting &rarr;</button>
          </Link>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', border: 'none', padding: '0', color: 'var(--primary)' }}>Meetings List</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '20px' }}>Access your logged meetings database. Manage discussion logs, action items, and generate MOM documents.</p>
          </div>
          <Link to="/meetings" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%' }} className="btn-secondary">View Database &rarr;</button>
          </Link>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', border: 'none', padding: '0', color: 'var(--primary)' }}>Action Tracker</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '20px' }}>Track assigned action items across all meetings. Update statuses (Open, Pending, Closed) on the fly.</p>
          </div>
          <Link to="/actions" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%' }} className="btn-secondary">Track Actions &rarr;</button>
          </Link>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0', border: 'none', padding: '0', color: 'var(--primary)' }}>Search & Reports</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '20px' }}>Perform advanced criteria searches and request AI theme aggregation to spot recurring employee issues.</p>
          </div>
          <Link to="/reports" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%' }} className="btn-secondary">Run Reports &rarr;</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
