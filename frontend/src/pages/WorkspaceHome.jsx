import { Link } from 'react-router-dom';

const cards = [
  ['/new-meeting', 'New meeting', 'Record a meeting, discussion points, and responsible people.', '01'],
  ['/meetings', 'Previous meetings', 'Revisit records and follow the progress of each action.', '02'],
  ['/reports', 'Reports & exports', 'Download meeting records and conversations as CSV files.', '03'],
  ['/notifications', 'Notifications & alerts', 'Review replies and follow-ups that need attention.', '04'],
  ['/calendar', 'Calendar', 'See meeting dates and action deadlines together.', '05'],
];

export default function WorkspaceHome({ user }) {
  return <div>
    <div className="page-title"><span className="eyebrow">ONEVOICE PORTAL</span>
      <h1>{user.demo ? 'Explore the demo' : 'Your meeting workspace'}</h1>
      <p>Record concerns, connect conversations, and keep the next action clear.</p>
    </div>
    <div className="home-card-grid">{cards.map(([path, title, description, number]) =>
      <Link className="home-card" key={path} to={path}>
        <span className="home-card-number">{number}</span><h2>{title}</h2><p>{description}</p><span className="text-link">Open →</span>
      </Link>)}</div>
    {user.role === 'hr_admin' && <div className="admin-shortcuts">
      <Link to="/activity">View recording and sign-in activity →</Link>
      <Link to="/gmail">Manage Gmail connection →</Link>
    </div>}
  </div>;
}
