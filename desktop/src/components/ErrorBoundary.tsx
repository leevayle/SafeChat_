import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Optional compact fallback (e.g. a single list row) */
  fallback?: ReactNode
  label?: string
}

type State = { error: Error | null }

/**
 * Prevents a single subtree crash from wiping the whole app to a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error('[SafeChat ErrorBoundary]', this.props.label || 'ui', error, info?.componentStack)
    } catch {
      /* */
    }
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full min-h-[12rem] w-full flex-col items-center justify-center gap-3 bg-white px-6 text-center dark:bg-[#0b141a]">
          <p className="text-sm font-extrabold text-ink dark:text-gray-100">Something went wrong</p>
          <p className="max-w-xs text-xs font-semibold text-gray-500">
            This screen hit an error. You can retry without losing your session.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
