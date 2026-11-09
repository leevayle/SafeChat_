import { motion } from 'framer-motion'

/** Calm logo — soft fade, sequential ripple dots, gentle vertical float */
export function LogoIcon({ size = 112, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      fill="none"
      initial={animate ? { opacity: 0, scale: 0.92 } : false}
      animate={
        animate
          ? { opacity: 1, scale: 1, y: [0, -4, 0] }
          : { opacity: 1, scale: 1 }
      }
      transition={
        animate
          ? {
              opacity: { duration: 0.55, ease: 'easeOut' },
              scale: { duration: 0.55, ease: 'easeOut' },
              y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }
          : undefined
      }
    >
      <defs>
        <linearGradient id="sc-grad" x1="8" y1="100" x2="104" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8C00" />
          <stop offset="0.45" stopColor="#C2308F" />
          <stop offset="1" stopColor="#7B2CBF" />
        </linearGradient>
      </defs>
      <path
        d="M56 8C29.5 8 8 27.2 8 51c0 12.6 6 23.9 15.6 31.8L18 102l22-9.6c5 1.1 10.3 1.6 16 1.6 26.5 0 48-19.2 48-43S82.5 8 56 8Z"
        fill="url(#sc-grad)"
      />
      {[36, 56, 76].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy={51}
          r={5.5}
          fill="#fff"
          initial={{ opacity: 0.35, cy: 51 }}
          animate={
            animate
              ? { opacity: [0.35, 1, 0.35], cy: [51, 46, 51] }
              : { opacity: 1, cy: 51 }
          }
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.22,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.svg>
  )
}

/** Brand wordmark — absolute hex colors (never follow theme). */
export function Wordmark({ className = 'text-4xl' }: { className?: string }) {
  return (
    <p className={`font-display tracking-tight ${className}`}>
      <span style={{ color: '#E3404C' }}>Safe</span>
      <span style={{ color: '#7B2CBF' }}>Chat</span>
      <span style={{ color: '#6389EB' }}>.</span>
    </p>
  )
}
