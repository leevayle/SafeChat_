import { useState } from 'react'
import { CheckCheck, LoaderCircle, Send } from 'lucide-react'
import { patch, post, qs, type Paged } from '../api'
import type { Ticket } from '../types'
import { ActionDialog, Avatar, Empty, ErrorBox, Loading, Modal, PageHead, Pager, Pill, Seg, ago, fmtDate, useFetch, useToast } from '../ui'

type F = '' | 'pending' | 'in_progress' | 'closed'

export function SupportPage() {
  const [f, setF] = useState<F>('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const { data, error, loading, reload } = useFetch<Paged<Ticket>>(`/admin/support/tickets${qs({ status: f, page, page_size: 25 })}`, 30_000)
  const ticket = data?.items.find((t) => t.id === open) ?? null
  return (
    <>
      <PageHead eyebrow="MODERATION" title="Support inbox" sub="Tickets are assigned to online admins. Superadmins see every ticket." />
      <div className="toolbar"><Seg<F> value={f} onChange={(v) => { setF(v); setPage(1) }} options={[{ id: '', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'in_progress', label: 'In progress' }, { id: 'closed', label: 'Closed' }]} /></div>
      {error && <ErrorBox text={error} retry={reload} />}
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <Empty text="Inbox zero. Nothing here." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Subject</th><th>From</th><th>Status</th><th>Assigned</th><th>Updated</th></tr></thead>
            <tbody>{data.items.map((t) => (
              <tr key={t.id} onClick={() => setOpen(t.id)} style={{ cursor: 'pointer' }}>
                <td><b className="clip" style={{ display: 'block' }}>{t.subject}</b><small className="sub clip">{t.body}</small></td>
                <td><div className="cell-user"><Avatar name={t.display_name || t.username} /><div><b>{t.display_name || t.username || 'Unknown'}</b><small>@{t.username}</small></div></div></td>
                <td><Pill value={t.status} /></td><td>{t.assigned_admin_username ? `@${t.assigned_admin_username}` : <small>Unassigned</small>}</td><td>{ago(t.updated_at)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {data && <Pager page={page} total={data.total} size={data.page_size} onPage={setPage} />}
      </div>
      {ticket && <TicketDrawer t={ticket} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </>
  )
}

function TicketDrawer({ t, onClose, onChanged }: { t: Ticket; onClose: () => void; onChanged: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'in_progress' | 'closed' | null>(null)
  const toast = useToast()
  const closed = t.status === 'closed'
  const send = async () => {
    setBusy(true)
    try { await post(`/admin/support/tickets/${t.id}/replies`, { body: body.trim() }); setBody(''); toast('Reply sent.'); onChanged() }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not send reply', 'err') } finally { setBusy(false) }
  }
  return (
    <Modal drawer title={t.subject} onClose={onClose}>
      <div className="stack">
        <div className="row wrap"><Pill value={t.status} /><small>@{t.username} · opened {fmtDate(t.created_at)}</small></div>
        <div className="thread">
          <div className="bubble"><small>@{t.username}</small><p>{t.body}</p></div>
          {t.replies.map((r) => (
            <div key={r.id} className={`bubble ${r.author_role === 'USER' ? '' : 'admin'}`}>
              <small>{r.author_role === 'USER' ? `@${t.username}` : `@${r.author_username ?? 'admin'}`} · {ago(r.created_at)}</small><p>{r.body}</p>
            </div>))}
        </div>
        {!closed && <>
          <label className="field"><span>Your reply</span><textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a clear, kind answer…" /></label>
          <div className="row wrap">
            <button className="btn primary" disabled={!body.trim() || busy} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}Send reply</button>
            {t.status !== 'in_progress' && <button className="btn" onClick={() => setStatus('in_progress')}>Mark in progress</button>}
            <button className="btn ghost" onClick={() => setStatus('closed')}><CheckCheck size={16} />Close ticket</button>
          </div></>}
      </div>
      {status && <ActionDialog title={status === 'closed' ? 'Close ticket' : 'Mark in progress'} confirm="Confirm" intro="The user will see the new status."
        onClose={() => setStatus(null)} onSubmit={async (reason) => { await patch(`/admin/support/tickets/${t.id}/status`, { status, reason }); toast('Ticket updated.'); onChanged() }} />}
    </Modal>
  )
}
