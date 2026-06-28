import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>OneVoice Portal</h1>
        <p style={{ margin: '0' }}>Corporate Meeting Companion & Data Log</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '30px',
        width: '100%',
        maxWidth: '800px',
      }}>
        {/* Box 1: New Meeting */}
        <Link to="/new-meeting" style={{ textDecoration: 'none' }}>
          <div className="card" style={{
            height: '180px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: '1px solid var(--border)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontSize: '1.4rem' }}>New Meeting</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Log a new meeting and participants</span>
          </div>
        </Link>

        {/* Box 2: Meetings */}
        <Link to="/meetings" style={{ textDecoration: 'none' }}>
          <div className="card" style={{
            height: '180px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: '1px solid var(--border)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontSize: '1.4rem' }}>Meetings</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>View logged discussions & actions</span>
          </div>
        </Link>

        {/* Box 3: Search */}
        <Link to="/reports" style={{ textDecoration: 'none' }}>
          <div className="card" style={{
            height: '180px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: '1px solid var(--border)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontSize: '1.4rem' }}>Search</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Filter database and export to Excel</span>
          </div>
        </Link>

        {/* Box 4: Analytics/Calendar (Empty placeholder for now) */}
        <div className="card" style={{
          height: '180px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '1px dashed var(--border)',
          backgroundColor: '#f1f5f9',
          textAlign: 'center',
          opacity: 0.8
        }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '1.4rem' }}>Analytics / Calendar</h3>
          <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Details coming soon</span>
        </div>
      </div>
    </div>
  );
}
