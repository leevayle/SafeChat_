import { Toast } from './components/ui'
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { DeactivatedGate } from './screens/DeactivatedGate'
import { Splash } from './screens/Splash'
import { Welcome } from './screens/Welcome'
import { Signup } from './screens/Signup'

import { api } from './api'
import { Login } from './screens/Login'
import { Loading } from './screens/Loading'
import { Profile } from './screens/Profile'
import { AlmostDone } from './screens/AlmostDone'
import { ChatsHome } from './screens/ChatsHome'
import { StatusTab } from './screens/StatusTab'
import { CallsTab, NewCallPanel } from './screens/CallsTab'
import { ChatWindow } from './screens/ChatWindow'
import { CallScreen } from './screens/CallScreen'
import { GroupsTab } from './screens/GroupsTab'
import { GroupChat } from './screens/GroupChat'
import { CreateGroup } from './screens/CreateGroup'
import { NewChat } from './screens/NewChat'
import { Settings } from './screens/Settings'
import { Contacts } from './screens/Contacts'
import { SaveRequests } from './screens/SaveRequests'
import { Notifications } from './screens/Notifications'
import { Support } from './screens/Support'
import { StatusViewer } from './screens/StatusViewer'
import { StoreProvider, useStore } from './store'
import { IncomingCall } from './components/IncomingCall'
import { BottomNav, type Tab } from './components/BottomNav'
import { DesktopShell } from './components/desktop/DesktopShell'
import { EmptyChatPane } from './components/desktop/EmptyChatPane'
import { ContactInfoPanel } from './components/desktop/ContactInfoPanel'
import type { RailItem } from './components/desktop/NavRail'
import { useMediaQuery, DESKTOP_BREAKPOINT, WIDE_DESKTOP_BREAKPOINT, useFoldableDualPane } from './hooks/useMediaQuery'

