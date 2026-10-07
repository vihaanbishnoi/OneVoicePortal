import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMeetingLog, updateRemarks, addConversationMessage, generateAI, fetchGmailStatus, searchGmail, linkGmailThread, createGmailDraft, syncGmail } from '../api';
import { timestamp } from '../utils';

export default function LogDetail({ user }) {
  const { logId } = useParams();
  const [log, setLog] = useState(null);
  const [remark, setRemark] = useState('');
  const [message, setMessage] = useState({sender:'',subject:'',body:'',direction:'incoming'});
  const [settings, setSettings] = useState({owner_name:'',contact_person:'',contact_email:'',status:'Open',due_date:''});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [gmail, setGmail] = useState(null);
  const [search, setSearch] = useState('');
  const [threads, setThreads] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState({subject:'',body:''});

  useEffect(() => {
    let active = true;
    fetchMeetingLog(logId).then(result => {
      if (!active) return;
      setLog(result);
      setSettings({owner_name:result.owner_name || '',contact_person:result.contact_person,contact_email:result.contact_email || '',status:result.status,due_date:result.due_date || ''});
      setDraft({subject:result.action_description,body:''});
    }).catch(err => { if (active) setError(err.message); });
    fetchGmailStatus().then(result => { if (active) setGmail(result); }).catch(() => {});
    const timer = setInterval(() => {
      fetchMeetingLog(logId).then(result => { if (active) setLog(result); }).catch(() => {});
    }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [logId]);

  async function refresh() { setLog(await fetchMeetingLog(logId)); }
  async function perform(key, operation) {
    setBusy(key); setError(''); setNotice('');
    try { await operation(); } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function saveRemark(event) {
    event.preventDefault();
    await perform('remark', async () => { await updateRemarks(logId,{remark:remark.trim()}); setRemark(''); await refresh(); });
  }
  async function saveMessage(event) {
    event.preventDefault();
    await perform('message', async () => { await addConversationMessage(logId,message); setMessage({sender:'',subject:'',body:'',direction:'incoming'}); await refresh(); });
  }
  async function generate(task) {
    await perform(task, async () => {
      const result = await generateAI(logId,{task,instructions});
      if (task === 'draft') {
        const match = result.content.match(/^Subject:\s*(.+)$/mi);
        setDraft({subject:match ? match[1].trim() : log.action_description,body:result.content.replace(/^Subject:[^\n]*\n?/mi,'').trim()});
      }
      await refresh();
      setNotice('AI output generated. Review it against the original messages before using it.');
    });
  }
  if (!log) return <p>{error || 'Loading action…'}</p>;
  const summary = log.ai_results?.find(result => result.task === 'summary');
  return <div>
    <Link to={`/meetings/${log.meeting_id}`} className="back-link">← Back to meeting</Link>
    <div className="detail-heading"><span className="badge badge-open">{log.category}</span><h1>Discussion & action #{log.id}</h1>
      <p>{log.forum_type} · {log.meeting_date} · {log.department}</p>
      <p className="record-timestamps">Recorded: {timestamp(log.created_at)} · Last updated: {timestamp(log.updated_at)}</p></div>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="detail-grid"><section className="card"><h3>Discussion point</h3><p>{log.discussion_point}</p></section>
      <section className="card"><h3>Requested follow-up</h3><p>{log.action_description}</p></section></div>
    <section className="card"><h3>Responsibility & progress</h3>
      <form onSubmit={event => { event.preventDefault(); perform('settings',async () => { await updateRemarks(logId,settings); await refresh(); setNotice('Action details saved.'); }); }}>
        <div className="grid-filters">
          <div><label htmlFor="action-owner">Action owner</label><input id="action-owner" type="text" value={settings.owner_name} onChange={e => setSettings({...settings,owner_name:e.target.value})} /></div>
          <div><label htmlFor="contact-name">Person to contact</label><input id="contact-name" type="text" required value={settings.contact_person} onChange={e => setSettings({...settings,contact_person:e.target.value})} /></div>
          <div><label htmlFor="contact-email">Contact email</label><input id="contact-email" type="email" value={settings.contact_email} onChange={e => setSettings({...settings,contact_email:e.target.value})} /></div>
          <div><label htmlFor="action-status">Status</label><select id="action-status" value={settings.status} onChange={e => setSettings({...settings,status:e.target.value})}>{['Open','In Progress','Completed'].map(value => <option key={value}>{value}</option>)}</select></div>
          <div><label htmlFor="action-due">Due date</label><input id="action-due" type="date" value={settings.due_date} onChange={e => setSettings({...settings,due_date:e.target.value})} /></div>
        </div><button disabled={Boolean(busy)}>Save action details</button>
      </form></section>

    <h2>Email conversation</h2>
    <p className="left-text">Read the conversation in order, import a linked Gmail thread, or paste email text.</p>
    {user.role === 'hr_admin' && <section className="card">
      <h3>Link Gmail conversation</h3>
      {gmail?.connected ? <>
        <form className="inline-form" onSubmit={event => { event.preventDefault(); perform('search',async () => setThreads(await searchGmail(search))); }}>
          <label htmlFor="gmail-search">Search your Gmail</label><input id="gmail-search" type="text" required value={search} onChange={e => setSearch(e.target.value)} placeholder="Subject, sender, or Gmail search query" />
          <button disabled={Boolean(busy)}>Search conversations</button></form>
        {threads.map(thread => <div className="thread-row" key={thread.id}><div><b>{thread.subject}</b><small>{thread.sender} · {thread.message_count} messages</small></div>
          <button className="btn-secondary" disabled={Boolean(busy) || Boolean(log.gmail_thread_id)} onClick={() => perform('link',async () => { await linkGmailThread(logId,thread.id); setThreads([]); await refresh(); setNotice('Conversation linked. New replies will be imported while the backend runs.'); })}>Link this thread</button></div>)}
        {log.gmail_thread_id && <div className="button-row"><span>Gmail conversation linked</span><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => perform('sync',async () => { await syncGmail(); await refresh(); setNotice('Conversation refreshed.'); })}>Sync now</button></div>}
      </> : <p className="left-text"><Link to="/gmail">Connect Gmail</Link> to import conversations. You can paste messages below while setup is pending.</p>}
    </section>}
    <div className="conversation-list">{log.messages?.length ? log.messages.map(item => <div className={`conversation-item ${item.direction === 'outgoing' ? 'hr' : 'owner'}`} key={item.id}>
      <span className="timeline-marker" /><article><header><div><span className="activity-role">{item.direction} · {item.source}</span><div>{item.sender || 'Sender not provided'}</div></div>
        <time>{item.sent_at ? timestamp(item.sent_at) : `Recorded ${timestamp(item.recorded_at)}`}</time></header>
        {item.subject && <h4 className="message-subject">{item.subject}</h4>}<p>{item.body}</p></article></div>) : <div className="card"><p>No email messages recorded yet.</p></div>}</div>
    <section className="card"><h3>Paste an email or response</h3><form onSubmit={saveMessage}>
      <div className="grid-filters"><div><label htmlFor="message-sender">Sender</label><input id="message-sender" type="text" value={message.sender} onChange={e => setMessage({...message,sender:e.target.value})} /></div>
        <div><label htmlFor="message-direction">Message type</label><select id="message-direction" value={message.direction} onChange={e => setMessage({...message,direction:e.target.value})}><option value="incoming">Received reply</option><option value="outgoing">Sent email</option><option value="note">Conversation note</option></select></div>
        <div><label htmlFor="message-subject">Subject</label><input id="message-subject" type="text" value={message.subject} onChange={e => setMessage({...message,subject:e.target.value})} /></div></div>
      <label htmlFor="message-body">Email text</label><textarea id="message-body" rows="5" required value={message.body} onChange={e => setMessage({...message,body:e.target.value})} />
      <button disabled={Boolean(busy)}>Record message</button></form></section>

    <section className="card ai-panel"><h2>Conversation assistant</h2>
      <p className="left-text">{user.demo ? 'Demo AI uses OpenAI. Use fictional text only; the supplied conversation is sent for generation.' : 'Private conversations use local Ollama. Generated text stays a suggestion for your review.'}</p>
      <label htmlFor="draft-instructions">Draft style or instructions (optional)</label><input id="draft-instructions" type="text" maxLength="1000" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="For example: concise, polite, ask for a progress update" />
      <div className="button-row"><button disabled={Boolean(busy)} onClick={() => generate('summary')}>{busy==='summary'?'Summarizing…':'Summarize conversation'}</button>
        <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => generate('draft')}>{busy==='draft'?'Drafting…':'Generate email draft'}</button></div>
      {summary && <div className="ai-output"><h3>Conversation summary</h3><p className="left-text muted-note">Generated {timestamp(summary.created_at)} · {summary.provider} · {summary.model}. New messages require a fresh summary.</p><pre>{summary.content}</pre></div>}
      <div className="ai-output"><h3>Review & refine your draft</h3>
        <label htmlFor="draft-subject">Subject</label><input id="draft-subject" type="text" value={draft.subject} onChange={e => setDraft({...draft,subject:e.target.value})} />
        <label htmlFor="draft-body">Email draft</label><textarea id="draft-body" rows="8" value={draft.body} onChange={e => setDraft({...draft,body:e.target.value})} placeholder="Generate a draft or write one here. Review facts and recipient before sending." />
        <div className="button-row"><button className="btn-secondary" disabled={!draft.body || Boolean(busy)} onClick={() => perform('copy',async () => { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); setNotice('Draft copied. Paste it into Gmail or your email application.'); })}>Copy draft</button>
          {user.role === 'hr_admin' && <button disabled={!draft.body || !gmail?.connected || Boolean(busy)} onClick={() => perform('draft-save',async () => { await createGmailDraft(logId,draft); await refresh(); setNotice('Draft saved in Gmail. Open Gmail drafts to review and send it.'); })}>Save draft to Gmail</button>}
          {user.role === 'hr_admin' && gmail?.connected && <a href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noreferrer">Open Gmail drafts →</a>}
        </div></div>
    </section>
    <h2>Follow-up activity</h2><div className="conversation-list">{log.history.length ? log.history.map(item => <div className="conversation-item hr" key={item.id}><span className="timeline-marker" /><article>
      <header><span className="activity-role">{item.author_type}</span><time>{timestamp(item.created_at)}</time></header><p>{item.remark}</p></article></div>) : <div className="card"><p>No follow-up remarks yet.</p></div>}</div>
    <section className="card"><h3>Record a follow-up remark</h3><form onSubmit={saveRemark}><label htmlFor="follow-up-remark">Progress or additional context</label>
      <textarea id="follow-up-remark" rows="4" required value={remark} onChange={e => setRemark(e.target.value)} /><button disabled={Boolean(busy)}>Record update</button></form></section>
  </div>;
}
