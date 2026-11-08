import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Users, Bot, X } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'

type Mode = 'menu' | 'solo-diff' | 'solo' | 'pick-friend' | 'waiting' | 'live'

type Props = {
  onClose: () => void
  initialGameId?: string | null
}

const WINS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function winnerOf(board: string[]): string | null {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  if (board.every(Boolean)) return 'draw'
  return null
}

function emptyCells(board: string[]) {
  return board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
}

/** Simple AI: higher difficulty = better play */
function aiMove(board: string[], ai: string, human: string, difficulty: number): number {
  const free = emptyCells(board)
  if (!free.length) return -1
  if (difficulty >= 2) {
    // win if possible
    for (const i of free) {
      const t = [...board]
      t[i] = ai
      if (winnerOf(t) === ai) return i
    }
    // block
    for (const i of free) {
      const t = [...board]
      t[i] = human
      if (winnerOf(t) === human) return i
    }
  }
  if (difficulty >= 3) {
    if (free.includes(4)) return 4
    const corners = free.filter((i) => [0, 2, 6, 8].includes(i))
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  }
  return free[Math.floor(Math.random() * free.length)]
}

export function TicTacToe({ onClose, initialGameId }: Props) {
  const { contacts, me, showToast } = useStore()
  const [mode, setMode] = useState<Mode>(initialGameId ? 'live' : 'menu')
  const [diff, setDiff] = useState(1)
  const [board, setBoard] = useState<string[]>(Array(9).fill(''))
  const [soloTurn, setSoloTurn] = useState<'X' | 'O'>('X')
  const [scores, setScores] = useState({ me: 0, opp: 0 })
  const [setNum, setSetNum] = useState(1)
  const [status, setStatus] = useState<'play' | 'set_over' | 'match_over'>('play')
  const [setMsg, setSetMsg] = useState('')
  const [gameId, setGameId] = useState<string | null>(initialGameId || null)
  const [live, setLive] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const matchOver = scores.me >= 2 || scores.opp >= 2

  const resetBoard = () => {
    setBoard(Array(9).fill(''))
    setSoloTurn('X')
    setStatus('play')
    setSetMsg('')
  }

  const startSolo = (d: number) => {
    setDiff(d)
    setScores({ me: 0, opp: 0 })
    setSetNum(1)
    resetBoard()
    setMode('solo')
  }

  const applySoloResult = useCallback(
    (w: string | null, nextBoard: string[]) => {
      if (!w) return
      if (w === 'draw') {
        setSetMsg('Draw — play again')
        setStatus('set_over')
        return
      }
      const iWon = w === 'X'
      setScores((s) => {
        const next = { me: s.me + (iWon ? 1 : 0), opp: s.opp + (iWon ? 0 : 1) }
        if (next.me >= 2 || next.opp >= 2) {
          setStatus('match_over')
          setSetMsg(next.me >= 2 ? 'You won the match!' : 'AI won the match')
        } else {
          setStatus('set_over')
          setSetMsg(iWon ? 'You took the set' : 'AI took the set')
          setSetNum((n) => n + 1)
        }
        return next
      })
    },
    [],
  )

  const playSolo = (cell: number) => {
    if (mode !== 'solo' || status !== 'play' || soloTurn !== 'X' || board[cell]) return
    const next = [...board]
    next[cell] = 'X'
    setBoard(next)
    const w = winnerOf(next)
    if (w) {
      applySoloResult(w, next)
      return
    }
    setSoloTurn('O')
    window.setTimeout(() => {
      setBoard((cur) => {
        const ai = aiMove(cur, 'O', 'X', diff)
        if (ai < 0) return cur
        const b = [...cur]
        b[ai] = 'O'
        const ww = winnerOf(b)
        if (ww) applySoloResult(ww, b)
        else setSoloTurn('X')
        return b
      })
    }, 280)
  }

  const inviteFriend = async (peerId: string) => {
    setBusy(true)
    try {
      const g = await api.tictactoeInvite(peerId)
      setGameId(g.id)
      setLive(g)
      setMode('waiting')
      showToast('Invite sent')
    } catch (e: any) {
      showToast(e?.message || 'Could not invite')
    } finally {
      setBusy(false)
    }
  }

  const loadLive = async (id: string) => {
    try {
      const g = await api.tictactoeGet(id)
      setLive(g)
      setBoard(g.board || Array(9).fill(''))
      setGameId(id)
      const meId = me?.id
      setScores({
        me: Number(g.scores?.[meId || ''] || 0),
        opp: Number(
          Object.entries(g.scores || {}).find(([k]) => k !== meId)?.[1] || 0,
        ),
      })
      setSetNum(g.set || 1)
      if (g.status === 'finished' || g.status === 'left') setStatus('match_over')
      else setStatus('play')
      setMode('live')
    } catch {
      showToast('Could not load game')
    }
  }

  useEffect(() => {
    if (initialGameId) void loadLive(initialGameId)
  }, [initialGameId])

  useEffect(() => {
    const onMove = (ev: Event) => {
      const d = (ev as CustomEvent).detail
      if (!d?.state || (gameId && d.game_id !== gameId && d.state?.id !== gameId)) return
      const g = d.state
      setLive(g)
      setBoard(g.board || Array(9).fill(''))
      const meId = me?.id
      setScores({
        me: Number(g.scores?.[meId || ''] || 0),
        opp: Number(Object.entries(g.scores || {}).find(([k]) => k !== meId)?.[1] || 0),
      })
      setSetNum(g.set || 1)
      if (g.status === 'finished') {
        setStatus('match_over')
        setSetMsg(g.winner === meId ? 'You won the match!' : 'You lost the match')
      }
    }
    const onStart = (ev: Event) => {
      const d = (ev as CustomEvent).detail
      if (d?.game_id) void loadLive(String(d.game_id))
    }
    window.addEventListener('sc:rt-game-move', onMove)
    window.addEventListener('sc:rt-game-start', onStart)
    return () => {
      window.removeEventListener('sc:rt-game-move', onMove)
      window.removeEventListener('sc:rt-game-start', onStart)
    }
  }, [gameId, me?.id])

  const playLive = async (cell: number) => {
    if (!gameId || !live || live.status !== 'active') return
    if (live.turn !== me?.id) return
    if (board[cell]) return
    setBusy(true)
    try {
      const g = await api.tictactoeMove(gameId, cell)
      setLive(g)
      setBoard(g.board || Array(9).fill(''))
      const meId = me?.id
      setScores({
        me: Number(g.scores?.[meId || ''] || 0),
        opp: Number(Object.entries(g.scores || {}).find(([k]) => k !== meId)?.[1] || 0),
      })
      setSetNum(g.set || 1)
      if (g.status === 'finished') {
        setStatus('match_over')
        setSetMsg(g.winner === meId ? 'You won the match!' : 'You lost the match')
      }
    } catch (e: any) {
      showToast(e?.message || 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    if (gameId) {
      try {
        await api.tictactoeLeave(gameId)
      } catch {
        /* */
      }
    }
    onClose()
  }

  const friends = useMemo(
    () => (contacts || []).filter((c: any) => c.id !== me?.id && (c.peerId || c.id)),
    [contacts, me?.id],
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#f7f5ff]">
      <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (mode === 'menu') onClose()
            else if (status === 'match_over' || mode === 'waiting') onClose()
            else setMode('menu')
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 text-sm font-black text-ink">Tic Tac Toe</p>
        <button type="button" onClick={() => void leave()} className="rounded-full px-3 py-1.5 text-xs font-extrabold text-brand-red">
          Leave
        </button>
      </div>

      {mode === 'menu' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <p className="mb-2 text-center text-sm font-semibold text-gray-500">Best of 3 sets</p>
          <button
            type="button"
            onClick={() => setMode('solo-diff')}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white"
          >
            <Bot size={18} /> Play alone
          </button>
          <button
            type="button"
            onClick={() => setMode('pick-friend')}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-brand-purple/10 py-3.5 text-sm font-extrabold text-brand-purple"
          >
            <Users size={18} /> Play with a friend
          </button>
        </div>
      )}

      {mode === 'solo-diff' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
          <p className="mb-2 text-sm font-extrabold text-ink">Difficulty</p>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => startSolo(d)}
              className="w-full max-w-xs rounded-full bg-white py-3 text-sm font-extrabold text-ink shadow-sm ring-1 ring-black/5"
            >
              Level {d}
            </button>
          ))}
        </div>
      )}

      {mode === 'pick-friend' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="mb-2 px-2 text-xs font-bold text-gray-400">Choose a contact</p>
          {friends.length === 0 && (
            <p className="px-2 py-8 text-center text-sm font-semibold text-gray-400">No contacts yet</p>
          )}
          {friends.map((c: any) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => void inviteFriend(c.peerId || c.id)}
              className="mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple/15 text-sm font-black text-brand-purple">
                {(c.savedName || c.name || '?').slice(0, 1)}
              </span>
              <span className="font-extrabold text-ink">{c.savedName || c.name}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'waiting' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <p className="text-sm font-extrabold text-ink">Waiting for friend…</p>
          <p className="mt-1 text-xs font-semibold text-gray-400">They will get a notification</p>
        </div>
      )}

      {(mode === 'solo' || mode === 'live') && (
        <div className="flex min-h-0 flex-1 flex-col items-center px-4 py-4">
          <div className="mb-3 flex w-full max-w-sm items-center justify-between text-xs font-extrabold">
            <span className="text-brand-purple">You {scores.me}</span>
            <span className="text-gray-400">Set {setNum}/3</span>
            <span className="text-ink">{mode === 'solo' ? 'AI' : 'Friend'} {scores.opp}</span>
          </div>
          <div className="grid w-full max-w-sm grid-cols-3 gap-2">
            {board.map((cell, i) => (
              <button
                key={i}
                type="button"
                disabled={busy || status !== 'play' || !!cell}
                onClick={() => (mode === 'solo' ? playSolo(i) : void playLive(i))}
                className="flex aspect-square items-center justify-center rounded-2xl bg-white text-3xl font-black text-ink shadow-sm ring-1 ring-black/5 disabled:opacity-80"
              >
                {cell === 'X' ? <span className="text-brand-purple">X</span> : cell === 'O' ? <span className="text-[#E3404C]">O</span> : ''}
              </button>
            ))}
          </div>
          {mode === 'live' && live?.turn && status === 'play' && (
            <p className="mt-3 text-xs font-bold text-gray-400">
              {live.turn === me?.id ? 'Your turn' : "Friend's turn"}
            </p>
          )}
          {(status === 'set_over' || status === 'match_over') && (
            <div className="mt-4 w-full max-w-sm space-y-2 rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-black/5">
              <p className="text-sm font-extrabold text-ink">{setMsg || 'Set over'}</p>
              {status === 'set_over' && !matchOver && (
                <button
                  type="button"
                  className="w-full rounded-full bg-brand-purple py-2.5 text-sm font-extrabold text-white"
                  onClick={resetBoard}
                >
                  Next set
                </button>
              )}
              {status === 'match_over' && (
                <>
                  <button
                    type="button"
                    className="w-full rounded-full bg-brand-purple py-2.5 text-sm font-extrabold text-white"
                    onClick={() => {
                      setScores({ me: 0, opp: 0 })
                      setSetNum(1)
                      resetBoard()
                      if (mode === 'solo') startSolo(diff)
                      else setMode('menu')
                    }}
                  >
                    Play again
                  </button>
                  <button type="button" className="w-full py-2 text-sm font-bold text-gray-500" onClick={onClose}>
                    Close
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
