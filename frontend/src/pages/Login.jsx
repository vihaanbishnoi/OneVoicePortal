import { useState } from 'react';
import { login, startDemo } from '../api';
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function selectMode(nextMode) {
    setMode(nextMode);
    setEmail('');
    setPassword('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const credentials = { mode, password };
      if (mode === 'admin') credentials.email = email.trim();
      const result = mode === 'demo' ? await startDemo() : await login(credentials);
      localStorage.setItem('onevoice_token', result.token);
      // Cached for convenience only; App verifies identity with the backend.
      localStorage.setItem('onevoice_user', JSON.stringify(result.user));
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <span className="eyebrow">ONEVOICE PORTAL</span>
        <h1>{mode === 'admin' ? 'Admin sign in' : 'Try OneVoice'}</h1>
        <p>
          {mode === 'admin' ? 'Sign in to your private workspace.' : 'Record meetings, track follow-ups, and review sample conversations.'}
        </p>
        {mode === 'demo' && <p className="login-description">No sign-up or password.</p>}
        {error && <div className="alert" role="alert">{error}</div>}
        <form onSubmit={submit}>
          {mode === 'admin' && (
            <div>
              <label htmlFor="admin-email">Admin email</label>
              <input id="admin-email" type="email" autoComplete="username" value={email}
                disabled={busy} onChange={event => setEmail(event.target.value)} required />
            </div>
          )}
          {mode === 'admin' && <div>
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" value={password}
              disabled={busy} onChange={event => setPassword(event.target.value)} required />
          </div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Opening workspace…' : mode === 'admin' ? 'Sign in as Admin' : 'Open demo'}
          </button>
          {busy && <p className="login-description" role="status">Connecting to the workspace. The first visit may take a moment.</p>}
        </form>
        <button type="button" className="btn-secondary login-switch" disabled={busy}
          onClick={() => selectMode(mode === 'admin' ? 'demo' : 'admin')}>
          {mode === 'admin' ? 'Back to demo' : 'Admin sign in'}
        </button>
      </section>
    </main>
  );
}
