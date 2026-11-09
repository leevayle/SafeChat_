import { Wordmark } from './Logo'

/**
 * Text-only brand for tab headers.
 * No emblem, no extra vertical margins — keeps Groups/Status/Calls header height unchanged.
 */
export function BrandMark() {
  return (
    <div className="flex items-center">
      <Wordmark className="text-2xl leading-none" />
    </div>
  )
}
