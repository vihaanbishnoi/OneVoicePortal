import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <h1>OneVoice Portal</h1>
      <p>Welcome to the HR meeting and action tracker.</p>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '200px' }}>
        <Link to="/new-meeting">
          <button style={{ width: '100%' }}>New Meeting</button>
        </Link>
        <Link to="/meetings">
          <button style={{ width: '100%' }}>Meetings List</button>
        </Link>
        <Link to="/actions">
          <button style={{ width: '100%' }}>Action Tracker</button>
        </Link>
        <Link to="/reports">
          <button style={{ width: '100%' }}>Search & Reports</button>
        </Link>
      </nav>
    </div>
  );
}
