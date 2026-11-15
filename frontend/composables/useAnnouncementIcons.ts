// Librería de íconos para anuncios. Los SVG propios (assets/icons/announcements) son la librería base:
// usan currentColor, así que toman el color del texto donde se muestren. Las imágenes subidas por
// la cuenta siguen disponibles, pero un SVG con el mismo nombre las reemplaza.
const BUILTIN = [
  { name: 'estrella-de-david', label: 'Estrella de David' },
  { name: 'edades', label: 'Edades' },
  { name: 'edades-numeradas', label: 'Edades numeradas' },
  { name: 'ultimas-4-edades', label: 'Últimas 4 edades' },
  { name: 'ultimas-4-edades-numeradas', label: 'Últimas 4 edades numeradas' },
  { name: 'piedra-angular', label: 'Piedra angular' },
  { name: 'flecha-y-edades', label: 'Flecha y edades' },
  { name: 'flecha-arriba', label: 'Flecha arriba' },
  { name: 'flecha-abajo', label: 'Flecha abajo' },
  { name: 'flecha-izquierda', label: 'Flecha izquierda' },
  { name: 'flecha-derecha', label: 'Flecha derecha' },
]

export const BUILTIN_ICONS = BUILTIN.map(i => ({ ...i, icon: `ann:${i.name}`, url: '', builtin: true }))
const builtinNames = new Set(BUILTIN.map(i => i.name))

const mediaIcons = ref<any[]>([])
let isFetched = false

export const useAnnouncementIcons = () => {
    const { getMedia, getFullUrl } = useApi()

    const fetchMediaIcons = async () => {
        try {
            const mediaList = await getMedia()
            mediaIcons.value = mediaList
                .filter(m => m.type === 'image' && !builtinNames.has(m.name))
                .map(m => ({
                    name: m.name,
                    label: m.name,
                    icon: '',
                    url: getFullUrl(m.url)
                }))
            isFetched = true
        } catch (e) {
            console.error('Error fetching media icons', e)
        }
    }

    // Auto-fetch once on client if not already fetched
    if (!isFetched && typeof window !== 'undefined') {
        isFetched = true // prevent double fetch
        fetchMediaIcons()
    }

    return {
        icons: computed(() => [...BUILTIN_ICONS, ...mediaIcons.value]),
        fetchMediaIcons
    }
}

/** Clases de un ícono en el texto: los SVG de la librería se ven más grandes que un ícono de interfaz. */
export const iconClass = (def: { builtin?: boolean } | undefined, extra = '') =>
    def?.builtin
        ? `inline-block align-text-bottom mx-[0.15em] size-[1.5em] ${extra}`.trim()
        : `inline-block align-text-bottom mb-1 size-[1.1em] ${extra}`.trim()
