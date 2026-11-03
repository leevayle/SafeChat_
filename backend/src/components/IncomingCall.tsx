import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { Avatar } from './Avatar'
import { useStore } from '../store'

type Props = {
  contactId: string
  kind: 'audio' | 'video'
  onAccept: () => void
  onDecline: () => void
}

/** Soft oscillating ring via Web Audio API */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (!active) return
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ctxRef.current = ctx
    let stopped = false
    const playBurst = () => {
      if (stopped) return
      const now = ctx.currentTime
      ;[0, 0.2].forEach((off) => {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'
        o.frequency.value = 880
        g.gain.setValueAtTime(0, now + off)
        g.gain.linearRampToValueAtTime(0.08, now + off + 0.04)
        g.gain.linearRampToValueAtTime(0, now + off + 0.18)
        o.connect(g)
        g.connect(ctx.destination)
        o.start(now + off)
        o.stop(now + off + 0.2)
      })
    }
    playBurst()
    const id = window.setInterval(playBurst, 1800)
    return () => {
      stopped = true
      clearInterval(id)
      ctx.close().catch(() => {})
    }
  }, [active])
}

export function IncomingCall({ contactId, kind, onAccept, onDecline }: Props) {
  const { contacts } = useStore()
  const c =
    contacts.find((x) => x.id === contactId) || {
      id: contactId,
      name: contactId,
      hue: ['#7B2CBF', '#6389EB'] as [string, string],
      online: true,
      photo: null,
    }
  useRingtone(true)

  return (
    <>
      <motion.div
        className="absolute inset-0 z-40 bg-ink/45 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        role="dialog"
        aria-label="Incoming call"
        className="absolute inset-x-4 top-[max(1.5rem,env(safe-area-inset-top))] z-50 rounded-[2rem] bg-white p-6 text-center shadow-2xl"
        initial={{ y: -40, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-brand-purple">
          {kind === 'video' ? <Video size={16} /> : <Phone size={16} />} Incoming {kind} call
        </p>
        <div className="relative mx-auto mt-5 flex h-28 w-28 items-center justify-center">
          {[0, 0.55].map((d) => (
            <motion.span
              key={d}
              className="absolute inset-0 rounded-full bg-brand-purple/15"
              animate={{ scale: [1, 1.35], opacity: [0.55, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: d, ease: 'easeOut' }}
            />
          ))}
          <Avatar contact={{ ...c, online: false }} size={88} />
        </div>
        <h3 className="mt-3 text-2xl font-black">{c.name}</h3>
        <p className="font-semibold text-gray-500">SafeChat {kind}…</p>
        <div className="mt-6 flex justify-center gap-12">
          {[
            { l: 'Decline', cls: 'bg-brand-red shadow-brand-red/40', I: PhoneOff, f: onDecline },
            {
              l: 'Accept',
              cls: 'bg-green-500 shadow-green-500/40',
              I: kind === 'video' ? Video : Phone,
              f: onAccept,
            },
          ].map(({ l, cls, I, f }) => (
            <div key={l} className="flex flex-col items-center gap-1.5">
              <motion.button
                whileTap={{ scale: 0.9 }}
                animate={l === 'Accept' ? { scale: [1, 1.06, 1] } : undefined}
                transition={{ repeat: Infinity, duration: 1.4 }}
                onClick={f}
                aria-label={l}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg ${cls}`}
              >
                <I size={26} />
              </motion.button>
              <span className="text-xs font-bold text-gray-500">{l}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  )
}
