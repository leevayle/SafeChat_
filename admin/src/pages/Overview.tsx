import { CreditCard, Flag, LifeBuoy, RefreshCw, UserCheck, UserCog, Users, Wifi, Crown } from 'lucide-react'
import type { Go } from '../App'
import type { Health, Overview as O } from '../types'
import { ErrorBox, Loading, PageHead, Pill, ago, num } from '../ui'

export function Overview({ ov, health, error, loading, reload, go }: { ov: O | null; health: Health | null; error: string; loading: boolean; reload: () => void; go: Go }) {
  const head = <PageHead eyebrow="MONITORING" title="Overview" sub="Your platform at a glance." action={<button className="btn" onClick={reload}><RefreshCw size={16} />Refresh</button>} />
  if (!ov) return <>{head}{error ? <ErrorBox text={error} retry={reload} /> : loading ? <Loading /> : null}</>
  const u = ov.users
  const parts = [
    { k: 'Active', v: u.active, c: 'var(--good)' }, { k: 'Pending review', v: u.pending_review, c: 'var(--orange)' },
    { k: 'Deactivated', v: u.deactivated, c: 'var(--blue)' }, { k: 'Banned', v: u.banned, c: 'var(--red)' },
  ]
  const total = Math.max(1, parts.reduce((s, p) => s + p.v, 0))
  const premiumPct = u.total ? Math.round((u.premium / u.total) * 100) : 0
  const C = 2 * Math.PI * 42
  return (
    <>
      {head}
      <div className="grid g4">
        <div className="card kpi"><div className="chip"><Users size={19} /></div><b>{num(u.total)}</b><span>Total users</span></div>
        <div className="card kpi g"><div className="chip"><Wifi size={19} /></div><b>{num(u.online)}</b><span>Online now</span></div>
        <div className="card kpi o"><div className="chip"><Crown size={19} /></div><b>{num(u.premium)}</b><span>Premium members</span></div>
        <div className="card kpi b"><div className="chip"><CreditCard size={19} /></div><b>{num(ov.payments.paid_last_30_days)}</b><span>Paid in last 30 days</span></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <h3>Account status</h3>
          <div className="stackbar" role="img" aria-label="Account status distribution">
            {parts.filter((p) => p.v > 0).map((p) => <i key={p.k} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} title={`${p.k}: ${p.v}`} />)}
          </div>
          <div className="legend">{parts.map((p) => <div key={p.k}><i style={{ background: p.c }} />{p.k}<b>{num(p.v)}</b></div>)}</div>
        </section>
        <section className="card card-pad">
          <h3>Plans</h3>
          <div className="row" style={{ gap: 20 }}>
            <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`${premiumPct}% premium`}>
              <circle cx="55" cy="55" r="42" fill="none" stroke="var(--surface-2)" strokeWidth="14" />
              <circle cx="55" cy="55" r="42" fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(premiumPct / 100) * C} ${C}`} transform="rotate(-90 55 55)" />
              <text x="55" y="61" textAnchor="middle" style={{ font: '700 20px Poppins, sans-serif', fill: 'var(--text)' }}>{premiumPct}%</text>
            </svg>
            <div className="legend" style={{ gridTemplateColumns: '1fr', margin: 0, flex: 1 }}>
              <div><i style={{ background: 'var(--accent)' }} />Premium<b>{num(u.premium)}</b></div>
              <div><i style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />Pro<b>{num(u.pro)}</b></div>
            </div>
          </div>
        </section>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <h3>Needs attention</h3>
          <div className="attn">
            <button onClick={() => go('support')}><LifeBuoy size={18} />Open support tickets<b>{num(ov.support_tickets_open)}</b></button>
            <button onClick={() => go('reports')}><Flag size={18} />Open reports<b>{num(ov.reports_open)}</b></button>
            <button onClick={() => go('users', { status: 'pending_review' })}><UserCheck size={18} />Accounts pending review<b>{num(u.pending_review)}</b></button>
            <button onClick={() => go('access')}><UserCog size={18} />Admin access requests<b>→</b></button>
          </div>
        </section>
        <section className="card card-pad">
          <h3>System health</h3>
          <div className="health">
            <div>API<Pill value={health?.api} text={health?.api ?? '…'} /></div>
            <div>MongoDB<Pill value={health?.mongodb} text={health?.mongodb ?? '…'} /></div>
            <small>Last checked {ago(health?.checked_at)}</small>
          </div>
        </section>
      </div>
    </>
  )
}
