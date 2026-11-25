import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ChevronDown, ShieldCheck, FileText } from 'lucide-react'
import privacyMd from './privacy-policy.md?raw'
import termsMd from './user-agreement.md?raw'
import { closeLegal, legalHref, switchLegal, useLegalRoute, type LegalKind } from './legalRoute'

/* ---------- tiny markdown reader (headings, lists, bold/italic, rules) ---------- */

type Block = { t: 'p'; text: string } | { t: 'ul'; items: string[] }
type Section = { id: string; num: string; title: string; blocks: Block[] }
type Doc = { title: string; updated: string; intro: string; sections: Section[]; footnote: string }

function parseDoc(md: string): Doc {
  const doc: Doc = { title: '', updated: '', intro: '', sections: [], footnote: '' }
  let cur: Section | null = null
  let list: string[] | null = null
  const push = (b: Block) => (cur ? cur.blocks.push(b) : null)
  const flush = () => {
    if (list && cur) cur.blocks.push({ t: 'ul', items: list })
    list = null
  }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('# ')) { doc.title = line.slice(2); continue }
    if (line.startsWith('## ')) {
      flush()
      const m = line.slice(3).match(/^(\d+)\.\s*(.*)$/)
      const title = m ? m[2] : line.slice(3)
      cur = { id: 's-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), num: m?.[1] ?? '', title, blocks: [] }
      doc.sections.push(cur)
      continue
    }
    if (line === '---') { flush(); continue }
    if (line.startsWith('- ')) { (list ??= []).push(line.slice(2)); continue }
    flush()
    const upd = line.match(/^\*\*Last updated:\*\*\s*(.+)$/)
    if (upd) { doc.updated = upd[1]; continue }
    if (!cur) { doc.intro = line; continue }
    if (/^\*[^*].*\*$/.test(line) && doc.sections.length) { doc.footnote = line.slice(1, -1); continue }
    push({ t: 'p', text: line })
  }
  flush()
  return doc
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i} className="font-extrabold text-ink dark:text-white">{part.slice(2, -2)}</strong>
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}

const DOCS: Record<LegalKind, { doc: Doc; label: string; Icon: typeof ShieldCheck }> = {
  privacy: { doc: parseDoc(privacyMd), label: 'Privacy Policy', Icon: ShieldCheck },
  terms: { doc: parseDoc(termsMd), label: 'User Agreement', Icon: FileText },
}

/* ---------- page ---------- */

