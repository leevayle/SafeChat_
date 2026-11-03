import { Wordmark } from './Logo'

/** Tab title — text only, no emblem, matches other tabs' header height */
export function BrandMark() {
  return (
    <div className="flex h-11 items-center">
      <Wordmark className="text-2xl leading-none" />
    </div>
  )
}
