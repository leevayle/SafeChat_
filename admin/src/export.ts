/** Table export helpers: CSV, Excel, PDF, JSON and print. Heavy libraries load only when used. */
export type Col<T> = { header: string; value: (row: T) => string | number | null | undefined }
export type Spec<T> = { title: string; subtitle?: string; filename: string; cols: Col<T>[]; rows: T[] }
export type Fmt = 'csv' | 'xlsx' | 'pdf' | 'json'
export const FORMATS: { id: Fmt; label: string; hint: string }[] = [
  { id: 'xlsx', label: 'Excel', hint: '.xlsx spreadsheet' },
  { id: 'csv', label: 'CSV', hint: 'Plain text, opens anywhere' },
  { id: 'pdf', label: 'PDF', hint: 'Formatted report' },
  { id: 'json', label: 'JSON', hint: 'For developers' },
]

/** Spreadsheet apps run text starting with = + - @ as a formula; neutralise it. */
const safe = (v: string | number | null | undefined) => {
  if (v == null) return ''
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}
const matrix = <T,>(s: Spec<T>) => s.rows.map((r) => s.cols.map((c) => safe(c.value(r))))

export async function buildBlob<T>(fmt: Fmt, s: Spec<T>): Promise<{ blob: Blob; ext: string }> {
  const head = s.cols.map((c) => c.header)
  if (fmt === 'csv') {
    const esc = (v: string | number) => { const t = String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const text = [head, ...matrix(s)].map((r) => r.map(esc).join(',')).join('\r\n')
    return { blob: new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }), ext: 'csv' }
  }
  if (fmt === 'json') {
    const data = s.rows.map((r) => Object.fromEntries(s.cols.map((c) => [c.header, c.value(r) ?? null])))
    return { blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), ext: 'json' }
  }
  if (fmt === 'xlsx') {
    const XLSX = await import('xlsx')
    const rows = matrix(s)
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows])
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[i]).length)) + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, s.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), ext: 'xlsx' }
  }
  const { jsPDF } = await import('jspdf')
  // The plugin's export shape differs between bundlers/Node, so resolve it defensively.
  const mod = (await import('jspdf-autotable')) as unknown as Record<string, unknown>
  type AutoTable = (doc: unknown, opts: unknown) => void
  const pick = (x: unknown): AutoTable | undefined =>
    typeof x === 'function' ? (x as AutoTable) : x && typeof x === 'object' ? pick((x as Record<string, unknown>).default) ?? pick((x as Record<string, unknown>).autoTable) : undefined
  const autoTable = pick(mod)
  if (!autoTable) throw new Error('PDF table plugin failed to load')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(123, 44, 191); doc.rect(0, 0, W, 6, 'F')
  doc.setTextColor(31, 41, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(s.title, 40, 44)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 114, 128)
  if (s.subtitle) doc.text(doc.splitTextToSize(s.subtitle, W - 80) as string[], 40, 60)
  autoTable(doc, {
    startY: 80, head: [head], body: matrix(s).map((r) => r.map(String)),
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', textColor: [31, 41, 55] },
    headStyles: { fillColor: [123, 44, 191], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 242, 252] }, margin: { left: 40, right: 40, bottom: 36 },
  })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150)
    doc.text(`SafeChat Admin · Page ${i} of ${pages}`, W - 40, doc.internal.pageSize.getHeight() - 18, { align: 'right' })
  }
  return { blob: doc.output('blob'), ext: 'pdf' }
}

export async function exportRows<T>(fmt: Fmt, s: Spec<T>) {
  const { blob, ext } = await buildBlob(fmt, s)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `${s.filename}.${ext}` })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function printHtml<T>(s: Spec<T>): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.title)}</title><style>
@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font:11px/1.4 system-ui,Segoe UI,Arial,sans-serif;color:#1f2937;margin:0}
header{border-top:5px solid #7b2cbf;padding-top:10px;margin-bottom:12px}h1{font-size:20px;margin:0 0 4px}p{margin:0;color:#6b7280}
table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{background:#7b2cbf;color:#fff;text-align:left;padding:5px 6px;font-size:10px}
td{padding:5px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top;word-break:break-word}tr{break-inside:avoid}tr:nth-child(even) td{background:#f7f2fc}
th,tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>
<header><h1>${esc(s.title)}</h1><p>${esc(s.subtitle ?? '')}</p></header>
<table><thead><tr>${s.cols.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead>
<tbody>${s.rows.map((r) => `<tr>${s.cols.map((c) => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
}

export function printRows<T>(s: Spec<T>) {
  const f = Object.assign(document.createElement('iframe'), { title: 'Print' })
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000) }
  f.srcdoc = printHtml(s)
  document.body.append(f)
}
