import { motion } from 'framer-motion'

export function Loading() {
  return (
    <div className="flex h-full flex-col items-center px-8 safe-pt safe-pb">
      <div className="mt-[18%] flex flex-col items-center text-center">
        <h2 className="font-ui text-[1.85rem] font-black leading-tight text-ink sm:text-[2rem]">
          Let&apos;s get your
          <br />
          <span className="text-brand-red">On</span>{' '}
          <span className="text-brand-purple">board!</span>
        </h2>
        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="h-[5px] w-5 rounded-full bg-brand-blue" />
          <span className="h-[5px] w-5 rounded-full bg-brand-blue" />
          <span className="h-[5px] w-5 rounded-full bg-gray-300" />
        </div>
      </div>

      <div className="relative mt-14 w-full max-w-[300px] space-y-4 opacity-40">
        <div className="h-12 rounded-full border border-gray-200 bg-white px-5" />
        <div className="h-12 rounded-full border border-gray-200 bg-white px-5" />
      </div>

      <div className="flex-1" />

      {/* Clean loading dots — no outline / ring */}
      <div className="mb-8 flex h-[52px] w-full max-w-[280px] items-center justify-center">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-brand-purple"
              animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
