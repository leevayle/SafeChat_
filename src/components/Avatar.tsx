type ContactLike = {
  id: string
  name: string
  photo?: string | null
  online?: boolean
  hue?: [string, string]
}

export function Avatar({
  contact,
  size = 48,
  ring = false,
}: {
  contact: ContactLike
  size?: number
  ring?: boolean
}) {
  const [a, b] = contact.hue || ['#7B2CBF', '#6389EB']
  const initials = contact.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const body = contact.photo ? (
    <img
      src={contact.photo}
      alt=""
      className="h-full w-full rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex items-center justify-center rounded-full text-white font-extrabold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        fontSize: size * 0.32,
      }}
    >
      {initials}
    </span>
  )

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {ring ? (
        <span className="rounded-full p-[2px] ring-[2.5px] ring-brand-purple">{body}</span>
      ) : (
        body
      )}

      {/* //online status indicator

      {contact.online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-green-500 ring-2 ring-white"
          style={{ width: size * 0.22, height: size * 0.22 }}
        />
      )} */}

    </span>
  )
}
