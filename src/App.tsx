import { Toast } from './components/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Splash } from './screens/Splash'
import { Welcome } from './screens/Welcome'
import { Signup } from './screens/Signup'
import { VerifyPhone } from './screens/VerifyPhone'
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
type Call = { id: string; kind: 'audio' | 'video'; ringId?: string }
type Overlay = 'newChat' | 'newGroup' | 'settings' | 'contacts' | 'saveRequests' | 'notifications' | 'support' | null

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { ready, me, logout, contacts, toast, clearToast, settings } = useStore()
  const [stage, setStage] = useState<Stage>('splash')
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [donePhase, setDonePhase] = useState<'setup' | 'success' | 'error'>('setup')
  const [doneError, setDoneError] = useState('')
  const [pendingReg, setPendingReg] = useState<{ phone: string; countryCode: string; phoneNumber: string } | null>(null)
  const [registrationToken, setRegistrationToken] = useState('')
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('chats')
  const [chat, setChat] = useState<string | null>(null)
  const [group, setGroup] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [call, setCall] = useState<Call | null>(null)
  const [incoming, setIncoming] = useState<(Call & { ringId?: string }) | null>(null)
  const [statusUser, setStatusUser] = useState<string | null>(null)

  const restored = useRef(false)
  const chatRef = useRef<string | null>(null)
  chatRef.current = chat

  /** Show call UI immediately; ring in background — never auto-navigate away */
  const placeCall = useCallback(async (id: string, kind: 'audio' | 'video') => {
    // Open call screen right away so UI never "clears"
    setCall({ id, kind })
    try {
      const { api } = await import('./api')
      const { ring } = await api.ring(id, kind)
      setCall((prev) =>
        prev && prev.id === id ? { ...prev, ringId: ring?.id } : prev,
      )
      api.logCall({ to: id, kind, status: 'outgoing', duration: '0:00' }).catch(() => {})
    } catch {
      /* stay on call screen even if network fails */
    }
  }, [])

  // Incoming rings — never steal focus from an active call
  useEffect(() => {
    if (stage !== 'app' || call) return
    let alive = true
    const tick = async () => {
      try {
        const { api } = await import('./api')
        const { incoming: rings } = await api.incomingRings()
        if (!alive || !rings?.length) return
        const r = rings[0]
        if (r?.from) {
          setIncoming((prev) =>
            prev?.ringId === r.id
              ? prev
              : { id: r.from, kind: r.kind === 'video' ? 'video' : 'audio', ringId: r.id },
          )
        }
      } catch {
        /* */
      }
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [stage, call])

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

  const afterPhone = async (phone: string, countryCode: string) => {
    setSubmitting(true)
    try {
      const phoneNumber = buildPhoneNumber(phone, countryCode)
      const response = await api.sendPhoneCode(phoneNumber)
      setPendingReg({ phone, countryCode, phoneNumber })
      setDevelopmentCode(response.development_code || null)
      setStage('verify')
    } finally {
      setSubmitting(false)
    }
  }

  const verifyPhone = async (code: string) => {
    if (!pendingReg) throw new Error('Enter your phone number again.')
    const response = await api.verifyPhoneCode(pendingReg.phoneNumber, code)
    setRegistrationToken(response.registration_token)
    setStage('profile')
  }

  const resendPhoneCode = async () => {
    if (!pendingReg) throw new Error('Enter your phone number again.')
    const response = await api.sendPhoneCode(pendingReg.phoneNumber)
    setDevelopmentCode(response.development_code || null)
    return response.development_code || null
  }

  const goApp = () => {
    // Mark this device as having completed a login so splash can skip Welcome
    try {
      localStorage.setItem('sc_has_logged_in', '1')
    } catch {
      /* ignore */
    }
    restored.current = true
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
            />
          )}
          {stage === 'signup' && (
            <Signup loading={submitting} onSubmit={afterPhone} onLogin={() => setStage('login')} onBack={() => setStage('welcome')} />
          )}
          {stage === 'loading' && <Loading />}
          {stage === 'verify' && pendingReg && (
            <VerifyPhone
              phoneNumber={pendingReg.phoneNumber}
              developmentCode={developmentCode}
              onVerify={verifyPhone}
              onResend={resendPhoneCode}
              onBack={() => setStage('signup')}
              onEditNumber={() => setStage('signup')}
            />
          )}
          {stage === 'profile' && pendingReg && (
            <Profile
              phone={pendingReg.phone}
              countryCode={pendingReg.countryCode}
              registrationToken={registrationToken}
              onBack={() => setStage('verify')}
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

  // ── Main app — no stage AnimatePresence (no hop) ───────
  return (
    <div className="flex min-h-dvh justify-center bg-[#f0f2f5]">
      <main className="relative h-dvh w-full min-h-[568px] max-w-[430px] overflow-hidden bg-white">
        {/* Tab pages stay mounted under overlays */}
        <div className="relative h-full">
          <div className={tab === 'chats' ? 'h-full' : 'hidden'}>
            <ChatsHome
              onOpenChat={setChat}
              onNewChat={() => setOverlay('newChat')}
              onNewGroup={() => setOverlay('newGroup')}
              onSettings={() => setOverlay('settings')}
              onContacts={() => setOverlay('contacts')}
              onSaveRequests={() => setOverlay('saveRequests')}
              onOpenStatus={(id) => id && setStatusUser(id)}
              onNotifications={() => setOverlay('notifications')}
              onSupport={() => setOverlay('support')}
            />
          </div>
          <div className={tab === 'groups' ? 'h-full' : 'hidden'}>
            <GroupsTab onOpen={setGroup} onCreate={() => setOverlay('newGroup')} />
          </div>
          <div className={tab === 'status' ? 'h-full' : 'hidden'}>
            <StatusTab onOpenStatus={(id) => id && setStatusUser(id)} />
          </div>
          <div className={tab === 'calls' ? 'h-full' : 'hidden'}>
            <CallsTab
              onCall={placeCall}
              onSimulateIncoming={() => {
                const id = contacts?.[0]?.id || 'amina'
                setIncoming({ id, kind: 'video' })
              }}
            />
          </div>
          {!chat && !group && !call && !overlay && !statusUser && (
            <BottomNav tab={tab} onChange={setTab} />
          )}
        </div>

        {/* Chat — only leaves when user taps back */}
        {chat && (
          <div className="absolute inset-0 z-20 bg-white">
            <ChatWindow
              contactId={chat}
              onBack={() => setChat(null)}
              onCall={(kind) => placeCall(chat, kind)}
            />
          </div>
        )}

        {group && (
          <div className="absolute inset-0 z-20 bg-white">
            <GroupChat groupId={group} onBack={() => setGroup(null)} />
          </div>
        )}

        <Toast msg={toast} clear={clearToast} />
      {overlay === 'newChat' && (
          <div className="absolute inset-0 z-[25] bg-white">
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
          <div className="absolute inset-0 z-[25] bg-white">
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
          <div className="absolute inset-0 z-[25] bg-gray-50">
            <Settings
              onBack={() => setOverlay(null)}
              onLogout={async () => {
                setOverlay(null)
                setChat(null)
                setGroup(null)
                setCall(null)
                setTab('chats')
                restored.current = false
                await logout()
                setStage('splash')
              }}
            />
          </div>
        )}

        {overlay === 'contacts' && (
          <div className="absolute inset-0 z-[25] bg-white">
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
          <div className="absolute inset-0 z-[25] bg-white">
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
          <div className="absolute inset-0 z-[25] bg-white">
            <Notifications
              onClose={() => setOverlay(null)}
              onOpenSaveRequests={() => setOverlay('saveRequests')}
              onOpenChat={(id) => {
                setOverlay(null)
                setTab('chats')
                setChat(id)
              }}
            />
          </div>
        )}

        {overlay === 'support' && (
          <div className="absolute inset-0 z-[25] bg-white">
            <Support onClose={() => setOverlay(null)} />
          </div>
        )}

        {statusUser && (
          <div className="absolute inset-0 z-[28]">
            <StatusViewer userId={statusUser} onClose={() => setStatusUser(null)} />
          </div>
        )}

        {/* Call stays until user ends it */}
        {call && (
          <div className="absolute inset-0 z-[40]">
            <CallScreen
              contactId={call.id}
              kind={call.kind}
              ringId={call.ringId}
              onEnd={() => setCall(null)}
            />
          </div>
        )}

        {incoming && !call && (
          <IncomingCall
            contactId={incoming.id}
            kind={incoming.kind}
            onDecline={async () => {
              if (incoming.ringId) {
                try {
                  const { api } = await import('./api')
                  await api.answerRing(incoming.ringId, 'declined')
                } catch {
                  /* */
                }
              }
              setIncoming(null)
            }}
            onAccept={async () => {
              if (incoming.ringId) {
                try {
                  const { api } = await import('./api')
                  await api.answerRing(incoming.ringId, 'accepted')
                } catch {
                  /* */
                }
              }
              setCall({ id: incoming.id, kind: incoming.kind, ringId: incoming.ringId })
              setIncoming(null)
            }}
          />
        )}
      </main>
    </div>
  )
}
