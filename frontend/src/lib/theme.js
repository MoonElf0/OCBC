import { useEffect, useState } from 'react'

export const getTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

export function applyTheme(t) {
  const h = document.documentElement
  h.classList.add('theme-fade')
  h.classList.toggle('dark', t === 'dark')
  try {
    localStorage.setItem('theme', t)
  } catch {}
  setTimeout(() => h.classList.remove('theme-fade'), 400)
}

/** The current theme, and a setter that saves it. Follows the system until the person picks one. */
export function useTheme() {
  const [theme, setTheme] = useState(getTheme)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const follow = (e) => {
      let saved = null
      try {
        saved = localStorage.getItem('theme')
      } catch {}
      if (saved) return
      document.documentElement.classList.toggle('dark', e.matches)
      setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [])
  return [
    theme,
    (t) => {
      applyTheme(t)
      setTheme(t)
    },
  ]
}
