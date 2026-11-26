import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { api, fetchAll, qs, type Admin, type Paged } from '../api'
import { dayEnd, dayStart, presetRange, ymd, type Preset } from '../dates'
import type { Col, Spec } from '../export'
import { ExportBar } from '../ExportBar'
import type { AuditRow } from '../types'
import { Empty, ErrorBox, PageHead, Pager, Pill, Seg, SkPager, SkTable, fmtDate, label, type SkCol } from '../ui'

const PAGE = 50
const cols: Col<AuditRow>[] = [
  { header: 'When', value: (a) => fmtDate(a.timestamp) },
  { header: 'Actor', value: (a) => (a.actor_username ? `@${a.actor_username}` : '') },
  { header: 'Role', value: (a) => label(a.actor_role?.toLowerCase()) },
  { header: 'Action', value: (a) => label(a.action) },
  { header: 'Resource', value: (a) => label(a.resource_type) },
  { header: 'Resource ID', value: (a) => a.resource_id },
  { header: 'Details', value: (a) => (a.metadata && Object.keys(a.metadata).length ? JSON.stringify(a.metadata) : '') },
]
const SK: SkCol[] = [{ h: 'When', kind: 'text' }, { h: 'Actor', kind: 'two' }, { h: 'Action', kind: 'pill' }, { h: 'Resource', kind: 'two' }, { kind: 'btns' }]
const OPTIONS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'week', label: 'This week' }, { id: '7d', label: 'Last 7 days' },
  { id: 'month', label: 'This month' }, { id: 'latest', label: 'Latest 50' }, { id: 'custom', label: 'Custom' },
]
const nice = (s: string) => dayStart(s).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

export function AuditPage({ admin }: { admin: Admin }) {
  const [preset, setPreset] = useState<Preset>('week')            // smart default: this week (Mon → today)
  const [range, setRange] = useState(() => presetRange('week'))
  const [rows, setRows] = useState<AuditRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const seq = useRef(0)

  // "Latest 50" has no user range: show the dates those 50 rows actually span.
  const span = useMemo(() => {
    const t = rows.map((r) => new Date(r.timestamp ?? '').getTime()).filter((n) => !Number.isNaN(n))
    return t.length ? { from: ymd(new Date(Math.min(...t))), to: ymd(new Date(Math.max(...t))) } : presetRange('today')
  }, [rows])
  const shown = preset === 'latest' ? span : range
  const invalid = preset !== 'latest' && range.from > range.to
  const key = preset === 'latest' ? 'latest' : `${range.from}|${range.to}`

  const load = async () => {
    if (invalid) return
    const id = ++seq.current
    setLoading(true); setError('')
    try {
      if (preset === 'latest') {
        const d = await api<Paged<AuditRow>>(`/admin/audit${qs({ page: 1, page_size: PAGE })}`)
        if (id === seq.current) { setRows(d.items); setTruncated(false) }
      } else {
        const from = dayStart(range.from).getTime(); const to = dayEnd(range.to).getTime()
        const t = (r: AuditRow) => new Date(r.timestamp ?? '').getTime()
        const out = await fetchAll<AuditRow>((p) => `/admin/audit${qs({ page: p, page_size: 100 })}`, { cap: 30, stop: (r) => t(r) < from, keep: (r) => t(r) <= to })
        if (id === seq.current) { setRows(out.rows); setTruncated(out.truncated) }
      }
      if (id === seq.current) setPage(1)
    } catch (e) { if (id === seq.current) setError(e instanceof Error ? e.message : 'Could not load the audit log') }
    finally { if (id === seq.current) setLoading(false) }
  }
  useEffect(() => { void load() }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (field: 'from' | 'to', v: string) => {
    if (!v) return
    setRange({ ...shown, [field]: v }); setPreset('custom'); setOpen(null)
  }
  const pick = (p: Preset) => {
    setPreset(p); setOpen(null)
    if (p !== 'latest' && p !== 'custom') setRange(presetRange(p))
  }
  const spec = (): Spec<AuditRow> => ({
    title: 'SafeChat audit log',
    subtitle: `${nice(shown.from)} – ${nice(shown.to)} · ${rows.length.toLocaleString()} entries${truncated ? ' (newest entries only)' : ''} · Exported by @${admin.username} on ${new Date().toLocaleString()}`,
    filename: `safechat-audit_${shown.from}_to_${shown.to}`, cols, rows,
  })
  const slice = rows.slice((page - 1) * PAGE, page * PAGE)

  return (
    <>
      <PageHead eyebrow="SYSTEM" title="Audit log" sub="Every administrative action, newest first." action={<ExportBar spec={spec} disabled={loading || !rows.length} />} />
      <div className="toolbar">
        <Seg<Preset> value={preset} onChange={pick} options={OPTIONS} />
        <div className="row range" role="group" aria-label="Date range">
          <CalendarRange size={18} className="muted" />
          <label className="field compact"><span>From</span><input type="date" value={shown.from} max={ymd()} onChange={(e) => edit('from', e.target.value)} /></label>
          <label className="field compact"><span>To</span><input type="date" value={shown.to} max={ymd()} onChange={(e) => edit('to', e.target.value)} /></label>
        </div>
      </div>
      {invalid && <ErrorBox text="“From” must be on or before “To”." />}
      {error && <ErrorBox text={error} retry={() => void load()} />}
      {truncated && <div className="callout"><CalendarRange size={20} /><div><b>Showing the newest {rows.length.toLocaleString()} entries in this range</b><p>Narrow the dates to see older entries.</p></div></div>}
      <div className="card">
        {loading ? <SkTable cols={SK} rows={8} /> : !rows.length ? <Empty text={preset === 'latest' ? 'No audit entries yet.' : 'No activity in this date range.'} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th /></tr></thead>
            <tbody>{slice.map((a) => (
              <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.timestamp)}</td>
                <td><b>@{a.actor_username ?? '—'}</b><small className="sub">{label(a.actor_role?.toLowerCase())}</small></td>
                <td><Pill value="mute" text={label(a.action)} /></td>
                <td>{label(a.resource_type)}<small className="sub clip">{a.resource_id}</small>{open === a.id && <pre className="meta">{JSON.stringify(a.metadata, null, 2)}</pre>}</td>
                <td><button className="btn sm ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Details'}</button></td></tr>))}</tbody>
          </table></div>
        )}
        {loading ? <SkPager /> : rows.length > 0 && <Pager page={page} total={rows.length} size={PAGE} onPage={setPage} />}
      </div>
    </>
  )
}
