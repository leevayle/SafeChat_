import { Component, createContext, type CSSProperties, useCallback, useContext, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, LoaderCircle, X } from 'lucide-react'
import { api } from './api'

/* ---------- formatting ---------- */
export const fmtDate = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
export const ago = (v?: string | null) => {
  if (!v) return 'never'
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return fmtDate(v).split(',')[0]
}
export const num = (n?: number | null) => (n ?? 0).toLocaleString()
export const bytes = (n?: number | null) => {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`
}
export const label = (s?: string | null) => (s ? s.replace(/_/g, ' ') : '—')

/* ---------- data hook ---------- */
export function useFetch<T>(path: string | null, every?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const load = useCallback(async (quiet = false) => {
    if (path === null) return
    const id = ++seq.current
    if (!quiet) setLoading(true)
    try {
      const d = await api<T>(path)
      if (id === seq.current) { setData(d); setError('') }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : 'Request failed')
    } finally { if (id === seq.current) setLoading(false) }
  }, [path])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!every) return
    const t = setInterval(() => void load(true), every)
    return () => clearInterval(t)
  }, [every, load])
  return { data, error, loading, reload: () => load(true) }
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; tone: 'ok' | 'err' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l, { id, text, tone }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- small components ---------- */
const TONES: Record<string, string> = {
  good: 'active paid resolved approved completed online premium',
  warn: 'pending pending_review in_progress under_review open queued running replied',
  bad: 'banned failed rejected deleted',
}
export const tone = (s?: string | null) =>
  Object.entries(TONES).find(([, v]) => v.split(' ').includes(s ?? ''))?.[0] ?? 'mute'
export const Pill = ({ value, text }: { value?: string | null; text?: string }) => (
  <span className={`pill ${tone(value)}`}>{text ?? label(value)}</span>
)

export const PageHead = ({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub: string; action?: ReactNode }) => (
  <header className="page-head">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{sub}</p></div>
    {action && <div className="page-action">{action}</div>}
  </header>
)

export const Avatar = ({ name, online }: { name?: string | null; online?: boolean }) => (
  <span className="avatar" aria-hidden>{(name || '?').trim().charAt(0).toUpperCase()}{online && <i className="dot" />}</span>
)

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export const Empty = ({ text }: { text: string }) => (<div className="empty"><Inbox size={26} /><p>{text}</p></div>)
export const ErrorBox = ({ text, retry }: { text: string; retry?: () => void }) => (
  <div className="errbox"><AlertCircle size={18} /><span>{text}</span>{retry && <button className="btn ghost sm" onClick={retry}>Retry</button>}</div>
)

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? (page - 1) * size + 1 : 0
  return (
    <div className="pager">
      <span>{from}–{Math.min(page * size, total)} of {num(total)}</span>
      <div>
        <button className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button>
        <button className="icon-btn" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

/* ---------- modal / drawer ---------- */
export function Modal({ title, onClose, children, drawer }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={drawer ? 'sheet drawer' : 'sheet'} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  )
}

/** Every mutating admin endpoint requires a `reason` (3–500 chars), so all actions share this dialog. */
export function ActionDialog({ title, intro, confirm, danger, extra, onClose, onSubmit }: {
  title: string; intro: ReactNode; confirm: string; danger?: boolean; extra?: ReactNode
  onClose: () => void; onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = reason.trim().length >= 3
  const run = async () => {
    setBusy(true); setErr('')
    try { await onSubmit(reason.trim()); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'Action failed') } finally { setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <p className="muted">{intro}</p>
        {extra}
        <label className="field"><span>Reason <small>(saved to the audit log)</small></span>
          <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you doing this?" autoFocus />
        </label>
        {err && <ErrorBox text={err} />}
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn danger' : 'btn primary'} disabled={!ok || busy} onClick={() => void run()}>
            {busy && <LoaderCircle className="spin" size={16} />}{confirm}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** One broken screen shouldn't blank the whole console. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error, i: ErrorInfo) { console.error('Screen crashed', e, i) }
  render() {
    return this.state.failed
      ? <div className="card card-pad stack"><h3>Something went wrong on this screen</h3><p className="muted">The rest of the portal is fine.</p><div className="row"><button className="btn primary" onClick={() => this.setState({ failed: false })}>Try again</button></div></div>
      : this.props.children
  }
}

/* ---------- skeletons (shimmer placeholders that mirror the real layout) ---------- */
type SkProps = { w?: number | string; h?: number | string; r?: number | string; className?: string; style?: CSSProperties }
/** One shimmering block. Decorative, so hidden from screen readers. */
export const Sk = ({ w = '100%', h = 14, r, className = '', style }: SkProps) => (
  <span aria-hidden className={`sk ${className}`} style={{ width: w, height: h, ...(r !== undefined ? { borderRadius: r } : null), ...style }} />
)
/** Wraps a skeleton so assistive tech announces one "Loading…" instead of dozens of empty boxes. */
export const Busy = ({ label = 'Loading', className, children }: { label?: string; className?: string; children: ReactNode }) => (
  <div role="status" aria-busy="true" className={className}><span className="sr-only">{label}…</span>{children}</div>
)
/** Deterministic pseudo-random width so rows look natural but never jump between renders. */
const pick = (seed: number, min: number, max: number) => min + ((seed * 37 + 11) % (max - min + 1))

export type SkKind = 'user' | 'two' | 'text' | 'short' | 'pill' | 'pillsub' | 'btns' | 'icon'
export type SkCol = { h?: string; kind: SkKind }
function skCell(kind: SkKind, seed: number): ReactNode {
  switch (kind) {
    case 'user': return <div className="cell-user"><Sk w={38} h={38} r={12} className="flex-none" /><div style={{ display: 'grid', gap: 6, flex: 1 }}><Sk w={pick(seed, 90, 150)} h={13} /><Sk w={pick(seed + 3, 60, 100)} h={10} /></div></div>
    case 'two': return <div style={{ display: 'grid', gap: 6 }}><Sk w={pick(seed, 100, 190)} h={13} /><Sk w={pick(seed + 5, 70, 130)} h={10} /></div>
    case 'text': return <Sk w={pick(seed, 110, 190)} h={13} />
    case 'short': return <Sk w={pick(seed, 50, 90)} h={13} />
    case 'pill': return <Sk w={pick(seed, 56, 86)} h={22} r={99} />
    case 'pillsub': return <div style={{ display: 'grid', gap: 6 }}><Sk w={62} h={22} r={99} /><Sk w={pick(seed, 50, 80)} h={10} /></div>
    case 'btns': return <div className="row end"><Sk w={64} h={32} r={10} /><Sk w={64} h={32} r={10} /></div>
    case 'icon': return <Sk w={34} h={34} r={11} />
  }
}
/** Table skeleton: real column headers stay visible, only the data cells shimmer. */
export function SkTable({ cols, rows = 6 }: { cols: SkCol[]; rows?: number }) {
  return (
    <Busy label="Loading data" className="table-wrap sk-wrap">
      <table>
        <thead><tr>{cols.map((c, i) => <th key={i}>{c.h}</th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }, (_, r) => (
          <tr key={r}>{cols.map((c, i) => <td key={i}>{skCell(c.kind, r * 7 + i * 3)}</td>)}</tr>))}</tbody>
      </table>
    </Busy>
  )
}
export const SkPager = () => (
  <div className="pager" aria-hidden><Sk w={92} h={12} /><div className="row" style={{ gap: 4 }}><Sk w={34} h={34} r={11} /><Sk w={34} h={34} r={11} /></div></div>
)
