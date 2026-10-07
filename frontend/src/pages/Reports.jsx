import { useState } from 'react';
import { exportRecords } from '../api';

export default function Reports() {
  const [period, setPeriod] = useState('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(1);
  const [month, setMonth] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const blob = await exportRecords({ period, year, quarter, month });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `onevoice-${period}-${year}.zip`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div><div className="page-title"><span className="eyebrow">RECORD EXPORT</span><h1>Reports</h1></div>
    <section className="card export-card"><h2>Export records as CSV</h2>
      <p className="left-text">Choose all records or filter by meeting date. Quarters follow the calendar year: Q1 is January–March.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <form onSubmit={download}><div className="grid-filters">
        <div><label htmlFor="export-period">Period</label><select id="export-period" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All records</option><option value="year">Year</option><option value="quarter">Quarter</option><option value="month">Month</option></select></div>
        {period !== 'all' && <div><label htmlFor="export-year">Year</label><input id="export-year" type="number" min="2000" max="2100" required value={year} onChange={e => setYear(e.target.value)} /></div>}
        {period === 'quarter' && <div><label htmlFor="export-quarter">Quarter</label><select id="export-quarter" value={quarter} onChange={e => setQuarter(e.target.value)}>{[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}</select></div>}
        {period === 'month' && <div><label htmlFor="export-month">Month</label><select id="export-month" value={month} onChange={e => setMonth(e.target.value)}>{Array.from({length:12}, (_,i) => <option key={i+1} value={i+1}>{new Date(2026,i,1).toLocaleString('en',{month:'long'})}</option>)}</select></div>}
      </div><button disabled={busy}>{busy ? 'Preparing export…' : 'Download CSV archive'}</button></form>
      <p className="left-text muted-note">ZIP contains separate CSVs for meetings, actions, follow-ups, conversations, AI outputs, and related notifications. Account credentials are excluded.</p>
    </section></div>;
}