function LegalView({ kind }: { kind: LegalKind }) {
  const { doc, label } = DOCS[kind]
  const other: LegalKind = kind === 'privacy' ? 'terms' : 'privacy'
  const scroller = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(doc.sections[0]?.id ?? '')
  const [tocOpen, setTocOpen] = useState(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: 0 })
    el.focus({ preventScroll: true })
    setActive(doc.sections[0]?.id ?? '')
    setTocOpen(false)
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
      // active section = last one whose top has passed the sticky header
      let current = doc.sections[0]?.id ?? ''
      for (const s of doc.sections) {
        const node = el.querySelector<HTMLElement>('#' + s.id)
        if (node && node.getBoundingClientRect().top - el.getBoundingClientRect().top < 140) current = s.id
      }
      setActive(current)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [doc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeLegal()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  const jump = (id: string) => {
    scroller.current?.querySelector<HTMLElement>('#' + id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setTocOpen(false)
  }

  const toc = useMemo(
    () => (
      <ol className="space-y-0.5">
        {doc.sections.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => jump(s.id)}
              aria-current={active === s.id ? 'true' : undefined}
              className={`group flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-purple ${
                active === s.id
                  ? 'bg-brand-purple/10 text-brand-purple dark:bg-white/10 dark:text-white'
                  : 'text-gray-500 hover:text-ink dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <span className="w-4 shrink-0 text-right font-display text-[12px] tabular-nums opacity-70">{s.num}</span>
              <span>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, active],
  )

  return (
    <motion.div
      ref={scroller}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: 14 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white font-sans text-ink outline-none dark:bg-[#130e1f] dark:text-gray-200"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* top bar */}
      <header className="sticky top-0 z-10 border-b border-[#eadcf2] bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#130e1f]/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={closeLegal}
            aria-label="Close and go back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-brand-purple/10 focus-visible:outline-2 focus-visible:outline-brand-purple dark:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <nav aria-label="Legal documents" className="ml-auto flex rounded-full bg-[#f5eef9] p-1 dark:bg-white/10">
            {(['privacy', 'terms'] as LegalKind[]).map((k) => {
              const { label: l, Icon } = DOCS[k]
              const on = k === kind
              return (
                <a
                  key={k}
                  href={legalHref(k)}
                  onClick={(e) => { e.preventDefault(); if (!on) switchLegal(k) }}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-purple ${
                    on ? 'bg-white text-brand-purple shadow-sm dark:bg-brand-purple dark:text-white' : 'text-gray-500 hover:text-ink dark:text-gray-400'
                  }`}
                >
                  <Icon size={14} aria-hidden />
                  <span className="hidden sm:inline">{l}</span>
                  <span className="sm:hidden">{k === 'privacy' ? 'Privacy' : 'Agreement'}</span>
                </a>
              )
            })}
          </nav>
        </div>
        <div className="h-[3px] w-full bg-transparent" aria-hidden>
          <div
            className="h-full origin-left bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-red"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-16 lg:pt-16">
        {/* contents — sticky rail on desktop, disclosure on mobile */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="hidden lg:block">
            <p className="mb-2 px-3 font-display text-[13px] font-semibold text-gray-400">On this page</p>
            {toc}
          </div>
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              aria-expanded={tocOpen}
              className="flex w-full items-center justify-between rounded-xl border border-[#eadcf2] px-4 py-3 text-[14px] font-bold dark:border-white/10"
            >
              <span>Jump to a section</span>
              <ChevronDown size={18} className={`transition-transform ${tocOpen ? 'rotate-180' : ''}`} />
            </button>
            {tocOpen && <div className="mt-2 rounded-xl border border-[#eadcf2] p-2 dark:border-white/10">{toc}</div>}
          </div>
        </aside>

        <main className="mt-10 min-w-0 lg:mt-0">
          <h1 className="font-display text-[34px] font-extrabold leading-[1.1] tracking-tight sm:text-[48px]">{doc.title.replace(/\s*\(Draft\)/i, '')}</h1>
          <p className="mt-4 text-[15px] font-semibold text-gray-500 dark:text-gray-400">Last updated {doc.updated}</p>

          <aside className="mt-8 max-w-[66ch] rounded-2xl border-l-4 border-brand-orange bg-[#fff6ea] px-5 py-4 text-[15px] leading-relaxed text-[#6b4208] dark:bg-brand-orange/10 dark:text-[#ffd9a3]">
            {inline(doc.intro)}
          </aside>

          <div className="mt-4 max-w-[66ch]">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-[#eadcf2] py-9 first:mt-6 dark:border-white/10">
                <h2 className="flex items-baseline gap-4 font-display text-[22px] font-bold leading-snug sm:text-[26px]">
                  {s.num && <span className="w-7 shrink-0 text-brand-purple dark:text-[#c79bf0]">{s.num}</span>}
                  <span>{s.title}</span>
                </h2>
                <div className={s.num ? 'sm:pl-11' : ''}>
                  {s.blocks.map((b, i) =>
                    b.t === 'p' ? (
                      <p key={i} className="mt-4 text-[17px] leading-[1.8]">{inline(b.text)}</p>
                    ) : (
                      <ul key={i} className="mt-4 space-y-3 text-[17px] leading-[1.75]">
                        {b.items.map((it, j) => (
                          <li key={j} className="relative pl-6 before:absolute before:left-0 before:top-[0.8em] before:h-[7px] before:w-[7px] before:-translate-y-1/2 before:rounded-full before:bg-brand-purple/60 before:content-['']">
                            {inline(it)}
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}

            <footer className="border-t border-[#eadcf2] pt-8 dark:border-white/10">
              {doc.footnote && <p className="text-sm italic text-gray-500 dark:text-gray-400">{doc.footnote}</p>}
              <a
                href={legalHref(other)}
                onClick={(e) => { e.preventDefault(); switchLegal(other) }}
                className="mt-6 flex items-center justify-between rounded-2xl bg-[#f5eef9] px-5 py-4 font-bold text-brand-purple transition-colors hover:bg-[#efe3f7] focus-visible:outline-2 focus-visible:outline-brand-purple dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                <span>Also read: {DOCS[other].label}</span>
                <ArrowLeft size={18} className="rotate-180" aria-hidden />
              </a>
            </footer>
          </div>
        </main>
      </div>
    </motion.div>
  )
}

/** Mount once at the app root. Renders above everything when the URL hash is #/legal/… */
export function LegalOverlay() {
  const kind = useLegalRoute()
  return <AnimatePresence>{kind && <LegalView key={kind} kind={kind} />}</AnimatePresence>
}
