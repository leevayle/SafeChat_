import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AtSign, Check, Copy, Eye, EyeOff, KeyRound, LoaderCircle, LogOut, Monitor, Moon, Pencil, Smartphone, Sun, TriangleAlert, X } from 'lucide-react'
import { api, del, forgetSession, patch, post, type Admin } from '../api'
import { useTheme } from '../theme'
import { ErrorBox, Loading, Modal, PageHead, Pill, ago, fmtDate, useFetch, useToast } from '../ui'

type Profile = { id: string; username: string; display_name?: string; email?: string; phone_number?: string; account_role?: string; created_at?: string; subscription_plan?: string }
type Session = { id: string; device_name?: string; user_agent?: string; ip_address?: string; created_at?: string; expires_at?: string }
type Props = { admin: Admin; onAdmin: (a: Admin) => void; onSignedOut: (notice?: string) => void }

const Section = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <section className="card card-pad"><h3 style={{ marginBottom: sub ? 2 : 14 }}>{title}</h3>{sub && <p className="muted" style={{ margin: '0 0 14px' }}>{sub}</p>}{children}</section>
)
const KV = ({ k, v }: { k: string; v: ReactNode }) => <div className="kv"><span>{k}</span><b>{v || '—'}</b></div>

/** 0–4 score; the API's hard rule is 8+ characters. */
export function strength(pw: string) {
  let n = 0
  if (pw.length >= 8) n++
  if (pw.length >= 12) n++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++
  return pw.length < 8 ? Math.min(n, 1) : n
}
const LEVELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

