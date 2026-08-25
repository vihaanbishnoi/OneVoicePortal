import { useState } from 'react';
import { login } from '../api';
export default function Login({ onLogin }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const result = await login(email, password); localStorage.setItem('onevoice_token', result.token); localStorage.setItem('onevoice_user', JSON.stringify(result.user)); onLogin(result.user); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <main className="login-shell"><section className="login-card"><span className="eyebrow">ONEVOICE HR</span><h1>Welcome back</h1><p>Manage employee feedback, commitments, and follow-ups in one secure place.</p>{error && <div className="alert">{error}</div>}<form onSubmit={submit}><label>Work email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
