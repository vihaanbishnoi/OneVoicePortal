const LOCAL_API_BASE_URL = 'http://localhost:5000/api';
const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? LOCAL_API_BASE_URL : '/api');
async function request(path, options = {}) {
  const { responseType, ...fetchOptions } = options;
  const token = localStorage.getItem('onevoice_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...fetchOptions, headers: { ...headers, ...(options.headers || {}) } });
  } catch {
    throw new Error('Unable to reach the workspace. Check your connection and try again.');
  }
  if (res.status === 401 && token && token === localStorage.getItem('onevoice_token')) {
    clearSession();
    window.dispatchEvent(new Event('onevoice-logout'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const fallback = res.status >= 500
      ? 'The workspace is temporarily unavailable. Please try again shortly.'
      : res.status === 404 && path === '/auth/demo'
        ? 'The demo is not available on this server yet. Please try again after the deployment is updated.'
        : 'Request failed. Please try again.';
    throw new Error(body.error || fallback);
  }
  return responseType === 'blob' ? res.blob() : res.json();
}
export function clearSession() {
  localStorage.removeItem('onevoice_token');
  localStorage.removeItem('onevoice_user');
}
export const login = credentials => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
export const fetchCurrentUser = () => request('/auth/me');
export const startDemo = () => request('/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const post = (path, data = {}) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const exportRecords = params => request(`/reports/export?${new URLSearchParams(params)}`, { responseType: 'blob' });
export const fetchActivity = () => request('/admin/activity');
export const fetchGmailStatus = () => request('/gmail/status');
export const startGmailConnect = () => request('/gmail/start', { headers: { 'X-Frontend-Origin': window.location.origin } });
export const disconnectGmail = () => request('/gmail/connection', { method: 'DELETE' });
export const syncGmail = () => post('/gmail/sync');
export const searchGmail = q => request(`/gmail/threads?${new URLSearchParams({ q })}`);
export const linkGmailThread = (id, threadId) => post(`/logs/${id}/gmail-link`, { thread_id: threadId });
export const createGmailDraft = (id, data) => post(`/logs/${id}/gmail-draft`, data);
export const addConversationMessage = (id, data) => post(`/logs/${id}/messages`, data);
export const generateAI = (id, data) => post(`/logs/${id}/ai`, data);
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
