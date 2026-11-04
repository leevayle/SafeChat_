import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Video, VideoOff } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { useStore } from '../store'
import { isRealtimeOpen, wsCall } from '../realtime'
import { api } from '../api'

type Props = {
  contactId: string
  kind: 'audio' | 'video'
  ringId?: string | null
  remoteOfferSdp?: string | null
  peerName?: string | null
  peerUsername?: string | null
  onEnd: () => void
}

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function newCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function Ctl({
  children,
  active,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center justify-center rounded-full shadow-lg active:scale-90 ${
          danger
            ? 'h-[72px] w-[72px] bg-brand-red text-white'
            : active
              ? 'h-14 w-14 bg-white text-brand-purple'
              : 'h-14 w-14 bg-white/20 text-white'
        }`}
      >
        {children}
      </button>
      <span className="text-xs font-bold text-white/80">{label}</span>
    </div>
  )
}

export function CallScreen({
  contactId,
  kind,
  ringId,
  remoteOfferSdp,
  peerName,
  peerUsername,
  onEnd,
}: Props) {
  const { contacts, me, refreshCalls } = useStore()
  const contact = contacts.find((x) => x.id === contactId)

  const displayName = useMemo(() => {
    if (peerName && !/^[a-f0-9]{20,}$/i.test(peerName)) return peerName
    if (contact?.name && contact.name !== contactId) return contact.name
    if (peerUsername) return peerUsername.startsWith('@') ? peerUsername : `@${peerUsername}`
    if (contact?.username) return `@${contact.username}`
    if (contact?.phone) return contact.phone
    if (/^[a-f0-9]{24}$/i.test(contactId)) return 'SafeChat user'
    return contactId
  }, [contact, contactId, peerName, peerUsername])

  const avatarContact = {
    id: contactId,
    name: displayName,
    hue: (contact?.hue as [string, string]) || (['#7B2CBF', '#6389EB'] as [string, string]),
    online: true,
    photo: contact?.photo ?? null,
  }

  const isVideo = kind === 'video'
  const isCallee = !!(ringId || remoteOfferSdp)

  const [secs, setSecs] = useState(0)
  const [connected, setConnected] = useState(false)
  const [statusText, setStatusText] = useState(isCallee ? 'Connecting…' : 'Calling…')
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(true)
  const [camOff, setCamOff] = useState(false)
  const [pip, setPip] = useState({ x: 16, y: 72 })
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream>(new MediaStream())
  const callIdRef = useRef(ringId || newCallId())
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const intentionalEndRef = useRef(false)
  const connectedRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const loggedRef = useRef(false)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const remoteDescSetRef = useRef(false)
  const offerDoneRef = useRef(false)
  const answerDoneRef = useRef(false)

  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [connected])

  const playRemote = useCallback(() => {
    const stream = remoteStreamRef.current
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream
      }
      void remoteVideoRef.current.play().catch(() => {})
    }
    if (!remoteAudioRef.current) {
      const a = document.createElement('audio')
      a.autoplay = true
      a.setAttribute('playsinline', 'true')
      ;(a as any).playsInline = true
      remoteAudioRef.current = a
    }
    if (remoteAudioRef.current.srcObject !== stream) {
      remoteAudioRef.current.srcObject = stream
    }
    remoteAudioRef.current.muted = !speaker
    void remoteAudioRef.current.play().catch(() => {})
  }, [speaker])

  const cleanupMedia = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((s) => {
        try {
          s.track?.stop()
        } catch {
          /* */
        }
      })
      pcRef.current?.close()
    } catch {
      /* */
    }
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current.getTracks().forEach((t) => {
      try {
        remoteStreamRef.current.removeTrack(t)
        t.stop()
      } catch {
        /* */
      }
    })
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }
  }, [])

  const logCallOnce = useCallback(
    async (status: string) => {
      if (loggedRef.current) return
      loggedRef.current = true
      const duration = connectedRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        : 0
      try {
        await api.logCall({
          peer_id: contactId,
          kind,
          direction: status === 'missed' ? 'missed' : isCallee ? 'in' : 'out',
          status,
          duration_seconds: duration,
          call_id: callIdRef.current,
        })
        void refreshCalls()
      } catch {
        /* */
      }
    },
    [contactId, isCallee, kind, refreshCalls],
  )

  const hangup = useCallback(
    (reason: string = 'ended') => {
      if (intentionalEndRef.current) return
      intentionalEndRef.current = true
      if (isRealtimeOpen()) {
        wsCall({ a: 'hangup', to: contactId, callId: callIdRef.current, reason })
      }
      const status = connectedRef.current ? 'completed' : isCallee ? 'missed' : 'cancelled'
      void logCallOnce(status)
      cleanupMedia()
      onEnd()
    },
    [cleanupMedia, contactId, isCallee, logCallOnce, onEnd],
  )

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.splice(0)
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* */
      }
    }
  }, [])

  const ensurePc = useCallback(async () => {
    if (pcRef.current) return pcRef.current

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    pcRef.current = pc

    // Explicit recv slots so audio/video always negotiate
    pc.addTransceiver('audio', { direction: 'sendrecv' })
    if (isVideo) pc.addTransceiver('video', { direction: 'sendrecv' })

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || intentionalEndRef.current) return
      wsCall({
        a: 'ice',
        to: contactId,
        callId: callIdRef.current,
        candidate: ev.candidate.toJSON(),
      })
    }

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected' || st === 'completed') {
        connectedRef.current = true
        startedAtRef.current = Date.now()
        setConnected(true)
        setStatusText('Connected')
        playRemote()
      } else if (st === 'failed') {
        setStatusText('Connection failed')
      }
    }

    pc.ontrack = (ev) => {
      const track = ev.track
      // Replace same-kind track if renegotiating
      remoteStreamRef.current.getTracks()
        .filter((t) => t.kind === track.kind)
        .forEach((t) => {
          remoteStreamRef.current.removeTrack(t)
        })
      remoteStreamRef.current.addTrack(track)
      playRemote()
      track.onunmute = () => playRemote()
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    localStreamRef.current = stream
    // Prefer replaceTrack on existing transceivers
    for (const track of stream.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind || (!s.track && (s as any).track == null && pc.getTransceivers().some((tr) => tr.sender === s && tr.receiver.track?.kind === track.kind)))
      const tr = pc.getTransceivers().find((x) => x.receiver.track?.kind === track.kind || x.mid === null)
      if (tr) {
        await tr.sender.replaceTrack(track)
        tr.direction = 'sendrecv'
      } else {
        pc.addTrack(track, stream)
      }
    }
    // Simpler reliable path: always addTrack if no sender yet
    for (const track of stream.getTracks()) {
      const has = pc.getSenders().some((s) => s.track === track || s.track?.kind === track.kind)
      if (!has) pc.addTrack(track, stream)
    }

    if (localVideoRef.current && isVideo) {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.muted = true
      void localVideoRef.current.play().catch(() => {})
    }
    return pc
  }, [contactId, isVideo, playRemote])

  const applyRemoteOffer = useCallback(
    async (sdp: string, callId?: string) => {
      if (answerDoneRef.current) return
      answerDoneRef.current = true
      if (callId) callIdRef.current = callId
      try {
        setStatusText('Connecting…')
        const pc = await ensurePc()
        await pc.setRemoteDescription({ type: 'offer', sdp })
        remoteDescSetRef.current = true
        await flushIce(pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        wsCall({
          a: 'answer',
          to: contactId,
          callId: callIdRef.current,
          sdp: answer.sdp || '',
          kind,
        })
        playRemote()
      } catch (e: any) {
        answerDoneRef.current = false
        setStatusText(e?.message || 'Could not answer')
      }
    },
    [contactId, ensurePc, flushIce, kind, playRemote],
  )

  const applyRemoteAnswer = useCallback(
    async (sdp: string) => {
      try {
        const pc = pcRef.current || (await ensurePc())
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp })
          remoteDescSetRef.current = true
          await flushIce(pc)
          setStatusText('Connecting…')
          playRemote()
        } else if (!remoteDescSetRef.current) {
          setTimeout(() => void applyRemoteAnswer(sdp), 250)
        }
      } catch {
        /* */
      }
    },
    [ensurePc, flushIce, playRemote],
  )

  useEffect(() => {
    if (!isCallee) return
    wsCall({ a: 'accepted', to: contactId, callId: callIdRef.current || ringId || '' } as any)
    setStatusText('Connecting…')
  }, [contactId, isCallee, ringId])

  useEffect(() => {
    if (isCallee) return
    if (offerDoneRef.current) return
    offerDoneRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        setStatusText(isRealtimeOpen() ? 'Ringing…' : 'Connecting…')
        wsCall({
          a: 'ring',
          to: contactId,
          callId: callIdRef.current,
          kind,
          fromName: me?.name || me?.username,
          fromUsername: me?.username,
        } as any)
        const pc = await ensurePc()
        if (cancelled || intentionalEndRef.current) return
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        wsCall({
          a: 'offer',
          to: contactId,
          callId: callIdRef.current,
          sdp: offer.sdp || '',
          kind,
          fromName: me?.name || me?.username,
          fromUsername: me?.username,
        } as any)
        setStatusText('Ringing…')
      } catch (e: any) {
        if (!cancelled) setStatusText(e?.message || 'Mic/camera permission needed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contactId, ensurePc, isCallee, kind, me?.name, me?.username])

  useEffect(() => {
    if (!isCallee || !remoteOfferSdp) return
    void applyRemoteOffer(remoteOfferSdp, ringId || undefined)
  }, [applyRemoteOffer, isCallee, remoteOfferSdp, ringId])

  useEffect(() => {
    const onCall = (ev: Event) => {
      const p = (ev as CustomEvent).detail as {
        a: string
        from?: string
        callId?: string
        sdp?: string
        candidate?: RTCIceCandidateInit
      }
      if (!p) return
      if (p.from && p.from !== contactId && p.a !== 'unavailable') return
      if (p.callId && callIdRef.current && p.callId !== callIdRef.current) {
        if (p.a === 'offer' || p.a === 'answer') callIdRef.current = p.callId
        else if (p.a === 'ice' || p.a === 'hangup') {
          if (p.callId !== callIdRef.current) return
        }
      }
      ;(async () => {
        try {
          if (p.a === 'offer' && p.sdp) await applyRemoteOffer(p.sdp, p.callId)
          else if (p.a === 'answer' && p.sdp) {
            setStatusText('Connecting…')
            await applyRemoteAnswer(p.sdp)
          } else if (p.a === 'accepted') setStatusText('Connecting…')
          else if (p.a === 'ice' && p.candidate) {
            if (pcRef.current && remoteDescSetRef.current) {
              await pcRef.current.addIceCandidate(p.candidate)
            } else pendingIceRef.current.push(p.candidate)
          } else if (p.a === 'hangup') {
            if (intentionalEndRef.current) return
            intentionalEndRef.current = true
            setStatusText('Call ended')
            void logCallOnce(connectedRef.current ? 'completed' : isCallee ? 'missed' : 'cancelled')
            cleanupMedia()
            setTimeout(() => onEnd(), 350)
          } else if (p.a === 'unavailable') setStatusText('Unavailable')
        } catch {
          /* */
        }
      })()
    }
    window.addEventListener('sc:rt-call', onCall)
    return () => window.removeEventListener('sc:rt-call', onCall)
  }, [applyRemoteAnswer, applyRemoteOffer, cleanupMedia, contactId, isCallee, logCallOnce, onEnd])

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted
    })
  }, [muted])
  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach((tr) => {
      tr.enabled = !camOff
    })
  }, [camOff])
  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !speaker
  }, [speaker])

  useEffect(() => () => cleanupMedia(), [cleanupMedia])

  const onPipPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { ox: e.clientX, oy: e.clientY, sx: pip.x, sy: pip.y }
  }
  const onPipPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.ox
    const dy = e.clientY - dragRef.current.oy
    setPip({
      x: Math.min(Math.max(8, dragRef.current.sx + dx), Math.max(8, window.innerWidth - 120)),
      y: Math.min(Math.max(48, dragRef.current.sy + dy), Math.max(48, window.innerHeight - 200)),
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-gradient-to-b from-[#1a0b2e] via-[#2d1b4e] to-[#0f0a1a] text-white">
      {/* Always mount remote media elements so tracks can attach */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          isVideo && connected ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {isVideo && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
          className="absolute z-20 h-40 w-[7.25rem] touch-none rounded-2xl object-cover shadow-2xl ring-2 ring-white/25"
          style={{ left: pip.x, top: pip.y }}
        />
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-16">
        {!isVideo || !connected ? (
          <>
            <Avatar contact={avatarContact as any} size={112} />
            <p className="text-2xl font-black">{displayName}</p>
          </>
        ) : (
          <p className="mt-8 text-lg font-bold drop-shadow">{displayName}</p>
        )}
        <p className="text-sm font-bold text-white/70">{connected ? fmt(secs) : statusText}</p>
      </div>

      <div className="relative z-10 flex items-end justify-center gap-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Ctl active={muted} onClick={() => setMuted((m) => !m)} label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </Ctl>
        <Ctl active={speaker} onClick={() => setSpeaker((s) => !s)} label="Speaker">
          {speaker ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </Ctl>
        {isVideo && (
          <Ctl active={camOff} onClick={() => setCamOff((v) => !v)} label={camOff ? 'Cam on' : 'Cam off'}>
            {camOff ? <VideoOff size={22} /> : <Video size={22} />}
          </Ctl>
        )}
        <Ctl danger onClick={() => hangup('ended')} label="End">
          <PhoneOff size={28} />
        </Ctl>
      </div>
    </div>
  )
}
