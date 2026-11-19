# SafeChat Desktop Layout

WhatsApp Desktop–style shell for viewports **≥ 900px**. Mobile (`< 900px`) keeps the original single-column + bottom nav behavior.

## Shell structure

| Region | Width | Content |
|--------|-------|---------|
| **Nav rail** | 64px | Chats, Groups, Status, Calls, Contacts, Settings, Profile |
| **Sidebar** | 280–480px (resizable, persisted) | Conversation list / Groups / Status / Calls |
| **Main pane** | flex | Active chat/group, or empty state |
| **Info drawer** | ~340px | Contact details (slide-in, Esc closes, persisted) |

## Files added

- `src/hooks/useMediaQuery.ts` — breakpoint helper (`DESKTOP_BREAKPOINT = 900`)
- `src/components/desktop/NavRail.tsx`
- `src/components/desktop/EmptyChatPane.tsx`
- `src/components/desktop/InfoDrawer.tsx`
- `src/components/desktop/DesktopShell.tsx` — grid shell, resize handle, drawer state

## Files changed

- `src/App.tsx` — dual layout (desktop shell vs mobile); overlays as modals/drawers on desktop; auth card centered on branded background
- `src/screens/ChatWindow.tsx` — back button hidden on `md+`; header click toggles info drawer on desktop
- `src/index.css` — desktop density, scrollbars, auth background, sidebar list tightening

## Behavior preserved

- All API modules, store, auth keys (`sc_access` / `sc_refresh`), onboarding sequence
- Stubbed calls / typing / rings still visible
- Overlays: New Chat, New Group, Settings, Contacts, Notifications, Support, Status viewer, Call UI
- Sidebar width → `localStorage.sc_sidebar_width`
- Info drawer open → `localStorage.sc_info_drawer_open`

## Responsive

Below 900px the app renders the previous mobile shell (`max-w-[430px]`, `BottomNav`, full-screen chat overlays).
