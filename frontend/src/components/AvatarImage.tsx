import { useEffect, useState } from 'react'
import { mediaUrl } from '../lib/format'

const AVATAR_PLACEHOLDER = '/avatar-placeholder.svg'

type Props = {
  src?: string | null
  alt?: string
  className?: string
}

export function AvatarImage({ src, alt = '', className = 'h-full w-full object-cover' }: Props) {
  const [currentSrc, setCurrentSrc] = useState(() => mediaUrl(src) ?? AVATAR_PLACEHOLDER)

  useEffect(() => {
    setCurrentSrc(mediaUrl(src) ?? AVATAR_PLACEHOLDER)
  }, [src])

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => setCurrentSrc(AVATAR_PLACEHOLDER)}
    />
  )
}
