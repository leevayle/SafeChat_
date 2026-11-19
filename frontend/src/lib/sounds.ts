/** Lightweight Web-Audio chimes — no asset files needed. */

let sharedCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx()
    if (sharedCtx.state === 'suspended') void sharedCtx.resume()
    return sharedCtx
  } catch {
    return null
  }
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  gainPeak = 0.09,
  type: OscillatorType = 'sine',
) {
  const c = ctx()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = frequency
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gainPeak, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0008, start + duration)
  o.connect(g)
  g.connect(c.destination)
  o.start(start)
  o.stop(start + duration + 0.02)
}

/** Soft two-note “message received” while app is open but chat is not focused. */
export function playIncomingMessageChime() {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(880, t, 0.12, 0.07)
  tone(1175, t + 0.11, 0.16, 0.08)
}

/** Gentle single “tick” when a message lands in the open inbox. */
export function playInboxLandingChime() {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(988, t, 0.08, 0.05, 'triangle')
  tone(1319, t + 0.07, 0.1, 0.06, 'triangle')
}
