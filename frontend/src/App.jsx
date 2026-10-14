import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, fetchCurrentUser } from './api';
import Login from './pages/Login'; import Home from './pages/WorkspaceHome'; import Calendar from './pages/Calendar'; import Notifications from './pages/Notifications';
import AdminActivity from './pages/AdminActivity';
import GmailSettings from './pages/GmailSettings';
import NewMeeting from './pages/NewMeeting'; import Meetings from './pages/Meetings'; import MeetingDetail from './pages/MeetingDetail'; import LogDetail from './pages/LogDetail'; import Reports from './pages/Reports';
function Shell({ user, logout }) {
  const navigate = useNavigate();
  const nav = [['/', 'Overview'], ['/calendar', 'Calendar'], ['/meetings', 'Meetings'],
    ['/new-meeting', 'New meeting'], ['/reports', 'Reports'], ['/notifications', 'Notifications']];
  if (user.role === 'hr_admin') nav.push(['/activity', 'Activity'], ['/gmail', 'Gmail connection']);
  return (
    <div className="portal">
      <aside>
        <div className="brand"><span>OV</span><b>OneVoice</b></div>
        <nav>{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <div className="profile">
          {!user.demo && <>
            <b>{user.name}</b>
            <small>{user.role === 'hr_admin' ? 'Administrator' : 'HR Team'}</small>
          </>}
          <button className="btn-secondary" onClick={() => { logout(); navigate('/'); }}>Sign out</button>
        </div>
      </aside>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/new-meeting" element={<NewMeeting />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail user={user} />} />
          <Route path="/meetings/:meetingId/logs/:logId" element={<LogDetail user={user} />} />
          <Route path="/reports" element={<Reports />} />
          {user.role === 'hr_admin' && <Route path="/activity" element={<AdminActivity />} />}
          {user.role === 'hr_admin' && <Route path="/gmail" element={<GmailSettings />} />}
          <Route path="*" element={<Home user={user} />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem('onevoice_token')));
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const out = () => {
      setUser(null);
      setChecking(false);
      setSessionError('');
    };
    window.addEventListener('onevoice-logout', out);
    if (localStorage.getItem('onevoice_token')) {
      fetchCurrentUser().then(currentUser => {
        if (active) {
          setUser(currentUser);
          localStorage.setItem('onevoice_user', JSON.stringify(currentUser));
        }
      }).catch(error => {
        if (active && localStorage.getItem('onevoice_token')) setSessionError(error.message);
      }).finally(() => {
        if (active) setChecking(false);
      });
    }
    return () => {
      active = false;
      window.removeEventListener('onevoice-logout', out);
    };
  }, [attempt]);

  const logout = () => {
    clearSession();
    setUser(null);
    setSessionError('');
    setChecking(false);
  };

  if (checking) return <main className="login-shell"><p role="status">Checking your session…</p></main>;
  if (sessionError) return (
    <main className="login-shell"><section className="login-card">
      <h1>Unable to check your session</h1>
      <div className="alert" role="alert">{sessionError}</div>
      <button onClick={() => { setChecking(true); setSessionError(''); setAttempt(value => value + 1); }}>Try again</button>
      <button className="btn-secondary" onClick={logout}>Return to sign in</button>
    </section></main>
  );
  return <Router>{user ? <Shell user={user} logout={logout} /> : <Login onLogin={setUser} />}</Router>;
}

export default App;
