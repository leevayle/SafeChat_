import { motion } from 'framer-motion'

/** Calm logo — soft fade, sequential ripple dots, gentle vertical float */
export function LogoIcon({
  size = 112,
  animate = true,
  outlined = false,
}: {
  size?: number
  animate?: boolean
  /** Stroke/outline style instead of solid fill (empty states) */
  outlined?: boolean
}) {
  const gradId = outlined ? 'sc-grad-outline' : 'sc-grad'
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      fill="none"
      initial={animate ? { opacity: 0, scale: 0.92 } : false}
      animate={
        animate && !outlined
          ? { opacity: 1, scale: 1, y: [0, -4, 0] }
          : { opacity: 1, scale: 1 }
      }
      transition={
        animate && !outlined
          ? {
              opacity: { duration: 0.55, ease: 'easeOut' },
              scale: { duration: 0.55, ease: 'easeOut' },
              y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }
          : undefined
      }
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="100" x2="104" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8C00" />
          <stop offset="0.45" stopColor="#C2308F" />
          <stop offset="1" stopColor="#7B2CBF" />
        </linearGradient>
      </defs>
      <path
        d="M56 8C29.5 8 8 27.2 8 51c0 12.6 6 23.9 15.6 31.8L18 102l22-9.6c5 1.1 10.3 1.6 16 1.6 26.5 0 48-19.2 48-43S82.5 8 56 8Z"
        fill={outlined ? 'none' : `url(#${gradId})`}
        stroke={outlined ? `url(#${gradId})` : undefined}
        strokeWidth={outlined ? 2.25 : undefined}
        strokeLinejoin="round"
      />
      {[36, 56, 76].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy={51}
          r={outlined ? 4.5 : 5.5}
          fill={outlined ? 'none' : '#fff'}
          stroke={outlined ? `url(#${gradId})` : undefined}
          strokeWidth={outlined ? 1.25 : undefined}
          initial={{ opacity: 1, cy: 51 }}
          animate={
            animate && !outlined
              ? { opacity: [0.35, 1, 0.35], cy: [51, 46, 51] }
              : { opacity: 1, cy: 51 }
          }
          transition={
            animate && !outlined
              ? {
                  duration: 1.4,
                  repeat: Infinity,
                  delay: i * 0.22,
                  ease: 'easeInOut',
                }
              : undefined
          }
        />
      ))}
    </motion.svg>
  )
}

/** Brand wordmark — absolute hex colors (never follow theme). */
export function Wordmark({
  className = 'text-4xl',
  light = false,
}: {
  className?: string
  /** Lighter weight for empty states; dot stays bold */
  light?: boolean
}) {
  return (
    <p className={`font-display tracking-tight ${className}`}>
      <span style={{ color: '#E3404C', fontWeight: light ? 500 : undefined }}>Safe</span>
      <span style={{ color: '#7B2CBF', fontWeight: light ? 500 : undefined }}>Chat</span>
      <span style={{ color: '#6389EB', fontWeight: 800 }}>.</span>
    </p>
  )
}