export function AccountPage({ admin, onAdmin, onSignedOut }: Props) {
  const me = useFetch<Profile>('/auth/me')
  const sessions = useFetch<Session[]>('/users/me/sessions')
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  const [draft, setDraft] = useState<string | null>(null)   // null = show the saved name (no empty flash)
  const [savingName, setSavingName] = useState(false)
  const [dialog, setDialog] = useState<'username' | 'signout-all' | 'deactivate' | null>(null)
  const p = me.data
  const name = draft ?? p?.display_name ?? ''
  const sup = admin.role === 'SUPER_ADMIN'

  const saveName = async () => {
    setSavingName(true)
    try {
      await patch('/users/me', { display_name: name.trim() })
      onAdmin({ ...admin, display_name: name.trim() }); setDraft(null); toast('Display name updated.'); void me.reload()
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update', 'err') } finally { setSavingName(false) }
  }
  const revoke = async (s: Session) => {
    try { await del(`/users/me/sessions/${s.id}`); toast('Session signed out.'); void sessions.reload() }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not sign out that session', 'err') }
  }
  const ended = (msg: string) => { forgetSession(); onSignedOut(msg) }

  return (
    <>
      <PageHead eyebrow="YOU" title="My account" sub="Manage your profile, sign-in security and devices." />
      {me.error && <ErrorBox text={me.error} retry={me.reload} />}
      {!p ? (me.loading ? <Loading /> : null) : (
        <div className="grid acct">
          <Section title="Profile">
            <div className="row" style={{ marginBottom: 16 }}>
              <span className="avatar big">{(p.display_name || p.username)[0]?.toUpperCase()}</span>
              <div><b style={{ fontSize: 18 }}>{p.display_name || p.username}</b><div className="row" style={{ gap: 8 }}><small>@{p.username}</small><Pill value="approved" text={sup ? 'superadmin' : 'admin'} /></div></div>
            </div>
            <label className="field"><span>Display name</span>
              <div className="row"><input value={name} maxLength={64} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn primary" disabled={savingName || !name.trim() || name.trim() === (p.display_name ?? '')} onClick={() => void saveName()}>{savingName ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save</button></div></label>
            <div className="kvs">
              <div className="kv"><span>Username</span><b>@{p.username}</b><button className="btn sm" onClick={() => setDialog('username')}><Pencil size={14} />Change</button></div>
              <KV k="Email" v={p.email} /><KV k="Phone" v={p.phone_number} /><KV k="Member since" v={fmtDate(p.created_at).split(',')[0]} />
              <div className="kv"><span>Account ID</span><b className="clip" style={{ maxWidth: 190 }}>{p.id}</b><button className="icon-btn" aria-label="Copy account ID" onClick={() => { void navigator.clipboard?.writeText(p.id); toast('Copied') }}><Copy size={16} /></button></div>
            </div>
          </Section>

          <Section title="Password" sub="Changing it signs you out of every device, including this one.">
            <PasswordForm onDone={() => ended('Password changed. Sign in with your new password.')} />
          </Section>

          <Section title="Active sessions" sub="Devices currently signed in to your account.">
            {sessions.error && <ErrorBox text={sessions.error} retry={sessions.reload} />}
            {sessions.loading && !sessions.data ? <Loading /> : (
              <div className="sessions">
                {(sessions.data ?? []).map((s) => {
                  const mobile = /mobile|android|iphone/i.test(s.user_agent ?? '')
                  return (
                    <div key={s.id} className="session">
                      <span className="chip-icon">{mobile ? <Smartphone size={18} /> : <Monitor size={18} />}</span>
                      <div style={{ minWidth: 0 }}><b>{s.device_name || 'Unknown device'}</b><small className="sub clip">{s.ip_address || 'IP unknown'} · signed in {ago(s.created_at)}</small></div>
                      <button className="btn sm ghost" onClick={() => void revoke(s)}>Sign out</button>
                    </div>)
                })}
                {!sessions.data?.length && <small>No other active sessions.</small>}
              </div>)}
            <small className="sub">Signing out the session you’re using will sign you out here too.</small>
            <div className="row end"><button className="btn" onClick={() => setDialog('signout-all')}><LogOut size={16} />Sign out of all devices</button></div>
          </Section>

          <Section title="Appearance">
            <div className="row wrap">
              <button className={`choice ${theme === 'light' ? 'on' : ''}`} onClick={() => setTheme('light')}><Sun size={18} />Light</button>
              <button className={`choice ${theme === 'dark' ? 'on' : ''}`} onClick={() => setTheme('dark')}><Moon size={18} />Dark</button>
            </div>
            <small className="sub">Saved on this browser.</small>
          </Section>

          <Section title="Danger zone" sub="Account housekeeping that can’t be undone from here.">
            {sup
              ? <p className="muted" style={{ margin: 0 }}>Superadmin accounts can’t be deactivated from the portal, so the platform is never left without one. Ask another superadmin if you need to step down.</p>
              : <div className="row wrap" style={{ justifyContent: 'space-between' }}><div style={{ flex: '1 1 240px' }}><b>Deactivate my account</b><small className="sub">You’ll be signed out everywhere and an administrator must reactivate it.</small></div>
                  <button className="btn danger" onClick={() => setDialog('deactivate')}>Deactivate…</button></div>}
          </Section>
        </div>
      )}

      {dialog === 'username' && p && <UsernameDialog current={p.username} onClose={() => setDialog(null)} onDone={(u) => { onAdmin({ ...admin, username: u }); toast(`You are now @${u}.`); void me.reload() }} />}
      {dialog === 'signout-all' && (
        <Confirm title="Sign out of all devices" confirm="Sign out everywhere" text="Every session, including this one, will be ended."
          onClose={() => setDialog(null)} onConfirm={async () => { for (const s of sessions.data ?? []) await del(`/users/me/sessions/${s.id}`).catch(() => {}); ended('Signed out of all devices.') }} />)}
      {dialog === 'deactivate' && (
        <PasswordConfirm title="Deactivate account" confirm="Deactivate my account" danger text="Enter your password to confirm. You’ll be signed out immediately."
          onClose={() => setDialog(null)} onConfirm={async (password) => { await post('/users/me/deactivate', { password }); ended('Your account was deactivated.') }} />)}
    </>
  )
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [again, setAgain] = useState('')
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const score = useMemo(() => strength(pw), [pw])
  const problem = !pw ? '' : pw.length < 8 ? 'Use at least 8 characters.' : pw === cur ? 'Choose a password different from the current one.' : again && pw !== again ? 'The two new passwords don’t match.' : ''
  const ready = !!cur && pw.length >= 8 && pw === again && pw !== cur
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await post('/auth/change-password', { current_password: cur, new_password: pw }); onDone() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not change password') } finally { setBusy(false) }
  }
  const type = show ? 'text' : 'password'
  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <label className="field"><span>Current password</span><input type={type} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
      <label className="field"><span>New password</span><input type={type} autoComplete="new-password" value={pw} maxLength={128} onChange={(e) => setPw(e.target.value)} /></label>
      {pw && <div><div className={`strength s${score}`}><i /><i /><i /><i /></div><small>{LEVELS[score]}{score < 3 && pw.length >= 8 ? ' — add length, capitals, numbers or symbols' : ''}</small></div>}
      <label className="field"><span>Confirm new password</span><input type={type} autoComplete="new-password" value={again} maxLength={128} onChange={(e) => setAgain(e.target.value)} /></label>
      {problem && <small style={{ color: 'var(--bad)' }}>{problem}</small>}
      {err && <ErrorBox text={err} />}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn ghost sm" onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}{show ? 'Hide' : 'Show'}</button>
        <button className="btn primary" disabled={!ready || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}Change password</button>
      </div>
    </form>
  )
}

