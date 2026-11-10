import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavRail, type RailItem } from './NavRail'
import { EmptyChatPane } from './EmptyChatPane'
import { BottomNav, type Tab } from '../BottomNav'

const SIDEBAR_KEY = 'sc_sidebar_width'
const RIGHT_KEY = 'sc_right_width_v2'
const DEFAULT_SIDEBAR = 360
const MIN_SIDEBAR = 280
const MAX_SIDEBAR = 460
const DEFAULT_RIGHT = 400
const MIN_RIGHT = 320
const MAX_RIGHT = 520

type Props = {
  tab: Tab
  railActive: RailItem
  badges: Partial<Record<RailItem, number>>
  onRailSelect: (item: RailItem) => void
  sidebar: ReactNode
  main: ReactNode
  showEmpty?: boolean
  emptyTitle?: string
  emptySubtitle?: string
  /** Right context column — contacts, settings, profile info, etc. */
  rightPanel?: ReactNode | null
  overlays?: ReactNode
  onLogout?: () => void
  loading?: boolean
  /**
   * Foldable dual-pane:
   * left = home feed + mobile bottom nav (no side rail)
   * right = inbox
   */
  compact?: boolean
  onTabChange?: (t: Tab) => void
}

export function DesktopShell({
  tab,
  railActive,
  badges,
  onRailSelect,
  sidebar,
  main,
  showEmpty = false,
  emptyTitle,
  emptySubtitle,
  rightPanel = null,
  overlays,
  onLogout,
  loading,
  compact = false,
  onTabChange,
}: Props) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(SIDEBAR_KEY))
      if (n >= MIN_SIDEBAR && n <= MAX_SIDEBAR) return n
    } catch {
      /* */
    }
    return DEFAULT_SIDEBAR
  })
  const [rightWidth, setRightWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(RIGHT_KEY))
      if (n >= MIN_RIGHT && n <= MAX_RIGHT) return n
    } catch {
      /* */
    }
    return DEFAULT_RIGHT
  })

  const dragSide = useRef<'left' | 'right' | null>(null)
  const startX = useRef(0)
  const startW = useRef(0)

  useEffect(() => {
    if (compact) return
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth))
    } catch {
      /* */
    }
  }, [sidebarWidth, compact])

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_KEY, String(rightWidth))
    } catch {
      /* */
    }
  }, [rightWidth])

  const onResizeStart = useCallback(
    (which: 'left' | 'right') => (e: React.MouseEvent) => {
      if (compact) return
      e.preventDefault()
      dragSide.current = which
      startX.current = e.clientX
      startW.current = which === 'left' ? sidebarWidth : rightWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [sidebarWidth, rightWidth, compact],
  )

  useEffect(() => {
    if (compact) return
    const onMove = (e: MouseEvent) => {
      if (!dragSide.current) return
      if (dragSide.current === 'left') {
        const delta = e.clientX - startX.current
        setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startW.current + delta)))
      } else {
        const delta = startX.current - e.clientX
        setRightWidth(Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, startW.current + delta)))
      }
    }
    const onUp = () => {
      if (!dragSide.current) return
      dragSide.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [compact])

  const hasRight = !compact && rightPanel != null

  const mainPane = showEmpty ? (
    <EmptyChatPane title={emptyTitle} subtitle={emptySubtitle} />
  ) : (
    <div className="conversation-pane sc-surface sc-center-bg flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
      {main}
    </div>
  )

  const tabBadges: Partial<Record<Tab, number>> = {
    chats: badges.chats || 0,
    groups: badges.groups || 0,
    status: badges.status || 0,
    calls: badges.calls || 0,
  }

  /* Foldable: [home feed + bottom nav] 50% | inbox 50% — no side rail */
  if (compact) {
    return (
      <div className="desktop-shell flex h-dvh w-full min-w-0 overflow-hidden sc-shell-bg bg-[#dfe3e8]">
        <div className="relative flex h-full min-w-0 w-1/2 shrink-0 flex-col border-r border-black/[0.06] dark:border-white/10">
          <div className="desktop-sidebar sc-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#121821]">
            {sidebar}
          </div>
          <div className="relative h-[5.25rem] shrink-0">
            <BottomNav
              tab={tab}
              onChange={(t) => {
                onTabChange?.(t)
                onRailSelect(t)
              }}
              badges={tabBadges}
            />
          </div>
        </div>
        <div className="relative flex h-full min-w-0 w-1/2 flex-1 flex-col overflow-hidden sc-center-bg">
          {mainPane}
        </div>
        {overlays}
      </div>
    )
  }

  return (
    <div className="desktop-shell flex h-dvh w-full min-w-0 overflow-hidden sc-shell-bg bg-[#dfe3e8]">
      <NavRail active={railActive} badges={badges} onSelect={onRailSelect} onLogout={onLogout} loading={loading} />

      <div
        className="relative flex h-full shrink-0 flex-col sc-surface border-r border-black/8 bg-white"
        style={{ width: sidebarWidth }}
      >
        <div className="desktop-sidebar flex h-full min-h-0 flex-col overflow-hidden">{sidebar}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat list"
          onMouseDown={onResizeStart('left')}
          className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize hover:bg-brand-purple/20 active:bg-brand-purple/30"
        />
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden sc-center-bg">
        {mainPane}
      </div>

      {hasRight && (
        <div
          className="relative flex h-full shrink-0 flex-col sc-surface border-l border-black/8 bg-white"
          style={{ width: rightWidth }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            onMouseDown={onResizeStart('right')}
            className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-brand-purple/20 active:bg-brand-purple/30"
          />
          <div className="desktop-right flex h-full min-h-0 flex-col overflow-hidden">{rightPanel}</div>
        </div>
      )}

      {overlays}
    </div>
  )
}
