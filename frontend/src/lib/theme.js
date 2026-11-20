export const getTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
export function applyTheme(t) {
  const h = document.documentElement
  h.classList.add('theme-fade')
  h.classList.toggle('dark', t === 'dark')
  try { localStorage.setItem('theme', t) } catch {}
  setTimeout(() => h.classList.remove('theme-fade'), 400)
}
export function initTheme() {
  let t = null
  try { t = localStorage.getItem('theme') } catch {}
  document.documentElement.classList.toggle('dark', (t ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark')
}
