import { useEffect, useState } from 'react';
import { fetchGmailStatus, startGmailConnect, disconnectGmail, syncGmail } from '../api';
import { timestamp } from '../utils';

export default function GmailSettings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchGmailStatus().then(setStatus).catch(err => setError(err.message)); }, []);
  async function perform(kind) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'connect') { const result = await startGmailConnect(); window.location.assign(result.url); return; }
      if (kind === 'disconnect') { await disconnectGmail(); setNotice('The portal no longer has a saved Gmail connection.'); }
      if (kind === 'sync') { const result = await syncGmail(); setNotice(`${result.new_replies} new replies imported.`); }
      setStatus(await fetchGmailStatus());
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div>
    <div className="page-title"><span className="eyebrow">ADMIN INTEGRATION</span><h1>Gmail connection</h1>
      <p>Authorize a mailbox, then link individual email conversations to action items. Recruiter demos never access this mailbox.</p></div>
    {new URLSearchParams(window.location.search).get('gmail') === 'failed' && <div className="alert">Google authorization was not completed. Check the configured callback URL and try again.</div>}
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {status && <section className="card">
      <h2>{status.connected ? 'Gmail connected' : 'Connect your Gmail mailbox'}</h2>
      {status.connected ? <><p className="left-text">{status.mailbox}</p><p className="left-text">Last synced: {timestamp(status.last_synced_at)}</p>
        {status.last_error && <div className="alert">{status.last_error}</div>}
        <div className="button-row"><button onClick={() => perform('sync')} disabled={busy}>Sync linked conversations</button>
          <button className="btn-secondary" onClick={() => perform('disconnect')} disabled={busy}>Disconnect from portal</button></div></>
        : <><p className="left-text">{status.available ? 'Google will ask permission to read conversations and create drafts. You review and send drafts in Gmail.' : 'Gmail OAuth credentials are not configured yet. Complete the setup guide before connecting.'}</p>
          <button onClick={() => perform('connect')} disabled={busy || !status.available}>Connect Gmail</button></>}
      <p className="left-text muted-note">Linked conversations are checked periodically while the backend is running. Google sign-in for website access remains separate from mailbox authorization.</p>
    </section>}
  </div>;
}
