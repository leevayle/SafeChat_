import { useEffect, useState } from 'react'
import { Clock, Download, LoaderCircle, Play, Trash2 } from 'lucide-react'
import { localDT } from '../dates'
import { api, del, downloadBackup, post } from '../api'
import type { BackupFile, BackupJob } from '../types'
import { Empty, ErrorBox, Modal, PageHead, Pill, Sk, SkTable, bytes, fmtDate, label, num, useFetch, useToast, type SkCol } from '../ui'

const SK: SkCol[] = [{ h: 'File', kind: 'text' }, { h: 'Scope', kind: 'pill' }, { h: 'Documents', kind: 'short' }, { h: 'Size', kind: 'short' }, { h: 'Created', kind: 'text' }, { kind: 'btns' }]

export function BackupsPage() {
  const scopes = useFetch<{ scopes: { id: string; label: string }[] }>('/admin/backups/scopes')
  const list = useFetch<{ files: BackupFile[]; jobs: BackupJob[] }>('/admin/backups')
  const [scope, setScope] = useState('full')
  const [until, setUntil] = useState(() => localDT())   // defaults to today, right now
  const [touched, setTouched] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null); const [job, setJob] = useState<BackupJob | null>(null)
  const [starting, setStarting] = useState(false); const [rm, setRm] = useState<BackupFile | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!jobId) return
    const t = setInterval(async () => {
      try {
        const j = await api<BackupJob>(`/admin/backups/jobs/${jobId}`)
        setJob(j)
        if (j.status === 'completed' || j.status === 'failed') {
          clearInterval(t); setJobId(null); void list.reload()
          toast(j.status === 'completed' ? 'Backup ready to download.' : j.error || 'Backup failed.', j.status === 'completed' ? 'ok' : 'err')
        }
      } catch { clearInterval(t) }
    }, 2000)
    return () => clearInterval(t)
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true)
    try {
      // If the cutoff was never edited, use the exact moment of the click so nothing created since the page opened is missed.
      const cutoff = touched && until ? new Date(until) : new Date()
      if (Number.isNaN(cutoff.getTime())) throw new Error('Choose a valid date and time')
      if (cutoff.getTime() > Date.now() + 60_000) throw new Error('The cutoff can’t be in the future')
      const j = await post<BackupJob>('/admin/backups', { scope, until: cutoff.toISOString() })
      if (!touched) setUntil(localDT(cutoff))
      setJob(j); setJobId(j.id)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not start backup', 'err') } finally { setStarting(false) }
  }
  const running = !!jobId

  return (
    <>
      <PageHead eyebrow="SYSTEM" title="Backups" sub="Create point-in-time archives of your data and download them securely." />
      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>New backup</h3>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}><span>What to include</span>
            {scopes.loading ? <Sk h={42} r={12} /> : <select value={scope} onChange={(e) => setScope(e.target.value)}>{(scopes.data?.scopes ?? [{ id: 'full', label: 'Full' }]).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}</label>
          <label className="field" style={{ flex: '1 1 260px' }}><span>Include data up to</span>
            <div className="row"><input type="datetime-local" value={until} max={localDT()} onChange={(e) => { setUntil(e.target.value); setTouched(true) }} />
              <button type="button" className="btn" title="Reset to the current date and time" onClick={() => { setUntil(localDT()); setTouched(false) }}><Clock size={15} />Now</button></div></label>
          <button className="btn primary" disabled={running || starting} onClick={() => void start()}>{running || starting ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}Start backup</button>
        </div>
        {job && running && <div style={{ marginTop: 16 }}><div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><b>{label(job.scope)} · {job.status}</b><small>{Math.round(job.progress ?? 0)}%</small></div><div className="progress"><i style={{ width: `${job.progress ?? 0}%` }} /></div></div>}
      </section>
      {list.error && <ErrorBox text={list.error} retry={list.reload} />}
      <div className="card">
        {list.loading ? <SkTable cols={SK} rows={4} /> : !list.data?.files.length ? <Empty text="No backups yet. Start one above." /> : (
          <div className="table-wrap"><table><thead><tr><th>File</th><th>Scope</th><th>Documents</th><th>Size</th><th>Created</th><th /></tr></thead><tbody>{list.data.files.map((f) => (
            <tr key={f.filename}><td><b className="clip" style={{ display: 'block' }}>{f.filename}</b></td><td><Pill value="mute" text={label(f.scope ?? 'full')} /></td><td>{f.document_count != null ? num(f.document_count) : '—'}</td><td>{bytes(f.size_bytes)}</td><td>{fmtDate(f.created_at)}</td>
              <td><div className="row end"><button className="btn sm" onClick={() => void downloadBackup(f.filename).catch(() => toast('Download failed', 'err'))}><Download size={14} />Download</button>
                <button className="icon-btn" aria-label={`Delete ${f.filename}`} onClick={() => setRm(f)}><Trash2 size={17} /></button></div></td></tr>))}</tbody></table></div>)}
      </div>
      {rm && (
        <Modal title="Delete backup" onClose={() => setRm(null)}>
          <div className="stack">
            <p className="muted">Permanently remove <b>{rm.filename}</b> from the server. This can’t be undone.</p>
            <div className="row end"><button className="btn ghost" onClick={() => setRm(null)}>Cancel</button>
              <button className="btn danger" onClick={() => void del(`/admin/backups/${encodeURIComponent(rm.filename)}`).then(() => { toast('Backup deleted.'); setRm(null); void list.reload() }).catch((e) => toast(e instanceof Error ? e.message : 'Delete failed', 'err'))}>Delete file</button></div>
          </div>
        </Modal>)}
    </>
  )
}
