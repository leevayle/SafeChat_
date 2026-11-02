import { LogoIcon, Wordmark } from './Logo'

export function BrandMark() {
  return (
    <div className="flex items-center gap-2 mt-5 mb-5 pt-2">
      <LogoIcon size={32} animate={false} />
      <Wordmark className="text-2xl" />
    </div>
  )
}
