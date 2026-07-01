import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import NewMeeting from './pages/NewMeeting';
import Meetings from './pages/Meetings';
import MeetingDetail from './pages/MeetingDetail';
import LogDetail from './pages/LogDetail';
import Reports from './pages/Reports';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new-meeting" element={<NewMeeting />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/meetings/:meetingId/logs/:logId" element={<LogDetail />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
