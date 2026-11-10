import { LogoIcon, Wordmark } from '../Logo'
import { useStore } from '../../store'

type Props = {
  title?: string
  subtitle?: string
}

/** Static empty state — thin outlined logo; same bg as chats feed. */
export function EmptyChatPane({
  subtitle = 'Select a chat to start messaging.',
}: Props) {
  const colorMode = useStore((s) => s.settings.colorMode)
  const isDark = String(colorMode || 'light').toLowerCase() === 'dark'

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-8 text-center"
      style={{ background: isDark ? '#121821' : '#ffffff' }}
    >
      <div className="flex flex-col items-center">
        <LogoIcon size={120} animate={false} outlined />
        <div className="mt-4">
          <Wordmark className="text-[2.5rem] leading-none" />
        </div>
        <p
          className="mt-5 max-w-sm text-[15px] font-semibold"
          style={{ color: isDark ? '#9ca3af' : '#6b7280' }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  )
}
