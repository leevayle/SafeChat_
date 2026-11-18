import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LogoIcon, Wordmark } from './Logo'

type Props = {
  children: ReactNode
  /** Optional compact fallback (e.g. a single list row) */
  fallback?: ReactNode
  label?: string
}

type State = { error: Error | null; key: number }

/**
 * Prevents a single subtree crash from wiping the whole app to a blank page.
 * Retry remounts children via a key bump so the tree fully re-initializes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error('[SafeChat ErrorBoundary]', this.props.label || 'ui', error, info?.componentStack)
    } catch {
      /* */
    }
  }

  private reset = () => {
    this.setState((s) => ({ error: null, key: s.key + 1 }))
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full min-h-[16rem] w-full flex-col items-center justify-center gap-4 bg-white px-6 text-center dark:bg-[#0b141a]">
          <div className="flex flex-col items-center gap-2">
            <LogoIcon size={88} animate />
            <Wordmark className="text-2xl leading-none" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-extrabold text-ink dark:text-gray-100">Something went wrong</p>
            <p className="max-w-xs text-xs font-semibold text-gray-500 dark:text-gray-400">
              This screen hit an error. You can retry without losing your session.
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="mt-1 rounded-full bg-brand-purple px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition active:scale-[0.98] hover:opacity-95"
          >
            Try again
          </button>
        </div>
      )
    }
    return (
      // key forces a full remount of the tree on retry so state resets cleanly
      <div key={this.state.key} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    )
  }
}
