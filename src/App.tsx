import { Toast } from './components/ui'
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
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
import { CallsTab } from './screens/CallsTab'
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

type Stage = 'splash' | 'welcome' | 'signup' | 'verify' | 'login' | 'loading' | 'profile' | 'done' | 'app'
type Call = { id: string; kind: 'audio' | 'video'; ringId?: string; remoteOfferSdp?: string; peerName?: string; peerUsername?: string }
type Overlay = 'newChat' | 'newGroup' | 'settings' | 'contacts' | 'saveRequests' | 'notifications' | 'support' | null

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { ready, me, logout, contacts, toast, clearToast, settings, chats, groups, calls } = useStore()

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
  const [stage, setStage] = useState<Stage>('splash')
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [donePhase, setDonePhase] = useState<'setup' | 'success' | 'error'>('setup')
  const [doneError, setDoneError] = useState('')
  const [pendingReg, setPendingReg] = useState<{ phone: string; countryCode: string; phoneNumber: string } | null>(null)
  const [registrationToken, setRegistrationToken] = useState('')
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('chats')
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
        setIncoming((prev) =>
          prev?.ringId === p.callId
            ? {
                ...prev,
                peerName: p.fromName || prev.peerName,
                peerUsername: p.fromUsername || prev.peerUsername,
              }
            : {
                id: p.from!,
                kind: p.kind === 'video' ? 'video' : 'audio',
                ringId: p.callId,
                peerName: p.fromName,
                peerUsername: p.fromUsername,
              },
        )
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
      <div className="flex min-h-dvh justify-center bg-[#f0f2f5]">
        <main className="relative h-dvh w-full min-h-[568px] max-w-[430px] overflow-hidden bg-white">
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
        </main>
      </div>
    )
  }

  const planStatus = (me as any)?.accountStatus || 'active'
  if (planStatus === 'deactivated' && stage === 'app') {
    return (
      <div className="flex min-h-dvh justify-center bg-[#f0f2f5]">
        <main className="relative h-dvh w-full max-w-[430px] overflow-hidden bg-white">
          <DeactivatedGate
            onActivated={() => {
              /* session refreshed via reload */
              window.location.reload()
            }}
            onLogout={() => {
              void (logout as any)?.()
              window.location.reload()
            }}
          />
        </main>
      </div>
    )
  }

  // ── Main app — no stage AnimatePresence (no hop) ───────
  return (
    <div className="flex min-h-dvh justify-center bg-[#f0f2f5]">
      <main className="relative h-dvh w-full min-h-[568px] max-w-[430px] overflow-hidden bg-white">
        {/* Tab pages */}
        <div
          className="relative h-full"
          onTouchStart={onTabTouchStart}
          onTouchEnd={onTabTouchEnd}
        >
          <div className={tab === 'chats' ? 'h-full' : 'hidden'}>
            <ChatsHome
              onOpenChat={(id) => {
                setChat(id)
                const ids = (calls || [])
                  .filter(
                    (c: any) =>
                      (c.status === 'missed' || c.direction === 'missed') &&
                      (c.contactId === id || c.peer_id === id),
                  )
                  .map((c: any) => String(c.id || c.call_id || ''))
                if (ids.length) markMissedSeen(ids)
              }}
              onNewChat={() => setOverlay('newChat')}
              onNewGroup={() => setOverlay('newGroup')}
              onSettings={() => setOverlay('settings')}
              onContacts={() => setOverlay('contacts')}
              onSaveRequests={() => setOverlay('saveRequests')}
              onOpenStatus={(id) => id && setStatusUser({ userId: id })}
              onNotifications={() => setOverlay('notifications')}
              onSupport={() => setOverlay('support')}
            />
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
              badges={{ chats: chatUnread, groups: groupUnread, calls: 0 }}
            />
          )}
        </div>

        {/* Chat — only leaves when user taps back */}
        {chat && (
          <div className="absolute inset-0 z-[35] bg-white">
            <ChatWindow
              key={chat}
              contactId={chat}
              onBack={() => setChat(null)}
              onCall={(kind) => placeCall(chat, kind)}
              onOpenCalls={() => { setChat(null); setTab('calls') }}
              onOpenStatus={(userId, statusId) => {
                setChat(null)
                if (userId) setStatusUser({ userId, statusId })
              }}
            />
          </div>
        )}

        {group && (
          <div className="absolute inset-0 z-[35] bg-white">
            <GroupChat groupId={group} onBack={() => setGroup(null)} />
          </div>
        )}

        <Toast msg={toast} clear={clearToast} />
      {overlay === 'newChat' && (
          <div className="absolute inset-0 z-[35] bg-white">
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
        )}

        {overlay === 'newGroup' && (
          <div className="absolute inset-0 z-[35] bg-white">
            <CreateGroup
              onClose={() => setOverlay(null)}
              onCreated={(id) => {
                setOverlay(null)
                setTab('groups')
                setGroup(id)
              }}
            />
          </div>
        )}

        {overlay === 'settings' && (
          <div className="absolute inset-0 z-[35] bg-gray-50">
            <Settings
              onBack={() => setOverlay(null)}
              onSupport={() => setOverlay('support')}
              onLogout={async () => {
                setChat(null)
                setGroup(null)
                setCall(null)
                setTab('chats')
                restored.current = false
                await logout()
                setOverlay(null)
                setStage('login')
              }}
            />
          </div>
        )}

        {overlay === 'contacts' && (
          <div className="absolute inset-0 z-[35] bg-white">
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
        )}

        {overlay === 'saveRequests' && (
          <div className="absolute inset-0 z-[35] bg-white">
            <SaveRequests
              onClose={() => setOverlay(null)}
              onChat={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
            />
          </div>
        )}

        {overlay === 'notifications' && (
          <div className="absolute inset-0 z-[35] bg-white">
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
        )}

        {overlay === 'support' && (
          <div className="absolute inset-0 z-[35] bg-white">
            <Support onClose={() => setOverlay(null)} />
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

        {/* Call stays until user ends it */}
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
      </main>
    </div>
  )
}
