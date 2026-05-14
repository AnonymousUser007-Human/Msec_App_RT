import { useEffect, useState } from 'react'

/** Hauteur visible (clavier virtuel inclus) pour éviter le vide entre le fil et le clavier sur mobile. */
export function useLayoutViewportHeight(): number {
  const [h, setH] = useState(() =>
    typeof window !== 'undefined' ? window.visualViewport?.height ?? window.innerHeight : 0,
  )

  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      setH(vv?.height ?? window.innerHeight)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return h
}
