// Tema claro/oscuro.
//
// Tres estados: 'auto' (sigue la configuración del celular), 'light', 'dark'.
// El modo elegido se guarda en el navegador y se aplica poniendo
// data-theme en <html>, que es lo que leen las variables de index.css.

const CLAVE = 'pechugon-tema'
export const TEMAS = ['auto', 'light', 'dark']

export function leerTema() {
  try {
    const t = localStorage.getItem(CLAVE)
    return TEMAS.includes(t) ? t : 'auto'
  } catch { return 'auto' }
}

export function aplicarTema(tema) {
  const raiz = document.documentElement
  if (tema === 'auto') raiz.removeAttribute('data-theme')
  else raiz.setAttribute('data-theme', tema)
  try { localStorage.setItem(CLAVE, tema) } catch { /* modo privado */ }
  actualizarColorBarra()
}

/** El que se ve realmente ahora mismo, resolviendo 'auto'. */
export function temaEfectivo(tema = leerTema()) {
  if (tema !== 'auto') return tema
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Pinta la barra de estado del celular del color del fondo de la app. */
function actualizarColorBarra() {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-base').trim()
  if (!color) return
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}

/** Se llama una vez al arrancar, antes de pintar. */
export function iniciarTema() {
  aplicarTema(leerTema())
  // Si está en 'auto', seguir los cambios del sistema en vivo
  window.matchMedia?.('(prefers-color-scheme: light)')
    .addEventListener?.('change', () => {
      if (leerTema() === 'auto') actualizarColorBarra()
    })
}
