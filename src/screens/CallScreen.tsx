import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Video, VideoOff, SwitchCamera, Lock } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { useStore } from '../store'

type Props = {
  contactId: string
  kind: 'audio' | 'video'
  ringId?: string | null
  onEnd: () => void
}

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

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
      <span className="text-xs font-bold text-white/80 font-ui">{label}</span>
    </div>
  )
}

export function CallScreen({ contactId, kind, ringId, onEnd }: Props) {
  const { contacts } = useStore()
  const c =
    contacts.find((x) => x.id === contactId) || {
      id: contactId,
      name: contactId,
      hue: ['#7B2CBF', '#6389EB'] as [string, string],
      online: true,
      photo: null,
    }
  const [secs, setSecs] = useState(0)
  const [connected, setConnected] = useState(false)
  const [statusText, setStatusText] = useState(ringId ? 'Calling…' : 'Calling…')
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [flip, setFlip] = useState(false)
  const video = kind === 'video'

  // When ringId arrives later (optimistic UI), keep "Calling…"
  useEffect(() => {
    if (connected) return
    setStatusText(ringId ? 'Calling…' : 'Calling…')
  }, [ringId, connected])

  // Poll peer accept — NEVER auto-close; user must End
  useEffect(() => {
    if (!ringId) return
    let alive = true
    let phase = 0
    const labels = ['Calling…', 'Ringing…']
    const labelTimer = setInterval(() => {
      if (!alive) return
      phase = (phase + 1) % labels.length
      setStatusText((prev) => (prev === 'Connected' || prev === 'Call declined' || prev === 'No answer' ? prev : labels[phase]))
    }, 1400)

    const tick = async () => {
      try {
        const { ring } = await api.ringStatus(ringId)
        if (!alive) return
        if (ring.status === 'accepted') {
          setConnected(true)
          setStatusText('Connected')
          clearInterval(labelTimer)
        } else if (ring.status === 'declined') {
          setStatusText('Call declined')
          clearInterval(labelTimer)
          // stay on screen — user taps End
        }
      } catch {
        /* keep showing Calling */
      }
    }
    tick()
    const id = setInterval(tick, 1500)
    const noAnswer = setTimeout(() => {
      if (!alive) return
      setStatusText((s) => (s === 'Connected' ? s : 'No answer'))
      clearInterval(labelTimer)
    }, 45000)

    return () => {
      alive = false
      clearInterval(id)
      clearInterval(labelTimer)
      clearTimeout(noAnswer)
    }
  }, [ringId])

  // Inbound (no ringId or accepted): start timer after short connect
  useEffect(() => {
    if (ringId) return
    const t = setTimeout(() => {
      setConnected(true)
      setStatusText('Connected')
    }, 800)
    return () => clearTimeout(t)
  }, [ringId])

  useEffect(() => {
    if (!connected) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [connected])

  const display = connected ? fmt(secs) : statusText

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-white"
      style={{
        background: video
          ? `linear-gradient(160deg, ${c.hue[1]}, #1F2937)`
          : 'linear-gradient(180deg, #7B2CBF, #9C31A1 55%, #1F2937)',
      }}
    >
      {video && (
        <div className="absolute inset-0 flex items-center justify-center opacity-50">
          <Avatar contact={{ ...c, online: false }} size={200} />
        </div>
      )}

      <div className="relative z-10 flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1 text-sm font-bold font-display">
          <span className="text-brand-red">Safe</span>
          <span className="text-white">Chat</span>
          <span className="text-brand-blue">.</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
          <Lock size={12} /> Encrypted
        </span>
      </div>

      <div className={`relative z-10 flex flex-col items-center ${video ? 'mt-6' : 'mt-20'}`}>
        {!video && (
          <div className="flex h-44 w-44 items-center justify-center">
            <Avatar contact={{ ...c, online: false }} size={148} />
          </div>
        )}
        <h2 className="mt-3 text-3xl font-black font-display">{c.name}</h2>
        <p className="mt-1 font-bold tabular-nums text-white/90">{display}</p>
      </div>

      {video && (
        <div className="absolute right-4 top-28 z-20 flex h-36 w-24 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-brand-blue to-brand-purple ring-2 ring-white/60">
          {camOff ? <VideoOff /> : <span className="text-sm font-extrabold">You</span>}
        </div>
      )}

      <div className="flex-1" />
      <div className="relative z-10 mx-4 mb-[max(2rem,env(safe-area-inset-bottom))] flex items-end justify-around rounded-[2rem] bg-black/25 px-3 py-5">
        <Ctl label={muted ? 'Unmute' : 'Mute'} active={muted} onClick={() => setMuted(!muted)}>
          {muted ? <MicOff /> : <Mic />}
        </Ctl>
        {video ? (
          <>
            <Ctl label="Camera" active={camOff} onClick={() => setCamOff(!camOff)}>
              {camOff ? <VideoOff /> : <Video />}
            </Ctl>
            <Ctl label="Flip" onClick={() => setFlip(!flip)}>
              <SwitchCamera />
            </Ctl>
          </>
        ) : (
          <Ctl label="Speaker" active={speaker} onClick={() => setSpeaker(!speaker)}>
            {speaker ? <Volume2 /> : <VolumeX />}
          </Ctl>
        )}
        <Ctl label="End" danger onClick={onEnd}>
          <PhoneOff size={28} />
        </Ctl>
      </div>
    </div>
  )
}