function UsernameDialog({ current, onClose, onDone }: { current: string; onClose: () => void; onDone: (u: string) => void }) {
  const [name, setName] = useState(''); const [password, setPassword] = useState('')
  const [avail, setAvail] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const valid = /^[a-z0-9_]{3,32}$/.test(name)
  useEffect(() => {
    if (!valid || name === current) { setAvail('idle'); return }
    setAvail('checking')
    const t = setTimeout(() => {
      api<{ available: boolean }>(`/auth/username/check?username=${encodeURIComponent(name)}`).then((d) => setAvail(d.available ? 'free' : 'taken')).catch(() => setAvail('idle'))
    }, 350)
    return () => clearTimeout(t)
  }, [name, valid, current])
  const hint = !name ? 'Lowercase letters, numbers and underscores, 3–32 characters.' : !valid ? 'Only lowercase letters, numbers and underscores (3–32).'
    : name === current ? 'That’s your current username.' : avail === 'checking' ? 'Checking…' : avail === 'free' ? '✓ Available' : avail === 'taken' ? 'Already taken.' : ''
  const go = async () => {
    setBusy(true); setErr('')
    try { await patch('/users/me/username', { username: name, password }); onDone(name); onClose() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not change username') } finally { setBusy(false) }
  }
  return (
    <Modal title="Change username" onClose={onClose}>
      <div className="stack">
        <p className="muted">You currently sign in as <b>@{current}</b>. Use the new username next time you sign in.</p>
        <label className="field"><span>New username</span>
          <div className="search" style={{ flex: 'none' }}><AtSign size={18} /><input autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s/g, ''))} /></div>
          <small style={{ color: avail === 'taken' || (name && !valid) ? 'var(--bad)' : avail === 'free' ? 'var(--good)' : undefined }}>{hint}</small></label>
        <label className="field"><span>Confirm with your password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <ErrorBox text={err} />}
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid || name === current || avail === 'taken' || !password} onClick={() => void go()}>{busy && <LoaderCircle className="spin" size={16} />}Change username</button></div>
      </div>
    </Modal>
  )
}

function Confirm({ title, text, confirm, onClose, onConfirm }: { title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack"><p className="muted">{text}</p>
        <div className="row end"><button className="btn ghost" onClick={onClose}><X size={15} />Cancel</button>
          <button className="btn danger" disabled={busy} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)) }}>{busy && <LoaderCircle className="spin" size={16} />}{confirm}</button></div></div>
    </Modal>
  )
}

function PasswordConfirm({ title, text, confirm, danger, onClose, onConfirm }: { title: string; text: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const go = async () => { setBusy(true); setErr(''); try { await onConfirm(pw) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) } }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <div className="callout" style={{ margin: 0 }}><TriangleAlert size={20} /><div><p style={{ margin: 0 }}>{text}</p></div></div>
        <label className="field"><span>Password</span><input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <ErrorBox text={err} />}
        <div className="row end"><button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn danger' : 'btn primary'} disabled={!pw || busy} onClick={() => void go()}>{busy && <LoaderCircle className="spin" size={16} />}{confirm}</button></div>
      </div>
    </Modal>
  )
}