type Stage = 'splash' | 'welcome' | 'signup' | 'verify' | 'login' | 'loading' | 'profile' | 'done' | 'app'
type Call = { id: string; kind: 'audio' | 'video'; ringId?: string; remoteOfferSdp?: string; peerName?: string; peerUsername?: string }
type Overlay = 'newChat' | 'newGroup' | 'settings' | 'contacts' | 'saveRequests' | 'notifications' | 'support' | 'profile' | 'newCall' | null

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { ready, listsReady, me, logout, contacts, toast, clearToast, settings, chats, groups, calls } = useStore()
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  const isFoldableDual = useFoldableDualPane()
  const isWideDesktop = useMediaQuery(WIDE_DESKTOP_BREAKPOINT)
  /** Dual-pane shell: classic desktop OR foldable / mid-width */
  /** True foldable / dual mid-width — mobile home + second screen */
  const foldableTwoPane = isFoldableDual && !isWideDesktop
  /** Classic desktop only (not foldable dual-pane) */
  const useDesktopShell = (isWideDesktop || isDesktop) && !foldableTwoPane

  // Must be declared before any use — avoids TDZ "Cannot access before initialization"
  const [seenMissed, setSeenMissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('sc_seen_missed')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })

  const chatUnread = (chats || []).reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0)
  const missedCallBadge = (calls || []).filter((c: any) => {
    const missed = c.status === 'missed' || c.direction === 'missed'
    if (!missed) return false
    const id = String(c.id || c.call_id || '')
    return id && !seenMissed.has(id)
  }).length
  const markMissedSeen = (ids?: string[]) => {
    setSeenMissed((prev) => {
      const next = new Set(prev)
      const list =
        ids ||
        (calls || [])
          .filter((c: any) => c.status === 'missed' || c.direction === 'missed')
          .map((c: any) => String(c.id || c.call_id || ''))
      list.forEach((id) => id && next.add(id))
      try {
        localStorage.setItem('sc_seen_missed', JSON.stringify([...next]))
      } catch {
        /* */
      }
      return next
    })
  }

  const groupUnread = (groups || []).reduce((n, g: any) => n + (g.unread > 0 ? 1 : 0), 0)

  const requestLogout = () => setLogoutConfirm(true)
  const confirmLogout = async () => {
    setLogoutConfirm(false)
    setLoggingOut(true)
    try {
      setChat(null)
      setGroup(null)
      setCall(null)
      setTab('chats')
      restored.current = false
      setOverlay(null)
      await logout()
      setStage('login')
    } catch {
      setStage('login')
    } finally {
      setLoggingOut(false)
    }
  }

  const [stage, setStage] = useState<Stage>('splash')
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [donePhase, setDonePhase] = useState<'setup' | 'success' | 'error'>('setup')
  const [doneError, setDoneError] = useState('')
  const [pendingReg, setPendingReg] = useState<{ phone: string; countryCode: string; phoneNumber: string } | null>(null)
  const [registrationToken, setRegistrationToken] = useState('')
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('chats')
  useEffect(() => {
    const openSec = () => {
      setOverlay('settings')
      // Settings reads sessionStorage flag for security page
      try { sessionStorage.setItem('sc_settings_page', 'security') } catch { /* */ }
    }
    window.addEventListener('sc:open-settings-security', openSec)
    const openGame = (ev: Event) => {
      const gameId = (ev as CustomEvent).detail?.gameId
      const myId = me?.id
      if (!myId) return
      setOverlay(null)
      setTab('chats')
      setChat(myId)
      // Retry until ChatWindow (self) is mounted
      let tries = 0
      const kick = () => {
        window.dispatchEvent(new CustomEvent('sc:open-tictactoe', { detail: { gameId } }))
        tries += 1
        if (tries < 8) window.setTimeout(kick, 120)
      }
      window.setTimeout(kick, 80)
    }
    window.addEventListener('sc:open-self-tictactoe', openGame)
    const onGameStart = (ev: Event) => {
      const gameId = (ev as CustomEvent).detail?.game_id || (ev as CustomEvent).detail?.gameId
      if (!gameId || !me?.id) return
      // Both sides: open live board
      setOverlay(null)
      setTab('chats')
      setChat(me.id)
      try {
        sessionStorage.setItem('sc_open_tictactoe', String(gameId))
      } catch { /* */ }
      let tries = 0
      const kick = () => {
        window.dispatchEvent(new CustomEvent('sc:open-tictactoe', { detail: { gameId } }))
        tries += 1
        if (tries < 10) window.setTimeout(kick, 100)
      }
      window.setTimeout(kick, 60)
    }
    window.addEventListener('sc:rt-game-start', onGameStart)
    return () => window.removeEventListener('sc:open-settings-security', openSec)
      window.removeEventListener('sc:open-self-tictactoe', openGame)
      window.removeEventListener('sc:rt-game-start', onGameStart)
  }, [])
  const TAB_ORDER: Tab[] = ['chats', 'groups', 'status', 'calls']
  const swipeX = useRef<number | null>(null)
  const swipeY = useRef<number | null>(null)
  const swipeBlocked = useRef(false)
  const isHorizScrollZone = (target: EventTarget | null) => {
    let el = target as HTMLElement | null
    while (el && el !== document.body) {
      if ((el as HTMLElement).dataset?.noTabSwipe === '1') return true
      try {
        const style = window.getComputedStyle(el)
        const ox = style.overflowX
        if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true
      } catch { /* */ }
      if (el.classList?.contains('overflow-x-auto') || el.classList?.contains('overflow-x-scroll')) return true
      el = el.parentElement
    }
    return false
  }

  const goTab = (next: Tab, _dir?: 1 | -1) => {
    if (next === 'calls') markMissedSeen()
    setTab(next)
  }

  const onTabTouchStart = (e: TouchEvent) => {
    if (isHorizScrollZone(e.target)) {
      swipeBlocked.current = true
      swipeX.current = null
      return
    }
    swipeBlocked.current = false
    swipeX.current = e.touches[0].clientX
    swipeY.current = e.touches[0].clientY
  }
  const onTabTouchEnd = (e: TouchEvent) => {
    if (swipeBlocked.current || swipeX.current == null) {
      swipeX.current = null
      swipeY.current = null
      swipeBlocked.current = false
      return
    }
    const dx = e.changedTouches[0].clientX - swipeX.current
    const dy = e.changedTouches[0].clientY - (swipeY.current ?? e.changedTouches[0].clientY)
    swipeX.current = null
    swipeY.current = null
    if (Math.abs(dy) > Math.abs(dx) * 0.85) return
    if (Math.abs(dx) < 72) return
    const i = TAB_ORDER.indexOf(tab)
    if (i < 0) return
    if (dx < 0 && i < TAB_ORDER.length - 1) goTab(TAB_ORDER[i + 1], 1)
    else if (dx > 0 && i > 0) goTab(TAB_ORDER[i - 1], -1)
  }

  const [chat, setChat] = useState<string | null>(null)
  const [group, setGroup] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [call, setCall] = useState<Call | null>(null)
  const [incoming, setIncoming] = useState<(Call & { ringId?: string }) | null>(null)
  const [statusUser, setStatusUser] = useState<{ userId: string; statusId?: string } | null>(null)

  const restored = useRef(false)
  const chatRef = useRef<string | null>(null)
  chatRef.current = chat

  /** Show call UI immediately; signaling runs over the persistent WebSocket */
  const placeCall = useCallback(async (id: string, kind: 'audio' | 'video') => {
    setCall({ id, kind })
  }, [])

  // Incoming call signaling via WebSocket (ring + SDP offer)
  useEffect(() => {
    if (stage !== 'app' || !me) return
    const onCall = (ev: Event) => {
      const p = (ev as CustomEvent).detail as {
        a: string
        from?: string
        callId?: string
        kind?: string
        sdp?: string
        fromName?: string
        fromUsername?: string
      }
      if (!p?.from) return
      if (p.a === 'ring') {
        setIncoming((prev) => {
          if (prev && p.callId && prev.ringId === p.callId) {
            return {
              ...prev,
              id: prev.id,
              kind: prev.kind,
              peerName: p.fromName || prev.peerName,
              peerUsername: p.fromUsername || prev.peerUsername,
            }
          }
          return {
            id: String(p.from),
            kind: p.kind === 'video' ? 'video' : 'audio',
            ringId: p.callId,
            peerName: p.fromName,
            peerUsername: p.fromUsername,
          }
        })
      } else if (p.a === 'offer' && p.sdp) {
        setIncoming((prev) => {
          if (prev && prev.id === p.from) {
            return {
              ...prev,
              ringId: p.callId || prev.ringId,
              remoteOfferSdp: p.sdp,
              peerName: p.fromName || prev.peerName,
              peerUsername: p.fromUsername || prev.peerUsername,
            }
          }
          // Offer before ring UI — still show incoming
          return {
            id: p.from!,
            kind: p.kind === 'video' ? 'video' : 'audio',
            ringId: p.callId,
            remoteOfferSdp: p.sdp,
            peerName: p.fromName,
            peerUsername: p.fromUsername,
          }
        })
        setCall((prev) =>
          prev && prev.id === p.from
            ? {
                ...prev,
                ringId: p.callId || prev.ringId,
                remoteOfferSdp: p.sdp,
                peerName: p.fromName || prev.peerName,
                peerUsername: p.fromUsername || prev.peerUsername,
              }
            : prev,
        )
      }
    }
    window.addEventListener('sc:rt-call', onCall)
    return () => window.removeEventListener('sc:rt-call', onCall)
  }, [stage, me])

  // Premium recharge deep-link from Notifications
  useEffect(() => {
    const openPremium = () => {
      setOverlay('settings')
      try {
        sessionStorage.setItem('sc_settings_page', 'premium')
      } catch { /* */ }
    }
    window.addEventListener('sc:open-premium', openPremium)
    return () => window.removeEventListener('sc:open-premium', openPremium)
  }, [])

  /** Device session helpers — localStorage is the source of truth for "has logged in on this device" */
  const readDeviceSession = () => {
    const hasTokens =
      !!localStorage.getItem('sc_access') ||
      !!localStorage.getItem('sc_token') ||
      !!localStorage.getItem('sc_user')
    const hasLoggedIn = localStorage.getItem('sc_has_logged_in') === '1' || hasTokens
    let appLock = settings.appLock
    try {
      const raw = localStorage.getItem('sc_settings')
      if (raw) {
        const parsed = JSON.parse(raw) as { appLock?: boolean }
        if (typeof parsed.appLock === 'boolean') appLock = parsed.appLock
      }
    } catch {
      /* ignore */
    }
    return { hasTokens, hasLoggedIn, appLock }
  }

  // After splash may land on loading while store finishes hydrating a saved session
  useEffect(() => {
    if (stage !== 'loading' || !ready) return
    const { hasTokens, hasLoggedIn, appLock } = readDeviceSession()

    // App lock always requires re-auth for returning users
    if (appLock && (me || hasTokens || hasLoggedIn)) {
      setStage('login')
      return
    }

    // Valid session, no lock → inbox
    if (me) {
      restored.current = true
      setStage('app')
      return
    }

    // Tokens existed but hydration failed (cleared session) — treat as new if no flag
    if (hasLoggedIn || hasTokens) {
      // Prefer login over Welcome so returning users don't see privacy/continue again
      setStage('login')
      return
    }

    setStage('welcome')
  }, [stage, ready, me, settings.appLock])

  const buildPhoneNumber = (phone: string, countryCode: string) => {
    const local = phone.replace(/\D/g, '').replace(/^0/, '')
    return `${countryCode}${local}`.replace(/[^+\d]/g, '')
  }

  /** Phone only — no OTP. Continue straight to profile details. */
  const afterPhone = async (phone: string, countryCode: string) => {
    setSubmitting(true)
    try {
      const phoneNumber = buildPhoneNumber(phone, countryCode)
      setPendingReg({ phone, countryCode, phoneNumber })
      // No verification for now — empty token; backend ignores extra fields
      setRegistrationToken('')
      setDevelopmentCode(null)
      setStage('profile')
    } finally {
      setSubmitting(false)
    }
  }

  const goApp = () => {
    // Mark this device as having completed a login so splash can skip Welcome
    try {
      localStorage.setItem('sc_has_logged_in', '1')
    } catch {
      /* ignore */
    }
    restored.current = true
    // Force app shell — authenticated users must never sit on login
    setStage('app')
  }

  // ── Onboarding ─────────────────────────────────────────
  if (stage !== 'app') {
    return (
      <div className="auth-shell flex min-h-dvh w-full justify-center">
        <main className="auth-card relative h-dvh w-full min-h-[568px] max-w-[430px] overflow-hidden md:max-w-[440px]">
          {stage === 'splash' && (
            <Splash
              onDone={() => {
                const { hasTokens, hasLoggedIn, appLock } = readDeviceSession()
                const returning = hasTokens || hasLoggedIn || !!me

                // First-time device → Welcome (Continue + privacy)
                if (!returning) {
                  setStage('welcome')
                  return
                }

                // Returning user with app lock → login (re-auth), skip Welcome entirely
                if (appLock) {
                  setStage('login')
                  return
                }

                // Returning, app lock off
                if (me || (hasTokens && ready)) {
                  restored.current = true
                  setStage('app')
                  return
                }

                // Tokens / flag present but store still hydrating → loading, then auto-route
                setStage('loading')
              }}
            />
          )}
          {stage === 'welcome' && (
            <Welcome onContinue={() => setStage('signup')} onLogin={() => setStage('login')} />
          )}
          {stage === 'login' && (
            <Login
              onBack={() => {
                // Returning users (app lock or existing session) stay on login — no Welcome
                const { hasLoggedIn, hasTokens, appLock } = readDeviceSession()
                if (hasLoggedIn || hasTokens || me || appLock) return
                setStage('welcome')
              }}
              onSuccess={goApp}
              onSignup={() => setStage('signup')}
            />
          )}
          {stage === 'signup' && (
            <Signup loading={submitting} onSubmit={afterPhone} onLogin={() => setStage('login')} onBack={() => setStage('welcome')} />
          )}
          {stage === 'loading' && <Loading />}
          {stage === 'profile' && pendingReg && (
            <Profile
              phone={pendingReg.phone}
              countryCode={pendingReg.countryCode}
              registrationToken={registrationToken || 'dev-skip-verify'}
              onBack={() => setStage('signup')}
              onSubmitStart={() => {
                setDonePhase('setup')
                setDoneError('')
                setStage('done')
              }}
              onDone={(n) => {
                setUsername(n)
                setDonePhase('success')
              }}
              onError={(msg) => {
                setDoneError(msg)
                setDonePhase('error')
                setStage('done')
              }}
            />
          )}
          {stage === 'done' && (
            <AlmostDone
              name={username}
              phase={donePhase}
              errorMessage={doneError}
              onEnter={goApp}
              onRetry={() => {
                setDonePhase('setup')
                setDoneError('')
                setStage('profile')
              }}
            />
          )}
          
        {logoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-[#1a222d]">
              <p className="text-lg font-black text-ink dark:text-gray-100">Log out?</p>
              <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                You will need to sign in again to use SafeChat on this device.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-gray-700 dark:bg-white/10 dark:text-gray-200"
                  onClick={() => setLogoutConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-full bg-brand-red py-3 text-sm font-extrabold text-white"
                  onClick={() => void confirmLogout()}
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
        {loggingOut && (
          <div className="sc-auth-gradient fixed inset-0 z-[210] flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#E3404C]" style={{ animationDelay: '0ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#8A2BE2]" style={{ animationDelay: '150ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#5984F2]" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm font-extrabold text-gray-600 dark:text-gray-300">Logging you out…</p>
            </div>
          </div>
        )}

        {toast && <Toast msg={toast} clear={clearToast} />}
        </main>
      </div>
    )
  }

  const planStatus = (me as any)?.accountStatus || 'active'
  if (planStatus === 'deactivated' && stage === 'app') {
    return (
      <div className="flex min-h-dvh w-full bg-[#f0f2f5]">
        <main className="relative h-dvh w-full overflow-hidden bg-white md:max-w-none">
          <DeactivatedGate
            onActivated={() => {
              /* session refreshed via reload */
              window.location.reload()
            }}
            onLogout={requestLogout}
          />
        </main>
      </div>
    )
  }

  // ── Main app — desktop shell or mobile single-column ───────
  const openChatFromList = (id: string) => {
    setChat(id)
    setGroup(null)
    const ids = (calls || [])
      .filter(
        (c: any) =>
          (c.status === 'missed' || c.direction === 'missed') &&
          (c.contactId === id || c.peer_id === id),
      )
      .map((c: any) => String(c.id || c.call_id || ''))
    if (ids.length) markMissedSeen(ids)
  }

  const railActive: RailItem =
    overlay === 'contacts' || overlay === 'settings' || overlay === 'profile'
      ? (overlay as RailItem)
      : tab

  const railBadges: Partial<Record<RailItem, number>> = {
    chats: chatUnread,
    groups: groupUnread,
    calls: missedCallBadge,
  }



  const onRailSelect = (item: RailItem) => {
    if (item === 'contacts') {
      setOverlay('contacts')
      return
    }
    if (item === 'settings') {
      setOverlay('settings')
      return
    }
    if (item === 'profile') {
      try { sessionStorage.setItem('sc_settings_page', 'profile') } catch { /* */ }
      setOverlay('profile')
      return
    }
    setOverlay(null)
    if (item === 'calls') markMissedSeen()
    setTab(item)
    // Keep open conversation when switching is intentional only for chats
    if (item !== 'chats') {
      setChat(null)
      setGroup(null)
    }
  }

  const chatsHomeProps = {
    onOpenChat: openChatFromList,
    onNewChat: () => setOverlay('newChat'),
    onNewGroup: () => setOverlay('newGroup'),
    onSettings: () => setOverlay('settings'),
    onContacts: () => setOverlay('contacts'),
    onSaveRequests: () => setOverlay('saveRequests'),
    onOpenStatus: (id: string) => id && setStatusUser({ userId: id }),
    onNotifications: () => setOverlay('notifications'),
    onSupport: () => setOverlay('support'),
  }

  const renderOverlays = (absolute = true) => (
    <>
      {overlay === 'newChat' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/20'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <NewChat
              onClose={() => setOverlay(null)}
              onPick={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
              onOpenContacts={() => setOverlay('contacts')}
            />
          </div>
        </div>
      )}
      {overlay === 'newGroup' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/20'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <CreateGroup
              onClose={() => setOverlay(null)}
              onCreated={(id) => {
                setOverlay(null)
                setTab('groups')
                setGroup(id)
              }}
            />
          </div>
        </div>
      )}
      {overlay === 'settings' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/25'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <Settings
              onBack={() => setOverlay(null)}
              onSupport={() => setOverlay('support')}
              onLogout={requestLogout}
            />
          </div>
        </div>
      )}
      {overlay === 'profile' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/25'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <Settings
              onBack={() => setOverlay(null)}
              onSupport={() => setOverlay('support')}
              onLogout={requestLogout}
            />
          </div>
        </div>
      )}
      {overlay === 'contacts' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/25'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <Contacts
              onClose={() => setOverlay(null)}
              onChat={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
              onCall={(id, kind) => {
                setOverlay(null)
                placeCall(id, kind)
              }}
            />
          </div>
        </div>
      )}
      {overlay === 'saveRequests' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/20'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <SaveRequests
              onClose={() => setOverlay(null)}
              onChat={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
            />
          </div>
        </div>
      )}
      {overlay === 'notifications' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/20'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <Notifications
              onBack={() => setOverlay(null)}
              onOpenSaveRequests={() => setOverlay('saveRequests')}
              onOpenCalls={() => {
                setOverlay(null)
                setTab('calls')
              }}
              onOpenChat={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
              onOpenStatus={(userId, statusId) => {
                setOverlay(null)
                setStatusUser({ userId, statusId })
              }}
            />
          </div>
        </div>
      )}
      {overlay === 'support' && (
        <div className={absolute ? 'absolute inset-0 z-[35] bg-white' : 'absolute inset-0 z-[35] flex items-stretch justify-end bg-black/20'}>
          <div className={absolute ? 'h-full w-full' : 'h-full w-full max-w-[420px] overflow-hidden border-l border-black/8 bg-white shadow-2xl'}>
            <Support onClose={() => setOverlay(null)} />
          </div>
        </div>
      )}
      {statusUser && (
        <div className="absolute inset-0 z-[45]">
          <StatusViewer
            userId={statusUser.userId}
            initialStatusId={statusUser.statusId}
            onClose={() => setStatusUser(null)}
            onReplyToStatus={(peerId) => {
              setStatusUser(null)
              setChat(peerId)
            }}
          />
        </div>
      )}
      {call && (
        <div className="absolute inset-0 z-[50]">
          <CallScreen
            contactId={call.id}
            kind={call.kind}
            ringId={call.ringId}
            remoteOfferSdp={call.remoteOfferSdp}
            peerName={call.peerName}
            peerUsername={call.peerUsername}
            onEnd={() => setCall(null)}
          />
        </div>
      )}
      {incoming && !call && (
        <IncomingCall
          contactId={incoming.id}
          kind={incoming.kind}
          peerName={(incoming as any).peerName}
          peerUsername={(incoming as any).peerUsername}
          onDecline={async () => {
            try {
              const { wsCall, isRealtimeOpen } = await import('./realtime')
              if (isRealtimeOpen() && incoming.ringId) {
                wsCall({
                  a: 'hangup',
                  to: incoming.id,
                  callId: incoming.ringId,
                  reason: 'declined',
                })
              }
            } catch {
              /* */
            }
            setIncoming(null)
          }}
          onAccept={async () => {
            setCall({
              id: incoming.id,
              kind: incoming.kind,
              ringId: incoming.ringId,
              remoteOfferSdp: (incoming as any).remoteOfferSdp,
              peerName: (incoming as any).peerName,
              peerUsername: (incoming as any).peerUsername,
            })
            setIncoming(null)
          }}
        />
      )}
      {toast && <Toast msg={toast} clear={clearToast} />}
    </>
  )

  // Desktop + foldables: list | conversation [| right on wide desktop only]
  if (useDesktopShell) {
    const sidebar =
      tab === 'groups' ? (
        <GroupsTab onOpen={setGroup} onCreate={() => setOverlay('newGroup')} />
      ) : tab === 'status' ? (
        <StatusTab onOpenStatus={(id, statusId) => id && setStatusUser({ userId: id, statusId })} />
      ) : tab === 'calls' ? (
        <CallsTab
          onCall={placeCall}
          onOpenContacts={() => setOverlay('contacts')}
          onOpenNewCallPanel={() => setOverlay('newCall')}
          onSimulateIncoming={() => {
            const id = contacts?.[0]?.id || 'amina'
            setIncoming({ id, kind: 'video' })
          }}
        />
      ) : (
        <div className="desktop-chat-list h-full">
          <ChatsHome {...chatsHomeProps} />
        </div>
      )

    let mainContent: ReactNode = null
    let showEmpty = false
    if (chat) {
      mainContent = (
        <ChatWindow
          contactId={chat}
          onBack={() => setChat(null)}
          onCall={(kind) => placeCall(chat, kind)}
          onOpenCalls={() => {
            setChat(null)
            setTab('calls')
          }}
          onOpenStatus={(userId, statusId) => setStatusUser({ userId, statusId })}
        />
      )
    } else if (group) {
      mainContent = (
        <GroupChat
          groupId={group}
          onBack={() => setGroup(null)}
          onClosed={() => setGroup(null)}
        />
      )
    } else {
      showEmpty = true
    }

    // Voice call occupies the center pane; video stays fullscreen
    if (call && call.kind === 'audio') {
      mainContent = (
        <CallScreen
          contactId={call.id}
          kind={call.kind}
          ringId={call.ringId}
          remoteOfferSdp={call.remoteOfferSdp}
          peerName={call.peerName}
          peerUsername={call.peerUsername}
          onEnd={() => setCall(null)}
        />
      )
      showEmpty = false
    }

    // Right column: secondary screens live here (not full-screen modals)
    let rightPanel: ReactNode = null
    if (overlay === 'contacts') {
      rightPanel = (
        <Contacts
          onClose={() => setOverlay(null)}
          onChat={(id) => {
            setOverlay(null)
            setTab('chats')
            setChat(id)
          }}
          onCall={(id, kind) => {
            setOverlay(null)
            placeCall(id, kind)
          }}
        />
      )
    } else if (overlay === 'settings' || overlay === 'profile') {
      rightPanel = (
        <Settings
          onBack={() => setOverlay(null)}
          onSupport={() => setOverlay('support')}
          onLogout={requestLogout}
        />
      )
    } else if (overlay === 'notifications') {
      rightPanel = (
        <Notifications
          onBack={() => setOverlay(null)}
          onOpenSaveRequests={() => setOverlay('saveRequests')}
          onOpenCalls={() => {
            setOverlay(null)
            setTab('calls')
          }}
          onOpenChat={(id) => {
            setOverlay(null)
            setTab('chats')
            setChat(id)
          }}
          onOpenStatus={(userId, statusId) => {
            setOverlay(null)
            setStatusUser({ userId, statusId })
          }}
        />
      )
    } else if (overlay === 'saveRequests') {
      rightPanel = (
        <SaveRequests
          onClose={() => setOverlay(null)}
          onChat={(id) => {
            setOverlay(null)
            setTab('chats')
            setChat(id)
          }}
        />
      )
    } else if (overlay === 'support') {
      rightPanel = <Support onClose={() => setOverlay(null)} />
    } else if (overlay === 'newChat') {
      rightPanel = (
        <NewChat
          onClose={() => setOverlay(null)}
          onPick={(id) => {
            setOverlay(null)
            setTab('chats')
            setChat(id)
          }}
          onOpenContacts={() => setOverlay('contacts')}
        />
      )
    } else if (overlay === 'newGroup') {
      rightPanel = (
        <CreateGroup
          onClose={() => setOverlay(null)}
          onCreated={(id) => {
            setOverlay(null)
            setTab('groups')
            setGroup(id)
          }}
        />
      )
    } else if (overlay === 'newCall') {
      rightPanel = (
        <NewCallPanel
          onCall={(id, kind) => {
            placeCall(id, kind)
            setOverlay(null)
          }}
          onClose={() => setOverlay(null)}
        />
      )
    } else if (tab === 'calls' && !overlay) {
      // Calls list on the left; contacts on the right for quick dial
      rightPanel = (
        <Contacts
          onClose={() => {}}
          onChat={(id) => {
            setTab('chats')
            setChat(id)
          }}
          onCall={(id, kind) => placeCall(id, kind)}
        />
      )
    } else if (chat) {
      // Same contact info layout as mobile ChatWindow profile
      rightPanel = (
        <ContactInfoPanel
          contactId={chat}
          onCall={(kind) => placeCall(chat, kind)}
          onChat={() => {
            /* already in chat */
          }}
        />
      )
    }

    // Full-screen only: calls + status viewer + toast
    const desktopOverlays = (
      <>
        {statusUser && (
          <div className="absolute inset-0 z-[45]">
            <StatusViewer
              userId={statusUser.userId}
              initialStatusId={statusUser.statusId}
              onClose={() => setStatusUser(null)}
              onReplyToStatus={(peerId) => {
                setStatusUser(null)
                setChat(peerId)
              }}
            />
          </div>
        )}
        {call && call.kind === 'video' && (
          <div className="absolute inset-0 z-[50]">
            <CallScreen
              contactId={call.id}
              kind={call.kind}
              ringId={call.ringId}
              remoteOfferSdp={call.remoteOfferSdp}
              peerName={call.peerName}
              peerUsername={call.peerUsername}
              onEnd={() => setCall(null)}
            />
          </div>
        )}
        {incoming && !call && (
          <IncomingCall
            contactId={incoming.id}
            kind={incoming.kind}
            peerName={(incoming as any).peerName}
            peerUsername={(incoming as any).peerUsername}
            onDecline={async () => {
              try {
                const { wsCall, isRealtimeOpen } = await import('./realtime')
                if (isRealtimeOpen() && incoming.ringId) {
                  wsCall({
                    a: 'hangup',
                    to: incoming.id,
                    callId: incoming.ringId,
                    reason: 'declined',
                  })
                }
              } catch {
                /* */
              }
              setIncoming(null)
            }}
            onAccept={async () => {
              setCall({
                id: incoming.id,
                kind: incoming.kind,
                ringId: incoming.ringId,
                remoteOfferSdp: (incoming as any).remoteOfferSdp,
                peerName: (incoming as any).peerName,
                peerUsername: (incoming as any).peerUsername,
              })
              setIncoming(null)
            }}
          />
        )}
        {toast && <Toast msg={toast} clear={clearToast} />}
      </>
    )

    return (
      <div className="relative h-dvh w-full overflow-hidden">
        <DesktopShell
          tab={tab}
          railActive={railActive}
          badges={railBadges}
          onRailSelect={onRailSelect}
          sidebar={sidebar}
          main={mainContent}
          showEmpty={showEmpty}
          emptyTitle={tab === 'groups' ? 'Groups' : tab === 'status' ? 'Status' : tab === 'calls' ? 'Calls' : 'SafeChat'}
          emptySubtitle={
            tab === 'groups'
              ? 'Select a group to open the conversation.'
              : tab === 'status'
                ? 'Pick a status from the sidebar to view.'
                : tab === 'calls'
                  ? 'Call history appears in the sidebar.'
                  : 'Select a chat to start messaging.'
          }
          rightPanel={rightPanel}
          overlays={desktopOverlays}
          loading={!listsReady}
          onLogout={requestLogout}
        />

        {logoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-[#1a222d]">
              <p className="text-lg font-black text-ink dark:text-gray-100">Log out?</p>
              <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                You will need to sign in again to use SafeChat on this device.
              </p>
              <div className="mt-6 flex gap-3">
                <button type="button" className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-gray-700 dark:bg-white/10 dark:text-gray-200" onClick={() => setLogoutConfirm(false)}>Cancel</button>
                <button type="button" className="flex-1 rounded-full bg-brand-red py-3 text-sm font-extrabold text-white" onClick={() => void confirmLogout()}>Log out</button>
              </div>
            </div>
          </div>
        )}
        {loggingOut && (
          <div className="sc-auth-gradient fixed inset-0 z-[210] flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#E3404C]" style={{ animationDelay: '0ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#8A2BE2]" style={{ animationDelay: '150ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#5984F2]" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm font-extrabold text-gray-600 dark:text-gray-300">Logging you out…</p>
            </div>
          </div>
        )}

      </div>
    )
  }


  // Foldables: mobile home left | second screen right; status fullscreen
  if (foldableTwoPane && stage === 'app') {
    const foldBadges = {
      chats: chatUnread,
      groups: groupUnread,
      calls: missedCallBadge,
    }

    // Second screen priority: overlays (settings etc.) → chat → group → empty
    let second: ReactNode = <EmptyChatPane subtitle="Select a chat to start messaging." />
    if (overlay === 'contacts') {
      second = (
        <Contacts
          onClose={() => setOverlay(null)}
          onChat={(id) => {
            setOverlay(null)
            setTab('chats')
            setChat(id)
          }}
          onCall={(id, kind) => {
            setOverlay(null)
            placeCall(id, kind)
          }}
        />
      )
    } else if (overlay === 'settings' || overlay === 'profile') {
      second = (
        <Settings
          onBack={() => setOverlay(null)}
          onSupport={() => setOverlay('support')}
          onLogout={requestLogout}
        />
      )
    } else if (overlay === 'notifications') {
      second = (
        <Notifications
          onBack={() => setOverlay(null)}
          onOpenChat={(id) => {
            setOverlay(null)
            setChat(id)
          }}
          onOpenStatus={(userId, statusId) => {
            setStatusUser({ userId, statusId })
          }}
        />
      )
    } else if (overlay === 'saveRequests') {
      second = (
        <SaveRequests
          onClose={() => setOverlay(null)}
          onChat={(id) => {
            setOverlay(null)
            setChat(id)
          }}
        />
      )
    } else if (overlay === 'support') {
      second = <Support onClose={() => setOverlay(null)} />
    } else if (overlay === 'newChat') {
      second = (
        <NewChat
          onClose={() => setOverlay(null)}
          onPick={(id) => {
            setOverlay(null)
            setChat(id)
          }}
        />
      )
    } else if (overlay === 'newGroup') {
      second = (
        <CreateGroup
          onClose={() => setOverlay(null)}
          onCreated={(id) => {
            setOverlay(null)
            setGroup(id)
          }}
        />
      )
    } else if (overlay === 'newCall') {
      second = (
        <NewCallPanel
          onClose={() => setOverlay(null)}
          onCall={(id, kind) => {
            setOverlay(null)
            placeCall(id, kind)
          }}
        />
      )
    } else if (chat) {
      second = (
        <ChatWindow
          contactId={chat}
          onBack={() => setChat(null)}
          onCall={(kind) => placeCall(chat, kind)}
          onOpenCalls={() => {
            setChat(null)
            setTab('calls')
          }}
          onOpenStatus={(userId, statusId) => setStatusUser({ userId, statusId })}
        />
      )
    } else if (group) {
      second = (
        <GroupChat groupId={group} onBack={() => setGroup(null)} onClosed={() => setGroup(null)} />
      )
    }

    return (
      <div data-sc-foldable="1" className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-[#f0f2f5] dark:bg-[#0d1218]">
        {/* Left: mobile home + docked bottom nav */}
        <div className="relative flex h-full min-w-0 w-1/2 flex-col overflow-hidden border-r border-black/[0.06] bg-white dark:border-white/10 dark:bg-[#121821]">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className={tab === 'chats' ? 'h-full' : 'hidden'}>
              <ChatsHome {...chatsHomeProps} />
            </div>
            <div className={tab === 'groups' ? 'h-full' : 'hidden'}>
              <GroupsTab onOpen={setGroup} onCreate={() => setOverlay('newGroup')} />
            </div>
            <div className={tab === 'status' ? 'h-full' : 'hidden'}>
              <StatusTab onOpenStatus={(id, statusId) => id && setStatusUser({ userId: id, statusId })} />
            </div>
            <div className={tab === 'calls' ? 'h-full' : 'hidden'}>
              <CallsTab
                onCall={placeCall}
                onOpenContacts={() => setOverlay('contacts')}
                onOpenNewCallPanel={() => setOverlay('newCall')}
              />
            </div>
          </div>
          <BottomNav
            docked
            tab={tab}
            onChange={(t) => {
              if (t === 'calls') markMissedSeen()
              setTab(t)
            }}
            badges={foldBadges}
          />
        </div>

        {/* Right: second screen — chat OR settings / contacts / etc. */}
        <div className="relative flex h-full min-w-0 w-1/2 flex-col overflow-hidden bg-white dark:bg-[#121821]">
          {second}
        </div>

        {/* Status viewer: portal to body so foldable dual-screen hit-testing works */}
        {statusUser &&
          createPortal(
            <div
              className="sc-foldable-status-overlay fixed inset-0 z-[9999] bg-black"
              style={{
                position: 'fixed',
                width: '100vw',
                height: '100dvh',
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'auto',
                touchAction: 'manipulation',
                isolation: 'isolate',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <StatusViewer
                userId={statusUser.userId}
                initialStatusId={statusUser.statusId}
                onClose={() => setStatusUser(null)}
                onReplyToStatus={(peerId) => {
                  setStatusUser(null)
                  setChat(peerId)
                  setTab('chats')
                }}
              />
            </div>,
            document.body,
          )}

        {call && (
          <div className="fixed inset-0 z-[95]">
            <CallScreen
              contactId={call.id}
              kind={call.kind}
              ringId={call.ringId}
              remoteOfferSdp={call.remoteOfferSdp}
              peerName={call.peerName}
              peerUsername={call.peerUsername}
              onEnd={() => setCall(null)}
            />
          </div>
        )}

        {incoming && (
          <IncomingCall
            contactId={incoming.id}
            kind={incoming.kind}
            onAccept={() => {
              setCall({ id: incoming.id, kind: incoming.kind })
              setIncoming(null)
            }}
            onDecline={() => setIncoming(null)}
          />
        )}

        {logoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-[#1a222d]">
              <p className="text-lg font-black text-ink dark:text-gray-100">Log out?</p>
              <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                You will need to sign in again to use SafeChat on this device.
              </p>
              <div className="mt-6 flex gap-3">
                <button type="button" className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-gray-700 dark:bg-white/10 dark:text-gray-200" onClick={() => setLogoutConfirm(false)}>Cancel</button>
                <button type="button" className="flex-1 rounded-full bg-brand-red py-3 text-sm font-extrabold text-white" onClick={() => void confirmLogout()}>Log out</button>
              </div>
            </div>
          </div>
        )}
        {loggingOut && (
          <div className="sc-auth-gradient fixed inset-0 z-[210] flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#E3404C]" style={{ animationDelay: '0ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#8A2BE2]" style={{ animationDelay: '150ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#5984F2]" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm font-extrabold text-gray-600 dark:text-gray-300">Logging you out…</p>
            </div>
          </div>
        )}
        {toast && <Toast msg={toast} clear={clearToast} />}
      </div>
    )
  }

  // Mobile single-column (original behavior)
  return (
    <div className="flex min-h-dvh justify-center bg-[#f0f2f5]">
      <main className="relative h-dvh w-full min-h-[568px] max-w-[430px] overflow-hidden bg-white">
        <div
          className="relative h-full"
          onTouchStart={onTabTouchStart}
          onTouchEnd={onTabTouchEnd}
        >
          <div className={tab === 'chats' ? 'h-full' : 'hidden'}>
            <ChatsHome {...chatsHomeProps} />
          </div>
          <div className={tab === 'groups' ? 'h-full' : 'hidden'}>
            <GroupsTab onOpen={setGroup} onCreate={() => setOverlay('newGroup')} />
          </div>
          <div className={tab === 'status' ? 'h-full' : 'hidden'}>
            <StatusTab onOpenStatus={(id, statusId) => id && setStatusUser({ userId: id, statusId })} />
          </div>
          <div className={tab === 'calls' ? 'h-full' : 'hidden'}>
            <CallsTab
              onCall={placeCall}
              onOpenContacts={() => setOverlay('contacts')}
              onSimulateIncoming={() => {
                const id = contacts?.[0]?.id || 'amina'
                setIncoming({ id, kind: 'video' })
              }}
            />
          </div>
          {!chat && !group && !call && !overlay && !statusUser && (
            <BottomNav
              tab={tab}
              onChange={(t) => {
                if (t === 'calls') markMissedSeen()
                setTab(t)
              }}
              badges={{ chats: chatUnread, groups: groupUnread, calls: missedCallBadge }}
            />
          )}
        </div>

        {chat && (
          <div className="absolute inset-0 z-20 bg-white">
            <ChatWindow
              contactId={chat}
              onBack={() => setChat(null)}
              onCall={(kind) => placeCall(chat, kind)}
              onOpenCalls={() => {
                setChat(null)
                setTab('calls')
              }}
              onOpenStatus={(userId, statusId) => setStatusUser({ userId, statusId })}
            />
          </div>
        )}

        {group && (
          <div className="absolute inset-0 z-20 bg-white">
            <GroupChat groupId={group} onBack={() => setGroup(null)} onClosed={() => setGroup(null)} />
          </div>
        )}

        {renderOverlays(true)}
        
        {logoutConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-[#1a222d]">
              <p className="text-lg font-black text-ink dark:text-gray-100">Log out?</p>
              <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                You will need to sign in again to use SafeChat on this device.
              </p>
              <div className="mt-6 flex gap-3">
                <button type="button" className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-gray-700 dark:bg-white/10 dark:text-gray-200" onClick={() => setLogoutConfirm(false)}>Cancel</button>
                <button type="button" className="flex-1 rounded-full bg-brand-red py-3 text-sm font-extrabold text-white" onClick={() => void confirmLogout()}>Log out</button>
              </div>
            </div>
          </div>
        )}
        {loggingOut && (
          <div className="sc-auth-gradient fixed inset-0 z-[210] flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#E3404C]" style={{ animationDelay: '0ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#8A2BE2]" style={{ animationDelay: '150ms' }} />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#5984F2]" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm font-extrabold text-gray-600 dark:text-gray-300">Logging you out…</p>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
