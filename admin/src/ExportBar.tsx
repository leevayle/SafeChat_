import { useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText, LoaderCircle, Printer, Braces, Table2 } from 'lucide-react'
import { FORMATS, exportRows, printRows, type Fmt, type Spec } from './export'
import { useToast } from './ui'

const ICON = { xlsx: FileSpreadsheet, csv: Table2, pdf: FileText, json: Braces } as const

/** Export (CSV / Excel / PDF / JSON) + Print. `spec` may fetch data lazily. */
export function ExportBar<T>({ spec, disabled }: { spec: () => Promise<Spec<T>> | Spec<T>; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Fmt | 'print' | null>(null)
  const toast = useToast()
  const run = async (what: Fmt | 'print') => {
    setOpen(false); setBusy(what)
    try {
      const s = await spec()
      if (!s.rows.length) { toast('There is nothing to export for this selection.', 'err'); return }
      if (what === 'print') printRows(s)
      else { await exportRows(what, s); toast(`Exported ${s.rows.length.toLocaleString()} rows as ${what.toUpperCase()}.`) }
    } catch (e) { toast(e instanceof Error ? e.message : 'Export failed', 'err') } finally { setBusy(null) }
  }
  return (
    <div className="row">
      <div className="menu-wrap">
        <button className="btn" disabled={disabled || !!busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {busy && busy !== 'print' ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}Export<ChevronDown size={15} />
        </button>
        {open && <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            {FORMATS.map((f) => { const I = ICON[f.id]; return (
              <button key={f.id} role="menuitem" onClick={() => void run(f.id)}><I size={17} /><span>{f.label}<small style={{ display: 'block', fontSize: 12 }}>{f.hint}</small></span></button>) })}
          </div>
        </>}
      </div>
      <button className="btn" disabled={disabled || !!busy} onClick={() => void run('print')}>{busy === 'print' ? <LoaderCircle className="spin" size={16} /> : <Printer size={16} />}Print</button>
    </div>
  )
}
