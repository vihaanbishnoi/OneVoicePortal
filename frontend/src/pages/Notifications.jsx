import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, readNotification } from '../api';
import { timestamp } from '../utils';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => fetchNotifications().then(result => { if (active) { setItems(result); setError(''); } }).catch(err => { if (active) setError(err.message); });
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function mark(id) {
    try { await readNotification(id); setItems(current => current.map(item => item.id === id ? {...item,read:true} : item)); }
    catch (err) { setError(err.message); }
  }
  return <div><div className="page-title"><span className="eyebrow">FOLLOW-UPS</span><h1>Notifications & alerts</h1><p>Email replies and actions needing attention.</p></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <section className="card">{items.length ? items.map(item => <article className={`notification ${item.read?'read':''}`} key={item.id}>
      <div><b>{item.title}</b><p>{item.body}</p><small>{timestamp(item.created_at)}</small></div>
      <div>{item.action_id && <Link to={`/meetings/${item.meeting_id}/logs/${item.action_id}`}>Open action</Link>}
        {!item.read && <button className="btn-secondary" onClick={() => mark(item.id)}>Mark read</button>}</div>
    </article>) : <p>No notifications yet.</p>}</section></div>;
}
