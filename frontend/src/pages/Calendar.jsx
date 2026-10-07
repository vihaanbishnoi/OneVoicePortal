import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCalendar } from '../api';

export default function Calendar() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const year = month.getFullYear(); const number = month.getMonth();
  const prefix = `${year}-${String(number+1).padStart(2,'0')}`;
  const days = new Date(year,number+1,0).getDate();
  useEffect(() => {
    let active = true;
    fetchCalendar({start:`${prefix}-01`,end:`${prefix}-${String(days).padStart(2,'0')}`})
      .then(result => { if (active) { setEvents(result); setError(''); } })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [prefix, days]);
  return <div><div className="page-title"><span className="eyebrow">SCHEDULE</span><h1>Calendar</h1><p>Meeting dates and follow-up deadlines.</p></div>
    {error && <div className="alert" role="alert">{error}</div>}
    <div className="calendar-nav"><button aria-label="Previous month" className="btn-secondary" onClick={() => setMonth(new Date(year,number-1,1))}>←</button>
      <h2>{month.toLocaleString('en-IN',{month:'long',year:'numeric'})}</h2>
      <button aria-label="Next month" className="btn-secondary" onClick={() => setMonth(new Date(year,number+1,1))}>→</button></div>
    <div className="calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <b key={day}>{day}</b>)}
      {Array.from({length:new Date(year,number,1).getDay()},(_,i) => <span key={`blank${i}`} />)}
      {Array.from({length:days},(_,i) => i+1).map(day => <div className="day" key={day}><b>{day}</b>
        {events.filter(e => e.date === `${prefix}-${String(day).padStart(2,'0')}`).map(e => <Link key={e.id}
          className={`event ${e.type} ${e.status==='Completed'?'done':''}`}
          to={e.action_id ? `/meetings/${e.meeting_id}/logs/${e.action_id}` : `/meetings/${e.meeting_id}`} title={e.title}>{e.title}</Link>)}
      </div>)}
    </div></div>;
}
