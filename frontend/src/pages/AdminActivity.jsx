import { useEffect, useState } from 'react';
import { fetchActivity } from '../api';
import { timestamp } from '../utils';

export default function AdminActivity() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true); setError('');
    try { setItems(await fetchActivity()); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { fetchActivity().then(setItems).catch(err => setError(err.message)).finally(() => setBusy(false)); }, []);
  return <div>
    <div className="page-title"><span className="eyebrow">ADMIN</span><h1>Activity history</h1>
      <p>Recording, sign-in, export, and integration events. Times are shown in India time. Demo visits are anonymous sessions.</p></div>
    <button className="btn-secondary" onClick={load} disabled={busy}>Refresh activity</button>
    {error && <div className="alert" role="alert">{error}</div>}
    {busy ? <p role="status">Loading activity…</p> : <div className="table-scroll"><table>
      <thead><tr><th>Time (IST)</th><th>Event</th><th>Account type</th><th>Details</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}><td>{timestamp(item.created_at)}</td><td>{item.event}</td>
        <td>{item.actor_role === 'demo' ? 'Anonymous demo visitor' : item.actor_role === 'hr_admin' ? 'Admin' : item.actor_role}</td>
        <td>{item.detail || '—'}</td></tr>)}</tbody>
    </table>{!items.length && <p>No activity recorded yet.</p>}</div>}
  </div>;
}
