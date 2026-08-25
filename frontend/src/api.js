const LOCAL_API_BASE_URL = 'http://localhost:5000/api';
const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? LOCAL_API_BASE_URL : '/api');
const headers = () => localStorage.getItem('onevoice_token') ? { Authorization: `Bearer ${localStorage.getItem('onevoice_token')}` } : {};
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (res.status === 401) { localStorage.clear(); window.dispatchEvent(new Event('onevoice-logout')); }
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Request failed'); }
  return res.json();
}
export const login = (email, password) => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
export const fetchDashboard = () => request('/dashboard');
export const fetchCalendar = (params = {}) => request(`/calendar?${new URLSearchParams(params)}`);
export const fetchNotifications = () => request('/notifications');
export const readNotification = id => request(`/notifications/${id}/read`, { method: 'POST' });
export const fetchActions = () => request('/actions');
export const fetchUsers = () => request('/users');
export const fetchSummary = () => request('/reports/summary');
export const fetchMeetings = () => request('/meetings');
export const fetchMeeting = id => request(`/meetings/${id}`);
export const fetchMeetingLog = id => request(`/logs/${id}`);
export const createMeeting = data => request('/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const addMeetingLog = (meetingId, data) => request(`/meetings/${meetingId}/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const updateRemarks = (logId, data) => request(`/logs/${logId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const searchReports = () => fetchMeetings();
