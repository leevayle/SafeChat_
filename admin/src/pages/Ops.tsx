import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchAll, patch, post, qs, type Admin, type Paged } from '../api'
import type { Col, Spec } from '../export'
import { ExportBar } from '../ExportBar'
import type { Payment, Report, RoleRequest } from '../types'
import { ActionDialog, Empty, ErrorBox, Loading, PageHead, Pager, Pill, Seg, ago, fmtDate, label, num, useFetch, useToast } from '../ui'

function Shell<T>({ d, e, l, r, empty, children }: { d: Paged<T> | null; e: string; l: boolean; r: () => void; empty: string; children: (items: T[]) => React.ReactNode }) {
  return <>{e && <ErrorBox text={e} retry={r} />}<div className="card">{l && !d ? <Loading /> : !d?.items.length ? <Empty text={empty} /> : <div className="table-wrap">{children(d.items)}</div>}</div></>
}

/* ---------- Reports ---------- */
export function ReportsPage() {
  const [f, setF] = useState(''); const [page, setPage] = useState(1)
  const [act, setAct] = useState<{ r: Report; to: 'under_review' | 'resolved' | 'dismissed' } | null>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useFetch<Paged<Report>>(`/admin/reports${qs({ status: f, page, page_size: 25 })}`, 30_000)
  return (
    <>
      <PageHead eyebrow="MODERATION" title="Reports" sub="Content and account reports submitted by users." />
      <div className="toolbar"><Seg value={f} onChange={(v) => { setF(v); setPage(1) }} options={[{ id: '', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'under_review', label: 'Under review' }, { id: 'resolved', label: 'Resolved' }, { id: 'dismissed', label: 'Dismissed' }]} /></div>
      <Shell d={data} e={error} l={loading} r={reload} empty="No reports in this view.">{(items) => (
        <table><thead><tr><th>Target</th><th>Reason</th><th>Status</th><th>Reported</th><th /></tr></thead><tbody>{items.map((r) => (
          <tr key={r.id}><td><b>{label(r.target_type)}</b><small className="sub">{r.target_id}</small></td><td><span className="clip" style={{ display: 'block' }}>{r.reason || '—'}</span></td>
            <td><Pill value={r.status} /></td><td>{ago(r.created_at)}</td>
            <td><div className="row end">{r.status !== 'under_review' && r.status !== 'resolved' && r.status !== 'dismissed' && <button className="btn sm" onClick={() => setAct({ r, to: 'under_review' })}>Review</button>}
              {r.status !== 'resolved' && <button className="btn sm primary" onClick={() => setAct({ r, to: 'resolved' })}>Resolve</button>}
              {r.status !== 'dismissed' && <button className="btn sm ghost" onClick={() => setAct({ r, to: 'dismissed' })}>Dismiss</button>}</div></td></tr>))}</tbody></table>)}</Shell>
      {data && <div className="card" style={{ marginTop: 12 }}><Pager page={page} total={data.total} size={data.page_size} onPage={setPage} /></div>}
      {act && <ActionDialog title={`${label(act.to)} report`} confirm="Confirm" intro="Add a short note for the audit trail." onClose={() => setAct(null)}
        onSubmit={async (reason) => { await patch(`/admin/reports/${act.r.id}`, { status: act.to, reason }); toast('Report updated.'); void reload() }} />}
    </>
  )
}

