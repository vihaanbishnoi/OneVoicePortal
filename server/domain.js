export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
export function field(data, key, maximum = 120, required = true) {
  const value = data[key] ?? '';
  if (
    typeof value !== 'string' ||
    value.trim().length > maximum ||
    (required && !value.trim())
  )
    fail(
      `Enter a valid ${key.replaceAll('_', ' ')} (up to ${maximum} characters)`,
    );
  return value.trim();
}
export function date(value) {
  if (value == null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail('Dates must use YYYY-MM-DD');
  return value;
}
export function email(value) {
  if (value == null || value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > 255 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
  )
    fail('Enter one valid contact email');
  return value.trim();
}
export const pick = (value, keys) =>
  Object.fromEntries(keys.split(' ').map((key) => [key, value[key] ?? null]));
export const userJson = (u, demo = null) => ({
  id: u.id,
  name: u.name,
  email: u.role === 'hr_admin' ? u.email : null,
  role: u.role,
  shared: u.role === 'hr_team',
  demo: u.role === 'demo',
  demo_session_id: demo,
});
export const messageJson = (m) =>
  pick(m, 'id sender subject body direction source sent_at recorded_at');
export function meetingJson(m) {
  return {
    ...pick(
      m,
      'id forum_type department facilitator num_participants date created_at updated_at',
    ),
    participants_list: JSON.parse(m.participants_list || '[]'),
  };
}
export function actionJson(a, meeting) {
  return {
    ...pick(
      a,
      'id meeting_id discussion_point category priority action_description contact_person contact_email owner_id status gmail_thread_id due_date created_at updated_at',
    ),
    owner_name: a.owner_name || a.user_owner_name || '',
    ...(meeting
      ? { meeting: pick(meeting, 'id date department forum_type') }
      : {}),
  };
}
export const plusDays = (when, days) =>
  new Date(Date.parse(when) + days * 86400000).toISOString().slice(0, 10);
export function periodBounds(args) {
  const period = args.period || 'all';
  if (period === 'all') return [null, null, 'all'];
  const year = Number(args.year);
  let month = 1;
  let length = 12;
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    fail('Choose a year from 2000 to 2100');
  if (period === 'quarter') {
    const q = Number(args.quarter);
    if (!Number.isInteger(q) || q < 1 || q > 4) fail('Choose quarter 1 to 4');
    month = (q - 1) * 3 + 1;
    length = 3;
  } else if (period === 'month') {
    month = Number(args.month);
    length = 1;
    if (!Number.isInteger(month) || month < 1 || month > 12)
      fail('Choose month 1 to 12');
  } else if (period !== 'year') fail('Choose all, year, quarter, or month');
  return [
    new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(year, month - 1 + length, 1)).toISOString().slice(0, 10),
    `${period}-${year}-${String(month).padStart(2, '0')}`,
  ];
}
export function csv(fields, records) {
  const cell = (value) => {
    let text =
      value == null
        ? ''
        : value instanceof Date
          ? value.toISOString()
          : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    '\ufeff' +
    [
      fields.map(cell).join(','),
      ...records.map((r) => fields.map((f) => cell(r[f])).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}
