import { LogoIcon, Wordmark } from '../Logo'
import { useStore } from '../../store'

type Props = {
  title?: string
  subtitle?: string
}

/** Static empty state — outlined logo; follows light/dark like the rest of the UI. */
export function EmptyChatPane({
  subtitle = 'Select a chat to start messaging.',
}: Props) {
  const colorMode = useStore((s) => s.settings.colorMode)
  const isDark =
    String(colorMode || 'light').toLowerCase() === 'dark' ||
    (typeof document !== 'undefined' &&
      (document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-mode') === 'dark'))

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center px-8 text-center ${
        isDark ? 'bg-[#121821]' : 'bg-white'
      }`}
    >
      <div className="flex flex-col items-center">
        <LogoIcon size={120} animate={false} outlined />
        <div className="mt-4">
          <Wordmark light className="text-[2.5rem] leading-none font-medium" />
        </div>
        <p
          className={`mt-5 max-w-sm text-[15px] font-semibold ${
            isDark ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  )
}
