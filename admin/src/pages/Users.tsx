import { useEffect, useState } from 'react'
import { Ban, Copy, Crown, KeyRound, LogOut, MoreHorizontal, Power, Search, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react'
import { patch, post, qs, type Admin, type Paged } from '../api'
import type { UserRow } from '../types'
import { ActionDialog, Avatar, Empty, ErrorBox, Modal, PageHead, Pager, Pill, SkPager, SkTable, ago, fmtDate, useFetch, useToast, type SkCol } from '../ui'

const SK: SkCol[] = [{ h: 'User', kind: 'user' }, { h: 'Contact', kind: 'two' }, { h: 'Role', kind: 'pill' }, { h: 'Status', kind: 'pill' }, { h: 'Plan', kind: 'pillsub' }, { h: 'Joined', kind: 'short' }, { h: 'Last seen', kind: 'short' }, { kind: 'icon' }]

type Act = { kind: 'status'; to: 'active' | 'deactivated' | 'banned' } | { kind: 'plan' } | { kind: 'sessions' } | { kind: 'reset' } | { kind: 'request-admin' } | { kind: 'revoke-admin' }

export function UsersPage({ admin, initialStatus }: { admin: Admin; initialStatus?: string }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [status, setStatus] = useState(initialStatus ?? '')
  const [plan, setPlan] = useState('')
  const [page, setPage] = useState(1)
  const [act, setAct] = useState<{ user: UserRow; a: Act } | null>(null)
  const [secret, setSecret] = useState<{ username: string; pw: string } | null>(null)
  const toast = useToast()
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data, error, loading, reload } = useFetch<Paged<UserRow>>(`/admin/users${qs({ q: dq, status, plan, page, page_size: 25 })}`)

  const submit = async (reason: string, planArgs?: { plan: 'pro' | 'premium'; days: number }) => {
    if (!act) return
    const { user: u, a } = act
    if (a.kind === 'status') await patch(`/admin/users/${u.id}/status${qs({ status: a.to })}`, { reason }) // status is a query param, reason is the body
    if (a.kind === 'plan' && planArgs) await patch(`/admin/users/${u.id}/subscription`, { ...planArgs, reason })
    if (a.kind === 'sessions') await post(`/admin/users/${u.id}/revoke-sessions`, { reason })
    if (a.kind === 'revoke-admin') await post(`/admin/users/${u.id}/revoke-admin`, { reason })
    if (a.kind === 'request-admin') await post('/admin/role-requests', { user_id: u.id, reason })
    if (a.kind === 'reset') {
      const r = await post<{ temporary_password: string }>('/admin/users/reset-password', { username: u.username, reason })
      setSecret({ username: u.username, pw: r.temporary_password })
    }
    toast('Done — recorded in the audit log.')
    void reload()
  }

  return (
    <>
      <PageHead eyebrow="PEOPLE" title="Users" sub="Search accounts, manage status and plans, and handle account recovery." />
      <div className="toolbar">
        <div className="search"><Search size={18} /><input placeholder="Search name, username, email or phone" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="pending_review">Pending review</option>
          <option value="deactivated">Deactivated</option><option value="banned">Banned</option><option value="deleted">Deleted</option>
        </select>
        <select aria-label="Plan" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1) }}>
          <option value="">All plans</option><option value="premium">Premium</option><option value="pro">Pro</option>
        </select>
      </div>
      {error && <ErrorBox text={error} retry={reload} />}
      <div className="card">
        {loading ? <SkTable cols={SK} rows={8} /> : !data?.items.length ? <Empty text="No users match these filters." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>User</th><th>Contact</th><th>Role</th><th>Status</th><th>Plan</th><th>Joined</th><th>Last seen</th><th /></tr></thead>
            <tbody>{data.items.map((u) => (
              <tr key={u.id}>
                <td><div className="cell-user"><Avatar name={u.display_name || u.username} online={u.online} /><div><b>{u.display_name || u.username}</b><small>@{u.username}</small></div></div></td>
                <td>{u.phone_number || '—'}<small className="sub">{u.email || ''}</small></td>
                <td><Pill value={u.account_role === 'USER' ? 'mute' : 'approved'} text={u.account_role.replace('_', ' ').toLowerCase()} /></td>
                <td><Pill value={u.account_status} /></td>
                <td><Pill value={u.subscription_plan === 'premium' ? 'premium' : 'pro'} text={u.subscription_plan} />{u.premium_expires_at && <small className="sub">until {fmtDate(u.premium_expires_at).split(',')[0]}</small>}</td>
                <td>{fmtDate(u.created_at).split(',')[0]}</td>
                <td>{u.online ? 'Online' : ago(u.last_seen)}</td>
                <td><RowMenu admin={admin} u={u} onPick={(a) => setAct({ user: u, a })} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {loading ? <SkPager /> : data && <Pager page={page} total={data.total} size={data.page_size} onPage={setPage} />}
      </div>
      {act && <UserAction act={act} onClose={() => setAct(null)} onSubmit={submit} />}
      {secret && (
        <Modal title="Temporary password" onClose={() => setSecret(null)}>
          <div className="stack">
            <p className="muted">Share this with <b>@{secret.username}</b> over a secure channel. It is shown only once and all their sessions were signed out.</p>
            <div className="secret"><code>{secret.pw}</code><button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(secret.pw); toast('Copied') }}><Copy size={14} />Copy</button></div>
            <div className="row end"><button className="btn primary" onClick={() => setSecret(null)}>Done</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}

function RowMenu({ admin, u, onPick }: { admin: Admin; u: UserRow; onPick: (a: Act) => void }) {
  const [open, setOpen] = useState(false)
  const sup = admin.role === 'SUPER_ADMIN'
  const manageable = sup ? u.account_role !== 'SUPER_ADMIN' : !['ADMIN', 'SUPER_ADMIN'].includes(u.account_role)
  if (!manageable || u.username === admin.username) return <small>—</small>
  const pick = (a: Act) => { setOpen(false); onPick(a) }
  return (
    <div className="menu-wrap">
      <button className="icon-btn" aria-label={`Actions for ${u.username}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}><MoreHorizontal size={18} /></button>
      {open && <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />
        <div className="menu" role="menu">
          {u.account_status !== 'active' && <button onClick={() => pick({ kind: 'status', to: 'active' })}><UserCheck size={16} />Activate account</button>}
          {u.account_status !== 'deactivated' && <button onClick={() => pick({ kind: 'status', to: 'deactivated' })}><Power size={16} />Deactivate</button>}
          <button onClick={() => pick({ kind: 'plan' })}><Crown size={16} />Grant plan</button>
          <button onClick={() => pick({ kind: 'sessions' })}><LogOut size={16} />Sign out everywhere</button>
          <button onClick={() => pick({ kind: 'reset' })}><KeyRound size={16} />Reset password</button>
          {['USER', 'MODERATOR'].includes(u.account_role) && (
            <button onClick={() => pick({ kind: 'request-admin' })}><ShieldCheck size={16} />Request admin access</button>)}
          {sup && u.account_role === 'ADMIN' && <button className="dng" onClick={() => pick({ kind: 'revoke-admin' })}><ShieldOff size={16} />Revoke admin</button>}
          {u.account_status !== 'banned' && <><hr /><button className="dng" onClick={() => pick({ kind: 'status', to: 'banned' })}><Ban size={16} />Ban account</button></>}
        </div>
      </>}
    </div>
  )
}

function UserAction({ act, onClose, onSubmit }: { act: { user: UserRow; a: Act }; onClose: () => void; onSubmit: (reason: string, planArgs?: { plan: 'pro' | 'premium'; days: number }) => Promise<void> }) {
  const { user: u, a } = act
  const [planSel, setPlanSel] = useState<'pro' | 'premium'>('premium')
  const [days, setDays] = useState(30)
  const who = <b>@{u.username}</b>
  if (a.kind === 'plan') {
    return (
      <ActionDialog title="Grant plan" confirm="Apply plan" intro={<>Change the subscription for {who}.</>} onClose={onClose}
        extra={<div className="row">
          <label className="field" style={{ flex: 1 }}><span>Plan</span><select value={planSel} onChange={(e) => setPlanSel(e.target.value as 'pro' | 'premium')}><option value="premium">Premium</option><option value="pro">Pro</option></select></label>
          <label className="field" style={{ flex: 1 }}><span>Days (1–3650)</span><input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.min(3650, Math.max(1, Number(e.target.value) || 1)))} /></label>
        </div>}
        onSubmit={(reason) => onSubmit(reason, { plan: planSel, days })} />
    )
  }
  const copy: Record<string, [string, string, string, boolean]> = {
    status: [a.kind === 'status' && a.to === 'banned' ? 'Ban account' : a.kind === 'status' && a.to === 'active' ? 'Activate account' : 'Deactivate account', 'Confirm', a.kind === 'status' && a.to === 'banned' ? 'They will lose access immediately.' : 'This changes whether they can sign in.', a.kind === 'status' && a.to === 'banned'],
    sessions: ['Sign out everywhere', 'Sign out', 'Revokes every active session for this account.', false],
    reset: ['Reset password', 'Reset password', 'Generates a one-time temporary password and signs them out of every device.', false],
    'request-admin': ['Request admin access', 'Submit request', 'A superadmin must approve this before the role changes.', false],
    'revoke-admin': ['Revoke admin access', 'Revoke', 'They will immediately lose administrator rights.', true],
  }
  const [title, confirm, text, danger] = copy[a.kind]
  return <ActionDialog title={title} confirm={confirm} danger={danger} intro={<>{text} Target: {who}.</>} onClose={onClose} onSubmit={onSubmit} />
}
