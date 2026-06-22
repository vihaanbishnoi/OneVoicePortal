const API_BASE = 'http://localhost:5000/api';

export async function fetchMeetings() {
  const res = await fetch(`${API_BASE}/meetings`);
  if (!res.ok) throw new Error('Failed to fetch meetings');
  return res.json();
}

export async function fetchMeeting(id) {
  const res = await fetch(`${API_BASE}/meetings/${id}`);
  if (!res.ok) throw new Error('Failed to fetch meeting');
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

export async function addDiscussion(meetingId, data) {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/discussions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add discussion');
  return res.json();
}

export async function addAction(meetingId, data) {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add action');
  return res.json();
}

export async function updateActionStatus(actionId, status) {
  const res = await fetch(`${API_BASE}/actions/${actionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update action status');
  return res.json();
}

export async function fetchActions() {
  const res = await fetch(`${API_BASE}/actions`);
  if (!res.ok) throw new Error('Failed to fetch action items');
  return res.json();
}

export async function generateMOM(meetingId) {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/generate-mom`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to generate MOM');
  return res.json();
}

export async function generateSummary(meetingId) {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/generate-summary`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to generate summary');
  return res.json();
}

export async function analyzeSentiment(dpId) {
  const res = await fetch(`${API_BASE}/discussions/${dpId}/sentiment`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to analyze sentiment');
  return res.json();
}

export async function fetchInsights(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/reports/insights?${query}`);
  if (!res.ok) throw new Error('Failed to fetch insights');
  return res.json();
}

export async function searchReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/reports/search?${query}`);
  if (!res.ok) throw new Error('Failed to search reports');
  return res.json();
}
