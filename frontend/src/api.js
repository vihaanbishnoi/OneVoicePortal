const LOCAL_API_BASE_URL = 'http://localhost:5000/api';
const LIVE_API_BASE_URL = 'https://onevoice-api-89c5.onrender.com/api';

const API_BASE = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || LOCAL_API_BASE_URL
  : import.meta.env.VITE_API_BASE_URL || LIVE_API_BASE_URL;

export async function fetchMeetings() {
  const res = await fetch(`${API_BASE}/meetings`);
  if (!res.ok) throw new Error('Failed to fetch meetings');
  return res.json();
}

export async function fetchMeeting(id) {
  const res = await fetch(`${API_BASE}/meetings/${id}`);
  if (!res.ok) throw new Error('Failed to fetch meeting details');
  return res.json();
}

export async function fetchMeetingLog(id) {
  const res = await fetch(`${API_BASE}/logs/${id}`);
  if (!res.ok) throw new Error('Failed to fetch discussion/action details');
  return res.json();
}

export async function createMeeting(data) {
  const res = await fetch(`${API_BASE}/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create meeting');
  return res.json();
}

export async function addMeetingLog(meetingId, data) {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add discussion-action log');
  return res.json();
}

export async function updateRemarks(logId, data) {
  const res = await fetch(`${API_BASE}/logs/${logId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update remarks');
  return res.json();
}

export async function searchReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/reports/search?${query}`);
  if (!res.ok) throw new Error('Failed to search reports');
  return res.json();
}

export async function exportDatabaseUrl() {
  return `${API_BASE}/reports/export`;
}
