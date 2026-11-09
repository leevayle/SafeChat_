import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Users, Bot, Sparkles } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'
import { Avatar } from './Avatar'

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

function aiMove(board: string[], ai: string, human: string, difficulty: number): number {
  const free = emptyCells(board)
  if (!free.length) return -1
  if (difficulty >= 2) {
    for (const i of free) {
      const t = [...board]
      t[i] = ai
      if (winnerOf(t) === ai) return i
    }
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
  const [lastMoveCell, setLastMoveCell] = useState<number | null>(null)
  const [selectedFriend, setSelectedFriend] = useState<{ id: string; name: string } | null>(null)
  const [inviteName, setInviteName] = useState('')
  const [showRequests, setShowRequests] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [reqBusy, setReqBusy] = useState<string | null>(null)

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

  const applySoloResult = useCallback((w: string | null) => {
    if (!w) return
    if (w === 'draw') {
      setSetMsg('Draw — next set')
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
  }, [])

  const playSolo = (cell: number) => {
    if (mode !== 'solo' || status !== 'play' || soloTurn !== 'X' || board[cell]) return
    const next = [...board]
    next[cell] = 'X'
    setBoard(next)
    const w = winnerOf(next)
    if (w) {
      applySoloResult(w)
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
        if (ww) applySoloResult(ww)
        else setSoloTurn('X')
        return b
      })
    }, 280)
  }

  const inviteFriend = async () => {
    if (!selectedFriend) return
    setBusy(true)
    setInviteName(selectedFriend.name)
    try {
      const g = await api.tictactoeInvite(selectedFriend.id)
      setGameId(g.id)
      setLive(g)
      setMode('waiting')
      showToast('Invite sent')
    } catch (e: any) {
      const msg = String(e?.message || e?.detail || 'Could not invite')
      showToast(msg)
      setMode('pick-friend')
    } finally {
      setBusy(false)
    }
  }

  const loadGameRequests = async () => {
    try {
      const { notifications } = await api.listNotifications()
      const list = (notifications || []).filter((n: any) => n.type === 'game_invite' && !n.read)
      setRequests(list)
    } catch {
      setRequests([])
    }
  }

  const acceptRequest = async (n: any) => {
    const gid = String(n.game_id || n.metadata?.game_id || '')
    if (!gid) {
      showToast('Invite expired')
      return
    }
    setReqBusy(gid)
    try {
      await api.tictactoeAccept(gid)
      try {
        await api.markNotificationRead(String(n.id))
      } catch { /* */ }
      setShowRequests(false)
      setRequests((prev) => prev.filter((x) => x.id !== n.id))
      await loadLive(gid)
      showToast('Game on')
    } catch (e: any) {
      showToast(e?.message || 'Could not join')
    } finally {
      setReqBusy(null)
    }
  }

  const declineRequest = async (n: any) => {
    const gid = String(n.game_id || n.metadata?.game_id || '')
    setReqBusy(gid || String(n.id))
    try {
      if (gid) await api.tictactoeDecline(gid)
      try {
        await api.markNotificationRead(String(n.id))
      } catch { /* */ }
      setRequests((prev) => prev.filter((x) => x.id !== n.id))
      showToast('Invite declined')
    } catch {
      showToast('Could not decline')
    } finally {
      setReqBusy(null)
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
        opp: Number(Object.entries(g.scores || {}).find(([k]) => k !== meId)?.[1] || 0),
      })
      setSetNum(g.set || 1)
      if (g.status === 'finished' || g.status === 'left') setStatus('match_over')
      else setStatus('play')
      setMode('live')
      setLastMoveCell(null)
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
      if (!d?.state) return
      const g = d.state
      const gid = String(d.game_id || g.id || '')
      if (gameId && gid && gid !== gameId) return
      // Detect which cell changed for highlight
      setBoard((prev) => {
        const next = g.board || Array(9).fill('')
        for (let i = 0; i < 9; i++) {
          if ((prev[i] || '') !== (next[i] || '') && next[i]) {
            setLastMoveCell(i)
            break
          }
        }
        return next
      })
      applyGameState(g)
      if (!gameId && gid) setGameId(gid)
    }
    const onStart = (ev: Event) => {
      const d = (ev as CustomEvent).detail || {}
      const gid = String(d.game_id || d.gameId || d.state?.id || '')
      if (!gid) return
      // If this client is waiting for this invite (or any open board), enter live
      if (gameId && gid !== gameId && mode === 'waiting') {
        // different game while waiting — still allow if we invited
      }
      setGameId(gid)
      if (d.state) {
        setLive(d.state)
        setBoard(d.state.board || Array(9).fill(''))
        const meId = me?.id
        setScores({
          me: Number(d.state.scores?.[meId || ''] || 0),
          opp: Number(Object.entries(d.state.scores || {}).find(([k]) => k !== meId)?.[1] || 0),
        })
        setSetNum(d.state.set || 1)
        setStatus('play')
        setMode('live')
        setLastMoveCell(null)
      } else {
        void loadLive(gid)
      }
    }
    window.addEventListener('sc:rt-game-move', onMove)
    window.addEventListener('sc:rt-game-start', onStart)
    return () => {
      window.removeEventListener('sc:rt-game-move', onMove)
      window.removeEventListener('sc:rt-game-start', onStart)
    }
  }, [gameId, me?.id, mode])

  const applyGameState = (g: any) => {
    if (!g) return
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
    } else if (g.set_winner) {
      setStatus('set_over')
      setSetMsg(g.set_winner === meId ? 'You took the set' : g.set_winner === 'draw' ? 'Draw — next set' : 'Friend took the set')
    } else {
      setStatus('play')
    }
  }

  const myMark = live?.marks?.[me?.id || ''] || (live?.challenger_id === me?.id ? 'X' : 'O')
  const myTurnLive = mode === 'live' && status === 'play' && live?.status === 'active' && live?.turn === me?.id

  const playLive = async (cell: number) => {
    if (!gameId || !live || live.status !== 'active') return
    if (live.turn !== me?.id) return
    if (board[cell]) return
    const mark = myMark || 'X'
    // Optimistic local board + turn flip so opponent sees after WS
    const optimistic = [...board]
    optimistic[cell] = mark
    setBoard(optimistic)
    setLastMoveCell(cell)
    setLive((prev: any) =>
      prev
        ? {
            ...prev,
            board: optimistic,
            turn: (prev.players || []).find((p: string) => p !== me?.id) || prev.turn,
          }
        : prev,
    )
    setBusy(true)
    try {
      const g = await api.tictactoeMove(gameId, cell)
      applyGameState(g)
      setLastMoveCell(cell)
    } catch (e: any) {
      // rollback
      try {
        const g = await api.tictactoeGet(gameId)
        applyGameState(g)
      } catch {
        setBoard(board)
      }
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
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-gradient-to-b from-[#f3eeff] via-white to-[#eef4ff]">
      <div className="flex items-center gap-2 border-b border-black/5 bg-white/80 px-3 py-2 backdrop-blur">
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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-ink">Tic Tac Toe</p>
          <p className="text-[11px] font-semibold text-gray-400">Best of 3</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowRequests(true)
            void loadGameRequests()
          }}
          className="rounded-full bg-brand-purple/10 px-3 py-1.5 text-xs font-extrabold text-brand-purple"
        >
          Requests
        </button>
      </div>

      {mode === 'menu' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-purple to-[#5984F2] text-white shadow-lg shadow-brand-purple/25">
            <Sparkles size={28} />
          </div>
          <p className="text-center text-sm font-semibold text-gray-500">Pick a mode to start</p>
          <button
            type="button"
            onClick={() => setMode('solo-diff')}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-brand-purple py-3.5 text-sm font-extrabold text-white shadow-md shadow-brand-purple/20"
          >
            <Bot size={18} /> Play alone
          </button>
          <button
            type="button"
            onClick={() => { setSelectedFriend(null); setMode('pick-friend') }}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-extrabold text-brand-purple shadow-sm ring-1 ring-brand-purple/20"
          >
            <Users size={18} /> Play with a friend
          </button>
        </div>
      )}

      {mode === 'solo-diff' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6">
          <p className="mb-1 text-sm font-extrabold text-ink">Difficulty</p>
          {[
            { d: 1, label: 'Easy', hint: 'Casual' },
            { d: 2, label: 'Medium', hint: 'Blocks & attacks' },
            { d: 3, label: 'Hard', hint: 'Strong play' },
          ].map((row) => (
            <button
              key={row.d}
              type="button"
              onClick={() => startSolo(row.d)}
              className="flex w-full max-w-xs items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-black/5"
            >
              <span className="text-sm font-extrabold text-ink">{row.label}</span>
              <span className="text-xs font-bold text-gray-400">{row.hint}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'pick-friend' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 px-4 pb-1 pt-3 text-xs font-bold text-gray-400">Choose one contact</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {friends.length === 0 && (
              <p className="px-2 py-8 text-center text-sm font-semibold text-gray-400">No contacts yet</p>
            )}
            {friends.map((c: any) => {
              const id = String(c.peerId || c.id)
              const name = c.savedName || c.name || 'Friend'
              const selected = selectedFriend?.id === id
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedFriend({ id, name })}
                  className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    selected
                      ? 'bg-brand-purple/15 ring-2 ring-brand-purple/40'
                      : 'bg-white/90 ring-1 ring-black/5'
                  }`}
                >
                  <Avatar
                    contact={{
                      id,
                      name,
                      photo: c.photo || null,
                      hue: c.hue || ['#7B2CBF', '#6389EB'],
                    }}
                    size={40}
                  />
                  <span className="min-w-0 flex-1 font-extrabold text-ink">{name}</span>
                  {selected ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-purple" aria-label="Selected" />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="shrink-0 border-t border-black/5 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={!selectedFriend || busy}
              onClick={() => void inviteFriend()}
              className="w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {busy && selectedFriend
                ? `Inviting ${selectedFriend.name}…`
                : selectedFriend
                  ? `Invite ${selectedFriend.name}`
                  : 'Select a friend'}
            </button>
          </div>
        </div>
      )}

      {mode === 'waiting' && (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="mb-3 flex gap-1.5">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#E3404C] [animation-delay:-0.3s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#8A2BE2] [animation-delay:-0.15s]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#5984F2]" />
          </div>
          <p className="text-sm font-extrabold text-ink">
            Waiting for {inviteName || selectedFriend?.name || 'friend'}…
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-400">They will get a notification</p>
        </div>
      )}

      {(mode === 'solo' || mode === 'live') && (
        <div className="flex min-h-0 flex-1 flex-col items-center px-4 py-5">
          <div
            className={`grid w-full max-w-sm grid-cols-3 gap-2.5 rounded-3xl p-2 transition ${
              mode === 'live' && myTurnLive ? 'ring-2 ring-brand-purple/35 bg-brand-purple/5' : ''
            }`}
          >
            {board.map((cell, i) => {
              const mine = !!cell && cell === (mode === 'solo' ? 'X' : myMark)
              const isLast = lastMoveCell === i
              return (
                <button
                  key={i}
                  type="button"
                  disabled={
                    busy ||
                    status !== 'play' ||
                    !!cell ||
                    (mode === 'live' && !myTurnLive)
                  }
                  onClick={() => (mode === 'solo' ? playSolo(i) : void playLive(i))}
                  className={`flex aspect-square items-center justify-center rounded-2xl bg-white text-3xl font-black shadow-sm transition active:scale-95 disabled:opacity-90 ${
                    mode === 'live' && myTurnLive && !cell
                      ? 'ring-2 ring-brand-purple/40'
                      : isLast
                        ? mine
                          ? 'ring-2 ring-brand-purple/50'
                          : 'ring-2 ring-[#E3404C]/50'
                        : 'ring-1 ring-black/5'
                  }`}
                >
                  {cell ? (
                    <span className={mine || (mode === 'solo' && cell === 'X') ? 'text-brand-purple' : 'text-[#E3404C]'}>
                      {cell}
                    </span>
                  ) : (
                    <span className="text-transparent">·</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-5 w-full max-w-sm overflow-hidden rounded-[1.35rem] bg-white/90 shadow-[0_8px_30px_rgba(123,44,191,0.12)] ring-1 ring-black/5 backdrop-blur">
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="flex flex-1 items-center gap-2 rounded-2xl bg-brand-purple/10 px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-purple text-[11px] font-black text-white">
                  You
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-purple/70">Score</p>
                  <p className="text-xl font-black tabular-nums leading-none text-brand-purple">{scores.me}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center px-1">
                <span className="rounded-full bg-gradient-to-r from-brand-purple to-[#E3404C] px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
                  SET {setNum}/3
                </span>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-2xl bg-[#E3404C]/10 px-3 py-2.5">
                <div className="min-w-0 flex-1 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#E3404C]/80">Score</p>
                  <p className="text-xl font-black tabular-nums leading-none text-[#E3404C]">{scores.opp}</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E3404C] text-[10px] font-black text-white">
                  {mode === 'solo' ? 'AI' : 'P2'}
                </span>
              </div>
            </div>
            {mode === 'live' && live?.turn && status === 'play' && (
              <p
                className={`mx-3 mb-3 mt-2 rounded-full py-1.5 text-center text-[11px] font-extrabold ${
                  live.turn === me?.id
                    ? 'bg-brand-purple/12 text-brand-purple'
                    : 'bg-[#E3404C]/10 text-[#E3404C]'
                }`}
              >
                {live.turn === me?.id ? 'Your turn to play' : "Opponent's turn"}
              </p>
            )}
            {mode === 'solo' && status === 'play' && (
              <p className="mx-3 mb-3 mt-2 rounded-full bg-gray-50 py-1.5 text-center text-[11px] font-extrabold text-gray-500">
                {soloTurn === 'X' ? 'Your turn' : 'AI thinking…'}
              </p>
            )}
            {status === 'play' && mode === 'live' && !live?.turn && (
              <div className="h-2" />
            )}
            {status === 'play' && mode === 'live' && live?.turn && null}
            {!(mode === 'live' && live?.turn && status === 'play') && mode !== 'solo' && status === 'play' && (
              <div className="h-2" />
            )}
          </div>
          {(status === 'set_over' || status === 'match_over') && (
            <div className="mt-5 w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 text-center shadow-md ring-1 ring-black/5">
              {status === 'match_over' ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Final result</p>
                  <p className="text-lg font-black text-ink">{setMsg || 'Match over'}</p>
                  <div className="flex items-center justify-center gap-6 py-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400">You</p>
                      <p className="text-2xl font-black text-brand-purple">{scores.me}</p>
                    </div>
                    <p className="text-sm font-black text-gray-300">—</p>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400">{mode === 'solo' ? 'AI' : 'Friend'}</p>
                      <p className="text-2xl font-black text-[#E3404C]">{scores.opp}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
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
              ) : (
                <>
                  <p className="text-sm font-extrabold text-ink">{setMsg || 'Set over'}</p>
                  {!matchOver && (
                    <button
                      type="button"
                      className="w-full rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                      onClick={resetBoard}
                    >
                      Next set
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showRequests && (
        <div className="absolute inset-0 z-20 flex flex-col bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowRequests(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
            >
              <ArrowLeft size={20} />
            </button>
            <p className="flex-1 text-sm font-black text-ink">Game requests</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {requests.length === 0 && (
              <p className="px-2 py-10 text-center text-sm font-semibold text-gray-400">No pending requests</p>
            )}
            {requests.map((n: any) => {
              const gid = String(n.game_id || n.metadata?.game_id || '')
              const busy = reqBusy === gid || reqBusy === String(n.id)
              return (
                <div
                  key={n.id}
                  className="mb-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
                >
                  <p className="text-sm font-extrabold text-ink">
                    {n.title || n.actor_name || 'Game invite'}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-gray-400">{n.body || 'Tic tac toe'}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void acceptRequest(n)}
                      className="flex-1 rounded-full bg-brand-purple py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                    >
                      {busy ? '…' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void declineRequest(n)}
                      className="flex-1 rounded-full bg-gray-100 py-2.5 text-xs font-extrabold text-gray-600 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