/* ---------- Payments ---------- */
const payCols: Col<Payment>[] = [
  { header: 'Created', value: (p) => fmtDate(p.created_at) }, { header: 'User', value: (p) => (p.username ? `@${p.username}` : '') },
  { header: 'Plan', value: (p) => p.plan }, { header: 'Amount', value: (p) => p.amount }, { header: 'Currency', value: (p) => p.currency },
  { header: 'Provider', value: (p) => p.provider }, { header: 'Status', value: (p) => p.status }, { header: 'Paid at', value: (p) => (p.paid_at ? fmtDate(p.paid_at) : '') },
]
export function PaymentsPage() {
  const [f, setF] = useState(''); const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useFetch<Paged<Payment>>(`/admin/payments${qs({ status: f, page, page_size: 25 })}`)
  const paid = data?.items.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0) ?? 0
  return (
    <>
      <PageHead eyebrow="BUSINESS" title="Payments" sub="Subscription payments and their provider status." action={<div className="row wrap">{data && <span className="pill good">{num(paid)} {data.items[0]?.currency ?? 'KES'} paid on this page</span>}<ExportBar disabled={!data?.total} spec={async (): Promise<Spec<Payment>> => {
        const { rows, truncated } = await fetchAll<Payment>((p) => `/admin/payments${qs({ status: f, page: p, page_size: 100 })}`)
        return { title: 'SafeChat payments', subtitle: `${f ? `Status: ${f} · ` : ''}${rows.length.toLocaleString()} payments${truncated ? ' (newest only)' : ''} · ${new Date().toLocaleString()}`, filename: `safechat-payments${f ? '_' + f : ''}`, cols: payCols, rows }
      }} /></div>} />
      <div className="toolbar"><Seg value={f} onChange={(v) => { setF(v); setPage(1) }} options={[{ id: '', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'failed', label: 'Failed' }]} /></div>
      <Shell d={data} e={error} l={loading} r={reload} empty="No payments yet.">{(items) => (
        <table><thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Provider</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead><tbody>{items.map((p) => (
          <tr key={p.id}><td><b>{p.display_name || p.username || '—'}</b><small className="sub">@{p.username}</small></td><td style={{ textTransform: 'capitalize' }}>{p.plan}</td>
            <td><b>{num(p.amount)}</b> <small>{p.currency}</small></td><td style={{ textTransform: 'capitalize' }}>{p.provider}</td><td><Pill value={p.status} /></td><td>{fmtDate(p.created_at)}</td><td>{p.paid_at ? fmtDate(p.paid_at) : '—'}</td></tr>))}</tbody></table>)}</Shell>
      {data && <div className="card" style={{ marginTop: 12 }}><Pager page={page} total={data.total} size={data.page_size} onPage={setPage} /></div>}
    </>
  )
}

/* ---------- Access control ---------- */
export function AccessPage({ admin }: { admin: Admin }) {
  const [f, setF] = useState('pending')
  const [act, setAct] = useState<{ r: RoleRequest; kind: 'approve' | 'reject' } | null>(null)
  const toast = useToast()
  const { data, error, loading, reload } = useFetch<RoleRequest[]>(`/admin/role-requests${qs({ status: f })}`)
  const sup = admin.role === 'SUPER_ADMIN'
  return (
    <>
      <PageHead eyebrow="PEOPLE" title="Access control" sub="Administrator access is granted only after superadmin review." />
      <div className="callout"><ShieldCheck size={20} /><div><b>Two-person control</b><p>Admins can request access for a user; only a superadmin can approve or reject it. Every decision is audited.</p></div></div>
      <div className="toolbar"><Seg value={f} onChange={setF} options={[{ id: 'pending', label: 'Pending' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: '', label: 'All' }]} /></div>
      {error && <ErrorBox text={error} retry={reload} />}
      <div className="card">{loading && !data ? <Loading /> : !data?.length ? <Empty text="No requests in this view." /> : (
        <div className="table-wrap"><table><thead><tr><th>User</th><th>Requested by</th><th>Reason</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{data.map((r) => (
          <tr key={r.id}><td><b>@{r.target_username}</b><small className="sub">{(r.target_role ?? '').toLowerCase()}</small></td><td>@{r.requester_username}</td>
            <td><span className="clip" style={{ display: 'block' }}>{r.reason}</span>{r.decision_reason && <small className="sub">Decision: {r.decision_reason}</small>}</td>
            <td><Pill value={r.status} /></td><td>{ago(r.created_at)}</td>
            <td>{sup && r.status === 'pending' ? <div className="row end"><button className="btn sm" onClick={() => setAct({ r, kind: 'reject' })}>Reject</button><button className="btn sm primary" onClick={() => setAct({ r, kind: 'approve' })}>Approve</button></div> : <small>{r.status === 'pending' ? 'Awaiting superadmin' : fmtDate(r.decided_at)}</small>}</td></tr>))}</tbody></table></div>)}</div>
      {act && <ActionDialog title={act.kind === 'approve' ? 'Approve admin access' : 'Reject request'} danger={act.kind === 'reject'} confirm={act.kind === 'approve' ? 'Grant admin' : 'Reject'}
        intro={<>Request for <b>@{act.r.target_username}</b>.</>} onClose={() => setAct(null)}
        onSubmit={async (reason) => { await post(`/admin/role-requests/${act.r.id}/${act.kind}`, { reason }); toast('Decision recorded.'); void reload() }} />}
    </>
  )
}
