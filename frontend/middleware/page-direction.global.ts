// Dirección del swipe entre páginas: según el orden de la navegación,
// ir a una página posterior desliza hacia la izquierda y a una anterior hacia la derecha.
// Se publica como variable CSS (--page-dir: 1 | -1 | 0) en vez de cambiar el nombre de la
// transición: el nombre lo lee Vue al renderizar y llegaba un cambio tarde; la variable se
// resuelve al aplicar las clases, ya con la dirección de esta navegación.
const ORDER = ['/', '/lista', '/visor', '/anuncios', '/cuentas']

export default defineNuxtRouteMiddleware((to, from) => {
  if (import.meta.server) return
  const a = ORDER.indexOf(from.path)
  const b = ORDER.indexOf(to.path)
  const dir = a < 0 || b < 0 || a === b ? 0 : b > a ? 1 : -1
  document.documentElement.style.setProperty('--page-dir', String(dir))
})
